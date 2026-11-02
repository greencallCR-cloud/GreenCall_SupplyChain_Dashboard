import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core.mjs';

// Synthetic fixtures only: one long-lived SKU sets an early global grid; the target SKU starts later.
function data({ atypical = 1 } = {}) {
  const rows = []; let n = 2;
  const month = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  for (let i = 0; i < 30; i++) { const y = 2023 + Math.floor(i / 12), m = i % 12 + 1; rows.push({ order: 'OLD-' + i, sku: '9200001', quantity: 1, date: month(y, m) + '-10', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: n++ }); }
  for (let i = 0; i < 18; i++) {
    const y = 2024 + Math.floor((i + 6) / 12), m = (i + 6) % 12 + 1;
    for (let k = 0; k < 60; k++) rows.push({ order: `NEW-${i}-${k}`, sku: '9200002', quantity: 2 + (k % 3), date: month(y, m) + '-15', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: n++ });
    if (i === 10) for (let a = 0; a < atypical; a++) rows.push({ order: `BAD-${a}`, sku: '9200002', quantity: 50000, date: month(y, m) + '-16', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: n++ });
  }
  return { tables: { google_consumos: rows, sku_catalog: [
    { sku: '9200001', description: 'MATERIAL ANTIGUO SINTETICO', unit: 'PZA', cost: 1, center: 'C1', warehouse: 'A000', lot: 'VALORADO' },
    { sku: '9200002', description: 'MATERIAL NUEVO SINTETICO', unit: 'PZA', cost: 2, center: 'C1', warehouse: 'A000', lot: 'VALORADO' },
  ] }, sources: {} };
}

test('one atypical row does not erase a month or block the forecast', () => {
  const f = analyze(data({ atypical: 1 }), {}, {}).forecasts.find(x => x.sku === '9200002');
  assert.notEqual(f.model, 'Sin datos');
  assert.ok(f.history.every(h => h.units !== null), 'month kept with the valid rows');
  const month = f.history.find(h => h.excluded_rows > 0);
  assert.equal(month.excluded_rows, 1);
  assert.equal(month.units, 60 * 3, 'only valid rows are summed (2+3+4 per 3 rows)');
  assert.ok(f.pred[0] > 0, 'positive demand history projects positive demand');
});

test('months before the SKU first appears are not treated as zero demand', () => {
  const f = analyze(data(), {}, {}).forecasts.find(x => x.sku === '9200002');
  assert.ok(f.history[0].units > 0, 'series starts at the first observed month');
  assert.equal(f.history.length, 18);
});

test('a month dominated by invalid quantities stays unknown, never zero', () => {
  const f = analyze(data({ atypical: 10 }), {}, {}).forecasts.find(x => x.sku === '9200002');
  assert.ok(f.history.some(h => h.units === null), '10 of 70 rows invalid (>2%) keeps the month unknown');
});

test('forecast list leads with the most active systemic material', () => {
  const f = analyze(data(), {}, {}).forecasts;
  assert.equal(f[0].sku, '9200002', '1080 orders before the 30-order legacy SKU');
});

test('serialized equipment demand = distinct serials per month; bulk serial-less quantities are excluded and reported', () => {
  const rows = []; let n = 2;
  for (let i = 0; i < 14; i++) {
    const m = `2025-${String((i % 12) + 1).padStart(2, '0')}`, y = i < 12 ? '2025' : '2026', month = `${y}-${String((i % 12) + 1).padStart(2, '0')}`;
    for (let k = 0; k < 20; k++) rows.push({ order: `E-${i}-${k}`, sku: '9400001', serial: `SER-${i}-${k}`, quantity: 1, date: month + '-10', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: n++ });
    if (i === 6) rows.push({ order: `E-${i}-bulk`, sku: '9400001', quantity: 30, date: month + '-11', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: n++ });
  }
  const d = { tables: { google_consumos: rows, sku_catalog: [{ sku: '9400001', description: 'EQUIPO SERIALIZADO SINTETICO', unit: 'PZA', cost: 1000, center: 'C1', warehouse: 'A000', lot: 'VALORADO' }] }, sources: {} };
  const f = analyze(d, {}, {}).forecasts.find(x => x.sku === '9400001');
  assert.ok(f.history.every(h => h.units === 20), 'each month = 20 distinct serials; the bulk 30 is not added');
  assert.match(f.series_basis, /SERIES/);
  assert.equal(f.nonserial_rows_excluded, 1);
});
