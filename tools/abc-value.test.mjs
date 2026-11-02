import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core.mjs';

// Synthetic fixtures only.
const base = () => ({ tables: {
  google_consumos: [
    { order: 'A1', sku: '9300001', quantity: 4, date: '2026-05-02', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 2 },
    { order: 'A2', sku: '9300001', quantity: 6, date: '2026-05-03', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 3 },
    { order: 'A3', sku: '9300001', quantity: 93000, date: '2026-05-04', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 4 },
    { order: 'B1', sku: '9300002', quantity: 2, date: '2026-05-02', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 5 },
  ],
  sku_catalog: [
    { sku: '9300001', description: 'MATERIAL CON PRECIO', unit: 'PZA', cost: 5, center: 'C1', warehouse: 'A000', lot: 'VALORADO' },
    { sku: '9300002', description: 'MATERIAL SIN PRECIO', unit: 'PZA', cost: null, center: 'C1', warehouse: 'A000', lot: 'VALORADO' },
  ] }, sources: {} });

test('an invalid quantity row does not erase the valuation of a priced SKU; it is flagged partial', () => {
  const r = analyze(base(), {}, {}).charts.abc.find(x => x.sku === '9300001');
  assert.equal(r.value, 50, 'valid rows only: (4+6) × 5');
  assert.equal(r.value_partial, true);
  assert.equal(r.invalid_quantity, 1);
  assert.notEqual(r.abc, '—');
});

test('a SKU without a verifiable price keeps a null value and no monetary class', () => {
  const r = analyze(base(), {}, {}).charts.abc.find(x => x.sku === '9300002');
  assert.equal(r.value, null); assert.equal(r.missing_cost, true);
});
