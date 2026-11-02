import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core.mjs';
import { isExcludedFromDispatchRotation } from '../src/catalog.mjs';

// Synthetic fixtures only.
const data = () => ({ tables: {
  google_consumos: [{ order: 'S-1', sku: '9100001', quantity: 2, date: '2026-09-02', tech: 'T-1', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 2 }],
  sku_catalog: [
    { sku: '9100001', description: 'CONECTOR SINTETICO', unit: 'PZA', cost: 10, center: 'C1', warehouse: 'A000', lot: 'VALORADO' },
    { sku: '', description: 'TENSORES', unit: '', cost: 5 },
  ],
  technicians: [{ tech: 'T-1', name: 'TECNICO SINTETICO', status: 'Activo' }],
  dispatch_nonserial: [
    { date: '2026-09-01', tech: 'T-1', tech_name: 'TECNICO SINTETICO', sku: '9100001', description: 'CONECTOR SINTETICO', quantity: 4, acta: 'A-1' },
    { date: '2026-09-01', tech: 'T-1', tech_name: 'TECNICO SINTETICO', sku: 'PEND-TOALLAS', description: 'TOALLAS', quantity: 3, acta: 'A-1' },
    { date: '2026-09-01', tech: 'T-1', tech_name: 'TECNICO SINTETICO', sku: 'PEND-TENSORES', description: 'TENSORES', quantity: 6, acta: 'A-1' },
  ],
}, sources: {} });

test('TOALLAS exclusion rule is centralized', () => {
  assert.equal(isExcludedFromDispatchRotation('PEND-TOALLAS', 'TOALLAS'), true);
  assert.equal(isExcludedFromDispatchRotation('', 'Toalla de limpieza'), true);
  assert.equal(isExcludedFromDispatchRotation('9100001', 'CONECTOR SINTETICO'), false);
});

test('TOALLAS leave dispatch rotation outputs but not the dispatch event/line audit', () => {
  const d = analyze(data(), {}, {});
  assert.ok(!d.business.dispatchRates.some(r => /TOALLA/.test(r.description || r.sku)), 'rates by technician/SKU exclude TOALLAS');
  assert.ok(!d.insights.dispatch.sku.some(r => /TOALLA/.test(r.description || r.sku)), 'rotation by SKU excludes TOALLAS');
  assert.equal(d.insights.dispatch.lines, 3, 'dispatch lines still include every source row');
});

test('proxy items get catalog cost by description and their business unit', () => {
  const d = analyze(data(), {}, {});
  const tensor = d.business.dispatchRates.find(r => /TENSOR/.test(r.description || r.sku));
  assert.equal(tensor.unit, 'PZA');
  const sku = d.insights.dispatch.sku.find(r => /TENSOR/.test(r.description || r.sku));
  assert.equal(sku.missing_cost, 0); assert.equal(sku.amount_base, 30);
});
