import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../src/catalog.mjs').catch(() => ({}));
const { createCatalogResolver, canonicalUnit, VAT_RATE } = mod;

// Synthetic catalog mirroring the REAL structure (no operational prices are used here).
const catalog = [
  { sku: '9000001', center: 'C1', warehouse: 'A000', lot: 'VALORADO', unit: 'PZA', cost: 10, description: 'CONECTOR SINTETICO' },
  { sku: '9000002', center: 'C1', warehouse: 'A000', lot: 'VALORADO', unit: 'PZA', cost: 100, description: 'EQUIPO SINTETICO' },
  { sku: '9000002', center: 'C1', warehouse: 'Q000', lot: 'NOVALORADO', unit: 'PZA', cost: 120, description: 'EQUIPO SINTETICO' },
  { sku: '9000002', center: 'C9', warehouse: 'A000', lot: 'VALORADO', unit: '', cost: 150, description: 'EQUIPO DE VENTA' },
  { sku: '9000003', center: 'C1', warehouse: 'A000', lot: 'NOVALORADO', unit: 'PZA', cost: 50, description: 'SOLO NOVALORADO' },
  { sku: '9000003', center: 'C1', warehouse: 'Q000', lot: 'NOVALORADO', unit: 'PZA', cost: 60, description: 'SOLO NOVALORADO' },
  { sku: '', center: '', warehouse: '', lot: '', unit: '', cost: 7, description: 'TENSORES' },
  { sku: '', center: '', warehouse: '', lot: '', unit: '', cost: 3, description: 'MAJA DEDOS' },
  { sku: '9000010', center: 'C1', warehouse: 'A000', lot: 'VALORADO', unit: '', cost: 70, description: 'CABLE DROP CMX 1FO100M MOAVDPREC' },
  { sku: '9000011', center: 'C1', warehouse: 'A000', lot: 'VALORADO', unit: 'M', cost: 2, description: 'CABLE UTP CAT5 P/INTERIORES' },
  { sku: '9000012', center: 'C1', warehouse: 'Q000', lot: 'NOVALORADO', unit: '', cost: null, description: 'EQUIPO SIN PRECIO' },
];

test('catalog module contract', () => {
  assert.equal(typeof createCatalogResolver, 'function');
  assert.equal(typeof canonicalUnit, 'function');
  assert.equal(VAT_RATE, 0.13);
});

test('business unit rules: drop/tensores/majadedos/clivers/cintas = PZA, UTP exterior = M', () => {
  const cases = [
    ['CABLE DROP CMX 1FO200M MOAVDPREC 3068671', 'PZA'], ['TENSORES', 'PZA'], ['Tensor', 'PZA'],
    ['MAJA DEDOS', 'PZA'], ['majaderos', 'PZA'], ['CLIVERS', 'PZA'], ['CLIPPERS', 'PZA'],
    ['CINTA PARA ETIQUETADORA', 'PZA'], ['cinta etiquetadora', 'PZA'],
    ['CINTA AISLANTE ELÉCTRICA NEGRA', 'PZA'], ['CINTA AISLANTE NEGRA', 'PZA'],
    ['UTP PARA EXTERIORES', 'M'], ['utp exterior', 'M'],
  ];
  for (const [description, unit] of cases) assert.equal(canonicalUnit(description, '').unit, unit, description);
  // A rule never fabricates a unit for unrelated material; catalog units are normalized.
  assert.equal(canonicalUnit('CONECTOR X', '').unit, null);
  assert.equal(canonicalUnit('CONECTOR X', 'UN').unit, 'PZA');
  assert.equal(canonicalUnit('CABLE X', 'MTS').unit, 'M');
  // Business rule wins and is labelled; the drop length is never converted to metres.
  const drop = canonicalUnit('CABLE DROP CMX 1FO150M', 'M');
  assert.equal(drop.unit, 'PZA'); assert.match(drop.source, /REGLA/);
});

test('resolver units come from catalog, then business rules, never invented', () => {
  const r = createCatalogResolver(catalog);
  assert.deepEqual([r.unit('9000001').unit, r.unit('9000001').source], ['PZA', 'CATÁLOGO']);
  assert.equal(r.unit('9000010').unit, 'PZA');
  assert.equal(r.unit('PEND-TENSORES', 'TENSORES').unit, 'PZA');
  assert.equal(r.unit('PEND-UTP-EXTERIOR', 'UTP PARA EXTERIORES').unit, 'M');
  assert.equal(r.unit('9000011').unit, 'M');
  assert.equal(r.unit('9999999', 'DESCONOCIDO').unit, null);
});

test('costs: exact context first, then the R859-style reference context, never an arbitrary pick', () => {
  const r = createCatalogResolver(catalog, { referenceCenter: 'C1' });
  assert.equal(r.cost('9000001').cost, 10);
  // Multi-context SKU: explicit movement context wins…
  assert.deepEqual([r.cost('9000002', '', { warehouse: 'Q000' }).cost, r.cost('9000002', '', { warehouse: 'Q000' }).basis], [120, 'CONTEXTO']);
  // …without context the documented reference (reference center + A000 + VALORADO) is used.
  const ref = r.cost('9000002');
  assert.equal(ref.cost, 100); assert.equal(ref.basis, 'REFERENCIA');
  assert.match(ref.source, /C1\/A000\/VALORADO/);
  // No valued reference and conflicting prices: explicit conflict, not a guess and not 0.
  const conflict = r.cost('9000003');
  assert.equal(conflict.cost, null); assert.equal(conflict.basis, 'CONFLICTO'); assert.match(conflict.reason, /50/);
  // A known SKU whose only row has no price stays unverifiable with its reason.
  const none = r.cost('9000012');
  assert.equal(none.cost, null); assert.equal(none.basis, 'SIN_COSTO'); assert.ok(none.reason);
});

test('rows without SKU resolve by canonical description or operational alias', () => {
  const r = createCatalogResolver(catalog);
  assert.deepEqual([r.cost('', 'TENSORES').cost, r.cost('', 'TENSORES').basis], [7, 'DESCRIPCIÓN']);
  assert.equal(r.cost('PEND-TENSORES', 'Tensores').cost, 7);
  assert.equal(r.cost('PEND-MAJA-DEDOS', 'MAJADEROS').cost, 3);
  // No fuzzy guessing: an absent material stays without cost and says why.
  const cliver = r.cost('PEND-CLIVER', 'CLIVERS');
  assert.equal(cliver.cost, null); assert.equal(cliver.basis, 'SIN_COSTO'); assert.match(cliver.reason, /Catálogo/);
});

test('coverage report lists every requested SKU with source and reason', () => {
  const r = createCatalogResolver(catalog, { referenceCenter: 'C1' });
  const report = r.coverage([{ sku: '9000001' }, { sku: '9000002' }, { sku: '9000003' }, { sku: 'PEND-CLIVER', description: 'CLIVERS' }]);
  assert.equal(report.total, 4); assert.equal(report.resolved, 2);
  assert.equal(report.items.find(i => i.sku === '9000003').basis, 'CONFLICTO');
});

test('placeholder SKUs resolve through an exact description that maps to a single catalog SKU', () => {
  const r = createCatalogResolver(catalog, { referenceCenter: 'C1' });
  for (const placeholder of ['SIN SKU', 'NO SAP', '']) {
    const c = r.cost(placeholder, 'CONECTOR SINTETICO');
    assert.equal(c.cost, 10, placeholder); assert.equal(c.basis, 'DESCRIPCIÓN'); assert.match(c.source, /9000001/);
  }
  // Same description shared by several SKUs: no guess.
  const twin = createCatalogResolver([...catalog, { sku: '9000099', center: 'C1', warehouse: 'A000', lot: 'VALORADO', unit: 'PZA', cost: 11, description: 'CONECTOR SINTETICO' }]);
  assert.equal(twin.cost('SIN SKU', 'CONECTOR SINTETICO').basis, 'CONFLICTO');
});

test('abbreviated operational labels still get their business unit', () => {
  const r = createCatalogResolver(catalog);
  assert.equal(r.unit('PEND-CINTA-ETIQ').unit, 'PZA');
  assert.equal(r.unit('PEND-CINTA-ETIQ', 'CINTA PARA ETIQUETADORA').unit, 'PZA');
});

test('dashboard exposes a cost-coverage audit for every active material (no zero fallbacks)', async () => {
  const { analyze } = await import('../src/core.mjs');
  const d = analyze({ tables: {
    google_consumos: [{ order: 'O1', sku: '9000001', quantity: 1, date: '2026-09-01', tech: 'T', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 2 }],
    sku_catalog: catalog,
    dispatch_nonserial: [{ date: '2026-09-01', tech: 'T', sku: 'PEND-CLIVER', description: 'CLIVERS', quantity: 1 }, { date: '2026-09-01', tech: 'T', sku: 'PEND-TENSORES', description: 'TENSORES', quantity: 1 }],
  }, sources: {} }, {}, {});
  const cov = d.quality.cost_coverage;
  assert.ok(cov.total >= 3);
  const cliver = cov.items.find(i => /CLIVER/.test(i.description || i.sku));
  assert.equal(cliver.cost, null); assert.equal(cliver.basis, 'SIN_COSTO'); assert.ok(cliver.reason);
  assert.equal(cov.items.find(i => /TENSOR/.test(i.description || i.sku)).cost, 7);
  assert.ok(cov.items.every(i => i.cost === null || i.cost > 0), 'never a zero placeholder');
});

test('reviewed description aliases resolve known misspellings/truncations to one catalog SKU', async () => {
  const { DESCRIPTION_ALIASES } = await import('../src/catalog.mjs');
  const cat = [
    { sku: '1013950', description: 'AMARRA PLASTICAS NEGRAS 8" - CPX', unit: 'PZA', cost: 9, center: 'C1', warehouse: 'A000', lot: 'VALORADO' },
    { sku: '1005388', description: 'CONECTOR SIN HERRAMI 8802-T/1.6-3 SC/APC', unit: 'PZA', cost: 8, center: 'C1', warehouse: 'A000', lot: 'VALORADO' },
    { sku: '1027925', description: 'CABLE UTP CAT5 P/INTERIORES 66445532AM', unit: 'M', cost: 2, center: 'C1', warehouse: 'A000', lot: 'VALORADO' },
  ];
  const r = createCatalogResolver(cat);
  assert.equal(r.cost('', 'ARRA PLASTICAS NEGRAS 8" - CPX').cost, 9);
  assert.equal(r.cost(null, 'CONECTOR SIN HERRI 8802-T/1.6-3 SC/APC').basis, 'ALIAS');
  assert.equal(r.unit('', 'CABLE UTP CAT5 P/INTERIORES 66445532').unit, 'M');
  // Every alias targets a distinct SKU (no collisions) and an alias never overrides a real SKU.
  const targets = Object.values(DESCRIPTION_ALIASES);
  assert.equal(new Set(targets).size, targets.length);
  assert.equal(r.cost('1013950', 'ARRA PLASTICAS NEGRAS 8" - CPX').basis, 'ÚNICO');
  // Target absent from the catalog → no match, no guess.
  assert.equal(createCatalogResolver([]).cost('', 'ARRA PLASTICAS NEGRAS 8" - CPX').cost, null);
});
