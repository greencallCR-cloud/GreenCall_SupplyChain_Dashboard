// Spec v3 §3: canonical non-serialized supplies, auditable aliases and dispatch proxy forecast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSupply, dispatchQuantity, supplyAliasAudit, SUPPLIES } from '../src/supplies.mjs';
import { analyze, number } from '../src/core.mjs';

const id = (sku, d) => canonicalSupply(sku, d)?.id || null;

test('aliases merge spelling variants without merging different materials', () => {
  assert.equal(SUPPLIES.length, 7);
  assert.equal(id('', 'TENSOR'), 'TENSORES'); assert.equal(id('PEND-TENSORES', 'TENSORES'), 'TENSORES');
  assert.equal(id('', 'MAJADEROS'), 'MAJA-DEDOS'); assert.equal(id('', 'Maja dedos'), 'MAJA-DEDOS'); assert.equal(id('', 'MAJADEDOS'), 'MAJA-DEDOS');
  assert.equal(id('', 'CABLE UTP EXTERIOR'), 'UTP-EXTERIOR'); assert.equal(canonicalSupply('', 'UTP para exteriores').unit, 'M');
  assert.equal(id('', 'CLIPPER'), 'CLIVERS'); assert.equal(id('', 'Clívers'), 'CLIVERS');
  assert.equal(id('1023834', 'CLIP GALVANIZADO PRENSACABLE'), null, 'CLIP GALVANIZADO is another SAP material');
  assert.equal(id('', 'CLIP GALVANIZADO PRENSACABLE'), null);
  assert.equal(id('', 'CINTA ETIQUETADORA'), 'CINTA-ETIQUETADORA'); assert.equal(id('', 'CINTA PARA ETIQUETADORA'), 'CINTA-ETIQUETADORA');
  assert.equal(id('', 'TAPE NEGRO'), 'CINTA-AISLANTE'); assert.equal(id('', 'CINTA ELECTRICA NEGRA'), 'CINTA-AISLANTE');
  assert.equal(canonicalSupply('', 'TAPE NEGRO').sku, '1023943', 'official SAP SKU wins');
  assert.equal(id('', 'TAPE'), null, 'bare TAPE is generic and needs context');
  assert.equal(id('', 'SERVILLETAS'), null, 'SERVILLETAS is not verified as TOALLAS');
  assert.equal(id('', 'TOALLA'), 'TOALLAS');
  assert.equal(id('1004074', 'TENSOR RJ45?'), null, 'a different SAP SKU is never re-labelled by its text');
});

test('alias audit lists every merged variant', () => {
  const a = supplyAliasAudit([{ sku: 'PEND-TENSORES', description: 'TENSORES' }, { sku: '', description: 'TENSOR' }, { sku: '', description: 'TENSOR' }, { sku: '1023834', description: 'CLIP GALVANIZADO PRENSACABLE' }]);
  assert.deepEqual(a.variants.map(v => [v.supply, v.description, v.rows, v.matched_by]), [['TENSORES', 'TENSOR', 2, 'ALIAS'], ['TENSORES', 'TENSORES', 1, 'CÓDIGO']]);
  assert.deepEqual(a.collisions, []);
});

test('a blank quantity reconciles to 0 only when the line total is 0 at a positive unit price', () => {
  assert.deepEqual(dispatchQuantity({ quantity: null, cost: 800, value: 0 }, number), { value: 0, reconciled: true });
  assert.deepEqual(dispatchQuantity({ quantity: null, cost: 0, value: 0 }, number), { value: null, reconciled: false });
  assert.deepEqual(dispatchQuantity({ quantity: null, cost: 800, value: null }, number), { value: null, reconciled: false });
  assert.deepEqual(dispatchQuantity({ quantity: 50, cost: 800, value: 40000 }, number), { value: 50, reconciled: false });
});

test('proxy forecast groups variants, excludes partial edge months and refuses to invent short series', () => {
  const rows = [];
  const add = (date, sku, description, quantity, cost = 800, value = quantity === null ? 0 : quantity * cost) => rows.push({ date, sku, description, quantity, cost, value, tech_name: 'T', validated: 'TRUE', acta: 'A' });
  add('2026-04-24', 'PEND-TENSORES', 'TENSORES', 40);           // opening partial month of the source
  for (const [m, q] of [['05', 100], ['06', 120], ['07', 150], ['08', 170]]) { add(`2026-${m}-10`, 'PEND-TENSORES', 'TENSORES', q); add(`2026-${m}-12`, '', 'TENSOR', 10); }
  add('2026-06-15', 'PEND-TENSORES', 'TENSORES', null);         // blank quantity, total 0 → 0 units
  add('2026-09-03', 'PEND-TENSORES', 'TENSORES', 60);           // closing partial month
  add('2026-08-11', 'PEND-CLIVERS', 'CLIVERS', 2, 0, 0); add('2026-09-02', '', 'CLIPPER', 1, 0, 0);
  const tables = { dispatch_nonserial: rows, sku_catalog: [] };
  const d = analyze({ tables, sources: {} }, {}, {});
  const t = d.forecasts.find(f => f.sku === 'PEND-TENSORES');
  assert.equal(t.source, 'PROXY DE ABASTECIMIENTO / DESPACHO (NO CONSUMO OBSERVADO)');
  assert.deepEqual(t.history.map(h => [h.month, h.units, h.training]), [['2026-04', 40, false], ['2026-05', 110, true], ['2026-06', 130, true], ['2026-07', 160, true], ['2026-08', 180, true], ['2026-09', 60, false]]);
  assert.ok(t.pred.length && t.pred[0] > 0, 'forecast calculated');
  assert.match(t.data_quality_note, /1 línea\(s\) sin cantidad conciliadas a 0/);
  const c = d.forecasts.find(f => f.sku === 'PEND-CLIVERS');
  assert.equal(c.model, 'Historia insuficiente'); assert.deepEqual(c.pred, []);
  assert.equal(c.reference.last_closed_units, 2);
  assert.ok(!d.forecasts.some(f => f.sku === ''), 'variant without SKU is merged, not a separate series');
});
