// Smoke test of a deployed GreenCall dashboard (Production, Preview or the local QA server).
//   GREENCALL_SMOKE_URL=https://... [GREENCALL_SMOKE_ADMIN_KEY=***] node tools/prod-smoke.mjs
// Phase 1 (always): ANONYMOUS public consultation — every public tab draws, admin tabs are absent
//   from navigation, direct #physical/#quality/#admin URLs fall back to the overview, and the
//   admin-only APIs answer 401/403/503 without data.
// Phase 2 (only when GREENCALL_SMOKE_ADMIN_KEY is configured): the Administrador button unlocks the
//   three admin tabs. The key comes only from the environment (CI secret) and is never printed.
// Output: aggregate counts only (no operational data), safe for a public repository's logs.
import { createRequire } from 'node:module';

const url = process.env.GREENCALL_SMOKE_URL, adminKey = process.env.GREENCALL_SMOKE_ADMIN_KEY || '';
if (!url) { console.log(JSON.stringify({ ok: false, skipped: true, reason: 'GREENCALL_SMOKE_URL not configured' })); process.exit(0); }
const { chromium } = createRequire(import.meta.url)('playwright');
const PUBLIC_PAGES = ['overview', 'inventory', 'consumptions', 'dispatch', 'rotation', 'policy', 'abc', 'forecast', 'planning', 'charges', 'workshop', 'technicians'];
const ADMIN_PAGES = ['physical', 'quality', 'admin'];
const summary = { ok: true, public: {}, admin: adminKey ? {} : { skipped: 'GREENCALL_SMOKE_ADMIN_KEY not configured' }, api: {}, failures: [] };
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });

async function visit(page, ids, name, stats) {
  for (const id of ids) {
    await page.evaluate(p => { location.hash = p; }, id);
    await page.waitForFunction(() => !document.querySelector('#content .loader'), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const plots = [...document.querySelectorAll('#content .plot')];
      const visible = plots.filter(p => { const s = p.querySelector('svg.main-svg')?.getBoundingClientRect(); return s && s.width > 120 && s.height > 120 && (p.data || []).length > 0; }).length;
      const empty = plots.filter(p => p.querySelector('.empty-state')).length;
      return { hash: location.hash, plots: plots.length, visible, empty, tables: document.querySelectorAll('#content table').length, rows: document.querySelectorAll('#content tbody tr').length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    stats.pages++; stats.charts += r.plots; stats.charts_visible += r.visible; stats.charts_empty_state += r.empty; stats.tables += r.tables; stats.table_rows += r.rows; if (r.overflow) stats.overflow_pages++;
    if (r.hash !== '#' + id) summary.failures.push(`${name}/${id}: redirigido a ${r.hash}`);
    if (r.plots !== r.visible + r.empty) summary.failures.push(`${name}/${id}: ${r.plots - r.visible - r.empty} gráfico(s) en blanco`);
    if (r.overflow) summary.failures.push(`${name}/${id}: overflow horizontal`);
  }
}
const navIds = page => page.evaluate(() => [...document.querySelectorAll('#nav [data-page]')].map(a => a.dataset.page));

try {
  // Anonymous API boundary (no cookies at all).
  for (const path of ['/api/dashboard', '/api/status', '/api/rows?type=google_consumos', '/api/sheets/status', '/api/physical/batches', '/api/exports?type=consumptions', '/api/exports?type=abc']) {
    const r = await fetch(url + path, { redirect: 'manual' }); summary.api[path.split('?')[0] + (path.includes('type=') ? '?' + path.split('?')[1] : '')] = r.status;
  }
  const expectOpen = ['/api/dashboard', '/api/status', '/api/exports?type=abc'];
  for (const [path, status] of Object.entries(summary.api)) {
    const open = expectOpen.includes(path);
    if (open && status !== 200) summary.failures.push(`api ${path}: ${status} (debe ser público)`);
    if (!open && ![401, 403, 503].includes(status)) summary.failures.push(`api ${path}: ${status} (debe ser solo admin)`);
  }
  const anon = await (await fetch(url + '/api/dashboard')).json();
  if (anon.access?.role !== 'public' || 'quality' in anon || 'physical' in anon) summary.failures.push('api /api/dashboard: la respuesta pública no está saneada');

  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } }), page = await context.newPage();
    const jsErrors = [], httpErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message.slice(0, 120)));
    page.on('response', r => { if (r.status() >= 400) httpErrors.push(r.status() + ' ' + new URL(r.url()).pathname); });
    await page.goto(url + '/#overview', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#content .kpi') && !document.querySelector('#content .loader'), null, { timeout: 90000 });
    const stats = { pages: 0, charts: 0, charts_visible: 0, charts_empty_state: 0, tables: 0, table_rows: 0, overflow_pages: 0 };
    const nav = await navIds(page);
    for (const id of ADMIN_PAGES) if (nav.includes(id)) summary.failures.push(`${name}: pestaña ${id} visible sin administrador`);
    if (await page.locator('#accessToken').count()) summary.failures.push(`${name}: se solicita clave para la consulta pública`);
    await visit(page, PUBLIC_PAGES, name + '/public', stats);
    for (const id of ADMIN_PAGES) {
      await page.goto(url + '/#' + id, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.querySelector('#content .loader'), null, { timeout: 60000 }); await page.waitForTimeout(600);
      const hash = await page.evaluate(() => location.hash);
      if (hash === '#' + id) summary.failures.push(`${name}: #${id} accesible sin administrador`);
    }
    if (adminKey) {
      const admin = { pages: 0, charts: 0, charts_visible: 0, charts_empty_state: 0, tables: 0, table_rows: 0, overflow_pages: 0 };
      await page.click('#adminButton'); await page.fill('#adminToken', adminKey); await page.click('#adminSubmit');
      await page.waitForFunction(() => document.querySelector('#nav [data-page="physical"]'), null, { timeout: 90000 });
      const navAdmin = await navIds(page);
      for (const id of ADMIN_PAGES) if (!navAdmin.includes(id)) summary.failures.push(`${name}/admin: falta la pestaña ${id}`);
      await visit(page, ADMIN_PAGES, name + '/admin', admin);
      summary.admin[name] = admin;
      await page.click('#adminButton');
      await page.waitForFunction(() => !document.querySelector('#nav [data-page="physical"]'), null, { timeout: 60000 });
    }
    // 401 on admin-only APIs is the expected boundary for visitors; 503 only for the optional physical writer.
    const unexpected = httpErrors.filter(e => !/^(401|403) \/api\/(rows|sheets|physical|exports)/.test(e) && !/^503 \/api\/physical\//.test(e));
    if (unexpected.length) summary.failures.push(`${name}: HTTP ${[...new Set(unexpected)].join(', ')}`);
    if (jsErrors.length) summary.failures.push(`${name}: ${jsErrors.length} error(es) JavaScript` + (process.env.SMOKE_DEBUG === '1' ? ' :: ' + jsErrors.join(' || ') : ''));
    summary.public[name] = { ...stats, js_errors: jsErrors.length, http_errors: [...new Set(httpErrors)] };
    await context.close();
  }
} catch (error) { summary.failures.push('ejecución: ' + String(error.message).split('\n')[0].slice(0, 160)); }
finally { await browser.close(); }
summary.ok = summary.failures.length === 0;
console.log(JSON.stringify(summary));
process.exit(summary.ok ? 0 : 1);
