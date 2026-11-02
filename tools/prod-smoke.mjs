// Authenticated smoke test of a deployed GreenCall dashboard (Production or Preview).
//   GREENCALL_SMOKE_URL=https://... GREENCALL_SMOKE_ACCESS_KEY=*** node tools/prod-smoke.mjs
// The key comes only from the environment (CI secret); it is never printed. Output is
// aggregate counts only (no operational data), safe for a public repository's logs.
import { createRequire } from 'node:module';

const url = process.env.GREENCALL_SMOKE_URL, key = process.env.GREENCALL_SMOKE_ACCESS_KEY;
if (!url || !key) { console.log(JSON.stringify({ ok: false, skipped: true, reason: 'GREENCALL_SMOKE_URL / GREENCALL_SMOKE_ACCESS_KEY not configured' })); process.exit(0); }
const { chromium } = createRequire(import.meta.url)('playwright');
const PAGES = ['overview', 'inventory', 'consumption', 'dispatch', 'rotation', 'policy', 'abc', 'forecast', 'planning', 'charges', 'workshop', 'technicians', 'physical', 'quality'];
const summary = { ok: true, viewports: {}, failures: [] };
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
try {
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } }), page = await context.newPage();
    // JS exceptions are failures. HTTP errors are reported by path (no query/data); only the optional
    // physical-count module may answer 503 SIN_CREDENCIALES when its writer is not configured.
    const jsErrors = [], httpErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message.slice(0, 120)));
    page.on('response', r => { if (r.status() >= 500 || (r.status() >= 400 && r.status() !== 401)) { const path = new URL(r.url()).pathname; httpErrors.push(r.status() + ' ' + path); } });
    await page.goto(url + '/#overview', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#accessToken', { timeout: 30000 });
    await page.fill('#accessToken', key); await page.click('#accessSubmit');
    await page.waitForFunction(() => !document.getElementById('accessToken') && !document.querySelector('#content .loader'), null, { timeout: 90000 });
    const stats = { pages: 0, charts: 0, charts_visible: 0, charts_empty_state: 0, tables: 0, table_rows: 0, overflow_pages: 0 };
    for (const id of PAGES) {
      await page.evaluate(p => { location.hash = p; }, id);
      await page.waitForFunction(() => !document.querySelector('#content .loader'), null, { timeout: 60000 });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => {
        const plots = [...document.querySelectorAll('#content .plot')];
        const visible = plots.filter(p => { const s = p.querySelector('svg.main-svg')?.getBoundingClientRect(); return s && s.width > 120 && s.height > 120 && (p.data || []).length > 0; }).length;
        const empty = plots.filter(p => p.querySelector('.empty-state')).length;
        return { plots: plots.length, visible, empty, tables: document.querySelectorAll('#content table').length, rows: document.querySelectorAll('#content tbody tr').length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      stats.pages++; stats.charts += r.plots; stats.charts_visible += r.visible; stats.charts_empty_state += r.empty; stats.tables += r.tables; stats.table_rows += r.rows; if (r.overflow) stats.overflow_pages++;
      if (r.plots !== r.visible + r.empty) summary.failures.push(`${name}/${id}: ${r.plots - r.visible - r.empty} gráfico(s) en blanco`);
      if (r.overflow) summary.failures.push(`${name}/${id}: overflow horizontal`);
    }
    const unexpected = httpErrors.filter(e => !/^503 \/api\/physical\//.test(e));
    if (unexpected.length) summary.failures.push(`${name}: HTTP ${[...new Set(unexpected)].join(', ')}`);
    if (jsErrors.length) summary.failures.push(`${name}: ${jsErrors.length} error(es) JavaScript` + (process.env.SMOKE_DEBUG === '1' ? ' :: ' + jsErrors.join(' || ') : ''));
    summary.viewports[name] = { ...stats, js_errors: jsErrors.length, http_errors: [...new Set(httpErrors)] };
    await context.close();
  }
} catch (error) { summary.failures.push('ejecución: ' + String(error.message).split('\n')[0].slice(0, 160)); }
finally { await browser.close(); }
summary.ok = summary.failures.length === 0;
console.log(JSON.stringify(summary));
process.exit(summary.ok ? 0 : 1);
