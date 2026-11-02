// Spec v3: global date filters must not alter Super ABC, Forecast or Planning (synthetic data only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardService } from '../lib/dashboard-service.mjs';

const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
function data() {
  const rows = [];
  months.forEach((m, i) => {
    for (let o = 0; o < 6 + i; o++) {
      rows.push({ order: `O-${m}-${o}`, sku: 'TEST-A', quantity: 2, date: `${m}-0${1 + (o % 8)}`, tech: 'T1', source_mode: 'GOOGLE_CONSUMOS' });
      if (o % 3 === 0) rows.push({ order: `O-${m}-${o}`, sku: 'TEST-B', quantity: 1, date: `${m}-0${1 + (o % 8)}`, tech: 'T1', source_mode: 'GOOGLE_CONSUMOS' });
    }
    if (i < 3) rows.push({ order: `O-${m}-X`, sku: 'TEST-C', quantity: 5, date: `${m}-10`, tech: 'T2', source_mode: 'GOOGLE_CONSUMOS' });
  });
  const tables = { google_consumos: rows, sku_catalog: [{ sku: 'TEST-A', description: 'Synthetic A', cost: 10, unit: 'PZA' }, { sku: 'TEST-B', description: 'Synthetic B', cost: 500, unit: 'PZA' }, { sku: 'TEST-C', description: 'Synthetic C', cost: 3, unit: 'M' }] };
  return { tables, sources: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, { source_type: 'GOOGLE_SHEETS_API_READ_ONLY', source_tab: t === 'google_consumos' ? 'Consumos' : 'Catálogo SKUs', original_data_rows: r.length, retrieved_at: '2026-10-30T12:00:00.000Z', sanitized: true }])) };
}
const strip = v => JSON.parse(JSON.stringify(v));

test('ABC, forecasts and planning ignore from/to/month and report the period used', async () => {
  const service = createDashboardService({ loadSnapshot: async () => ({ id: 'S1', captured_at: '2026-10-01T00:00:00Z', data: data() }), views: null });
  const all = await service.getDashboard({});
  assert.equal(all.model_period.from, '2025-11'); assert.equal(all.model_period.date_filters_ignored, false);
  for (const filter of [{ from: '2026-08-01', to: '2026-09-30' }, { month: '2026-01' }, { from: '2026-01-01' }]) {
    const dated = await service.getDashboard(filter);
    assert.deepEqual(strip(dated.charts.abc), strip(all.charts.abc), 'ABC unchanged by ' + JSON.stringify(filter));
    assert.deepEqual(strip(dated.forecasts), strip(all.forecasts), 'forecast unchanged');
    assert.deepEqual(strip(dated.planning), strip(all.planning), 'planning unchanged');
    assert.deepEqual(strip(dated.orderForecast), strip(all.orderForecast));
    assert.equal(dated.model_period.date_filters_ignored, true);
    assert.equal(dated.model_period.from, '2025-11'); assert.equal(dated.model_period.to, all.model_period.to);
    assert.notEqual(dated.kpis.orders, all.kpis.orders, 'other modules still honor the date filter');
  }
});

test('non-date filters still apply to the models', async () => {
  const service = createDashboardService({ loadSnapshot: async () => ({ id: 'S1', data: data() }), views: null });
  const all = await service.getDashboard({}), one = await service.getDashboard({ sku: 'TEST-C', from: '2026-05-01' });
  assert.ok(one.charts.abc.every(x => x.sku === 'TEST-C'));
  assert.deepEqual(strip(one.charts.abc), strip((await service.getDashboard({ sku: 'TEST-C' })).charts.abc));
  assert.ok(all.charts.abc.length > one.charts.abc.length);
});
