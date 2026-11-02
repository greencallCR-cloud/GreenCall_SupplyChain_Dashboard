import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core.mjs';

// Synthetic fixtures only. 14 months of demand for A/C/E; B and D have no recent demand.
function data() {
  const rows = []; let n = 2;
  const month = i => `${2025 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`;
  for (let i = 0; i < 14; i++) for (const sku of ['9600001', '9600003', '9600005']) rows.push({ order: `${sku}-${i}`, sku, quantity: 10, date: month(i) + '-10', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: n++ });
  for (const sku of ['9600002', '9600004']) rows.push({ order: `${sku}-0`, sku, quantity: 5, date: month(0) + '-10', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: n++ });
  const cat = ['9600001', '9600002', '9600003', '9600004', '9600005'].map(sku => ({ sku, description: 'SINTETICO ' + sku, unit: 'PZA', cost: 1, center: 'C1', warehouse: 'A000', lot: 'VALORADO' }));
  const inv = (sku, quantity) => ({ sku, description: 'SINTETICO ' + sku, quantity, value: quantity, location: 'BODEGA', location_type: 'BODEGA', eta_cut: '2026-02-20', sap_cut: '2026-02-20', center: 'C1', warehouse: 'A000', lot: 'VALORADO' });
  return { tables: { google_consumos: rows, sku_catalog: cat, inventory_real: [inv('9600001', 100), inv('9600002', 50), inv('9600005', 0)] }, sources: {} };
}
const plan = () => Object.fromEntries(analyze(data(), {}, {}).planning.map(p => [p.sku, p]));

test('stock present + demand → computed coverage and a risk level', () => {
  const p = plan()['9600001'];
  assert.ok(p.coverage > 0); assert.equal(p.status_code, 'CALCULADO'); assert.notEqual(p.risk, 'Sin calcular');
});
test('stock present, no projected demand → overstock review, not "Sin calcular"', () => {
  assert.equal(plan()['9600002'].status_code, 'SIN_DEMANDA');
});
test('SKU absent from Inventario Real with demand → explicit missing-stock state (never assumed zero)', () => {
  const p = plan()['9600003'];
  assert.equal(p.status_code, 'SIN_STOCK_ACREDITADO'); assert.equal(p.stock, null); assert.ok(p.monthly > 0); assert.match(p.action, /existencias/i);
});
test('absent from inventory and no demand → possibly discontinued', () => {
  assert.equal(plan()['9600004'].status_code, 'SIN_STOCK_NI_DEMANDA');
});
test('credited zero stock with demand → critical coverage', () => {
  const p = plan()['9600005'];
  assert.equal(p.stock, 0); assert.equal(p.risk, 'Crítico'); assert.equal(p.status_code, 'CALCULADO');
});
test('the forecast never depends on stock', () => {
  const f = analyze(data(), {}, {}).forecasts.find(x => x.sku === '9600003');
  assert.ok(f.pred.length > 0 && f.pred[0] > 0);
});
