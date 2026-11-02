// Real-browser chart rendering contract: the app stylesheet + local Plotly must draw
// visible charts (full-size SVG layers, filled marks), not just create DOM nodes.
// Synthetic data only. Skips when Playwright/Chromium is unavailable (e.g. plain CI).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}
const executablePath = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';

async function page() {
  const browser = await chromium.launch(await fs.access(executablePath).then(() => ({ executablePath }), () => ({})));
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const css = await fs.readFile(path.join(root, 'public/assets/styles.css'), 'utf8');
  await p.setContent(`<!doctype html><html><head><style>${css}</style></head><body><main><div class="charts">
    <article class="chart-card"><div class="chart-head"><strong>Barras</strong></div><div class="plot" id="bars"></div></article>
    <article class="chart-card"><div class="chart-head"><strong>Tendencia</strong></div><div class="plot" id="trend"></div></article>
    <article class="chart-card"><div class="chart-head"><strong>Icono</strong><svg id="icon" viewBox="0 0 24 24"><path d="M3 3h18"/></svg></div></article>
  </div></main></body></html>`);
  await p.addScriptTag({ path: path.join(root, 'public/assets/plotly.min.js') });
  return { browser, p };
}

test('charts render at full size with visible filled marks under the app stylesheet', { skip: !chromium }, async () => {
  const { browser, p } = await page();
  try {
    const result = await p.evaluate(async () => {
      await Plotly.newPlot('bars', [{ type: 'bar', orientation: 'h', x: [5, 3, 2], y: ['SINTÉTICO A', 'SINTÉTICO B', 'SINTÉTICO C'], marker: { color: '#d97706' } }], { margin: { l: 120 } });
      await Plotly.newPlot('trend', [{ type: 'scatter', mode: 'lines+markers', x: ['2026-01', '2026-02', '2026-03'], y: [4, 6, 5] }]);
      const measure = id => {
        const el = document.getElementById(id), svg = el.querySelector('svg.main-svg'), box = svg.getBoundingClientRect();
        const mark = el.querySelector(id === 'bars' ? '.bars path' : '.scatterlayer .points path');
        const line = el.querySelector('.scatterlayer .js-line');
        return { w: box.width, h: box.height, container: el.querySelector('.svg-container').getBoundingClientRect().height, markFill: mark && getComputedStyle(mark).fill, lineStroke: line && getComputedStyle(line).stroke, ticks: el.querySelectorAll('.xtick, .ytick').length };
      };
      const icon = document.getElementById('icon').getBoundingClientRect();
      return { bars: measure('bars'), trend: measure('trend'), icon: { w: icon.width, h: icon.height } };
    });
    for (const id of ['bars', 'trend']) {
      const r = result[id];
      assert.ok(r.w > 300 && r.h > 200, `${id}: main SVG must not be shrunk (got ${r.w}x${r.h})`);
      assert.ok(r.container > 200, `${id}: svg-container collapsed (${r.container})`);
      assert.ok(r.ticks > 0, `${id}: axes ticks missing`);
    }
    assert.notEqual(result.bars.markFill, 'none', 'bar marks must be filled');
    assert.notEqual(result.trend.markFill, 'none', 'line markers must be filled');
    assert.ok(result.trend.lineStroke && result.trend.lineStroke !== 'none', 'trend line must be stroked');
    assert.deepEqual([result.icon.w, result.icon.h], [20, 20], 'app icons keep their 20px design size');
  } finally { await browser.close(); }
});
