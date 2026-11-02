// Canonical catalog layer: units of measure and verifiable unit costs (CRC, sin IVA).
// One deterministic resolver used by every module. Never fabricates a unit or price:
// unresolved items return null with an explicit basis and reason.
export const VAT_RATE = 0.13;

// Owner request (2026-11): TOALLAS are not part of dispatch-rotation analysis. Source rows
// are kept; only rotation outputs (by technician/SKU and by SKU) exclude them.
export const isExcludedFromDispatchRotation = (sku, description) => /\bTOALLA(S)?\b/.test(String(sku || '').toUpperCase().replace(/-/g, ' ') + ' ' + String(description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());

const clean = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9/]+/g, ' ').trim().replace(/\s+/g, ' ');
const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : null; const a = String(v ?? '').replace(/[₡\s]/g, ''); if (!a) return null; const s = a.includes(',') ? a.replace(/\./g, '').replace(',', '.') : a; const z = Number(s); return Number.isFinite(z) ? z : null; };

export function normalizeUnit(raw) {
  const y = clean(raw);
  if (!y) return null;
  if (['PZA', 'PZ', 'UND', 'UN', 'UNIDAD', 'UNIDADES', 'PIEZA', 'PIEZAS', 'EA', 'PC'].includes(y)) return 'PZA';
  if (['M', 'MT', 'MTS', 'METRO', 'METROS', '1M'].includes(y)) return 'M';
  if (['ML', 'MILILITROS', 'MILILITRO'].includes(y)) return 'ML';
  if (['L', 'LT', 'LITRO', 'LITROS'].includes(y)) return 'L';
  if (['KG', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS'].includes(y)) return 'KG';
  return y;
}

// Owner-defined business rules (GreenCall, 2026-11). They win over an empty or
// inconsistent catalog unit and are always labelled. A CABLE DROP is counted in pieces of
// a nominal length; its length is never converted into metres.
export const UNIT_RULES = [
  [/\bCABLE\b.*\bDROP\b|\bDROP\b.*\bPRECONECT/, 'PZA', 'CABLE DROP'],
  [/\bTENSOR(ES)?\b/, 'PZA', 'TENSORES'],
  [/\bMAJA ?DEDOS?\b|\bMAJADER(O|OS)\b|\bMAJADEOS\b/, 'PZA', 'MAJA DEDOS'],
  [/\bCLI(V|PP|P)ER(S)?\b|\bCLEAVER(S)?\b/, 'PZA', 'CLIVERS'],
  [/\bCINTA\b.*\bETIQ(UETADORA)?\b/, 'PZA', 'CINTA ETIQUETADORA'],
  [/\bCINTA AISLANTE\b/, 'PZA', 'CINTA AISLANTE'],
  [/\bUTP\b.*\bEXTERIOR(ES)?\b/, 'M', 'UTP EXTERIOR (1M)'],
];

export function canonicalUnit(description, catalogUnit) {
  const text = clean(description);
  for (const [pattern, unit, label] of UNIT_RULES) if (pattern.test(text)) return { unit, source: 'REGLA DE NEGOCIO · ' + label };
  const unit = normalizeUnit(catalogUnit);
  return unit ? { unit, source: 'CATÁLOGO' } : { unit: null, source: null };
}

// Operational alias keys shared by catalog rows and movements without a SAP SKU.
export function aliasKey(sku, description) {
  const x = clean(String(sku || '') + ' ' + String(description || ''));
  if (/\bUTP\b.*\bEXTERIOR(ES)?\b/.test(x)) return 'UTP-EXTERIOR';
  if (/\bTENSOR(ES)?\b/.test(x)) return 'TENSORES';
  if (/\bMAJA ?DEDOS?\b|\bMAJADER(O|OS)\b|\bMAJADEOS\b/.test(x)) return 'MAJA-DEDOS';
  if (/\bCLI(V|PP|P)ER(S)?\b|\bCLEAVER(S)?\b/.test(x)) return 'CLIVER';
  if (/\bCINTA\b.*\bETIQ(UETADORA)?\b/.test(x)) return 'CINTA-ETIQUETADORA';
  return null;
}

/** @param rows Catálogo SKUs rows; options.referenceCenter defaults to the most common valued center. */
export function createCatalogResolver(rows = [], { referenceCenter } = {}) {
  const bySku = new Map(), byDesc = new Map(), byAlias = new Map(), descriptions = new Map(), skuByDesc = new Map();
  const centers = new Map();
  for (const r of rows) {
    const cost = num(r.cost), row = { ...r, sku: String(r.sku || '').trim(), cost: cost !== null && cost >= 0 ? cost : null };
    if (row.sku) { (bySku.get(row.sku) || bySku.set(row.sku, []).get(row.sku)).push(row); if (row.description && !descriptions.has(row.sku)) descriptions.set(row.sku, row.description); const dk = clean(row.description); if (dk) (skuByDesc.get(dk) || skuByDesc.set(dk, new Set()).get(dk)).add(row.sku); }
    else {
      const d = clean(row.description); if (d) (byDesc.get(d) || byDesc.set(d, []).get(d)).push(row);
      const a = aliasKey('', row.description); if (a) (byAlias.get(a) || byAlias.set(a, []).get(a)).push(row);
    }
    if (clean(row.lot) === 'VALORADO' && row.center) centers.set(row.center, (centers.get(row.center) || 0) + 1);
  }
  const refCenter = referenceCenter || [...centers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const priced = list => list.filter(x => x.cost !== null);
  const distinct = list => [...new Set(list.map(x => x.cost))];
  const label = x => [x.center || '—', x.warehouse || '—', x.lot || '—'].join('/');

  function unit(sku, description) {
    const own = bySku.get(String(sku || '').trim()) || [];
    const desc = description || own.find(x => x.description)?.description || '';
    const rule = canonicalUnit(String(sku || '').startsWith('PEND-') ? String(sku).replace(/-/g, ' ') + ' ' + desc : desc, '');
    if (rule.unit) return rule;
    const units = [...new Set(own.map(x => normalizeUnit(x.unit)).filter(Boolean))];
    if (units.length === 1) return { unit: units[0], source: 'CATÁLOGO' };
    if (units.length > 1) return { unit: null, source: 'CONFLICTO DE UNIDAD: ' + units.join(', ') };
    return { unit: null, source: null };
  }

  function bySkuCost(list, ctx) {
    const withPrice = priced(list);
    if (!withPrice.length) return { cost: null, basis: 'SIN_COSTO', source: null, reason: 'El SKU existe en Catálogo SKUs sin valor unitario.' };
    let candidates = withPrice, contextual = false;
    for (const k of ['center', 'warehouse', 'lot']) {
      if (!ctx?.[k]) continue;
      const exact = candidates.filter(x => clean(x[k]) === clean(ctx[k]));
      if (exact.length) { candidates = exact; contextual = true; }
    }
    if (contextual && distinct(candidates).length === 1) return { cost: candidates[0].cost, basis: 'CONTEXTO', source: 'CATÁLOGO ' + label(candidates[0]), reason: null };
    if (distinct(withPrice).length === 1) return { cost: withPrice[0].cost, basis: 'ÚNICO', source: 'CATÁLOGO ' + label(withPrice[0]), reason: null };
    // Documented precedence: valued stock (A000/VALORADO) of the reference center.
    const reference = withPrice.filter(x => clean(x.lot) === 'VALORADO' && clean(x.warehouse) === 'A000' && (!refCenter || x.center === refCenter));
    if (distinct(reference).length === 1) return { cost: reference[0].cost, basis: 'REFERENCIA', source: 'CATÁLOGO ' + label(reference[0]) + ' (referencia valorada)', reason: null };
    return { cost: null, basis: 'CONFLICTO', source: null, reason: 'Precios distintos sin contexto unívoco: ' + withPrice.map(x => label(x) + '=' + x.cost).join('; ') };
  }

  function cost(sku, description, ctx = {}) {
    const id = String(sku || '').trim();
    const own = id && !id.startsWith('PEND-') ? bySku.get(id) : null;
    if (own?.length) return bySkuCost(own, ctx);
    // Placeholder or unknown SKU (e.g. 'SIN SKU', 'NO SAP'): exact description that maps to ONE catalog SKU.
    const twins = skuByDesc.get(clean(description));
    if (twins?.size === 1) { const via = [...twins][0], c = bySkuCost(bySku.get(via), ctx); return c.cost === null ? c : { ...c, basis: 'DESCRIPCIÓN', source: c.source + ' · vía descripción exacta → SKU ' + via }; }
    if (twins?.size > 1) return { cost: null, basis: 'CONFLICTO', source: null, reason: 'La descripción corresponde a varios SKU del catálogo: ' + [...twins].join(', ') };
    const descRows = byDesc.get(clean(description)) || [];
    if (distinct(priced(descRows)).length === 1) return { cost: priced(descRows)[0].cost, basis: 'DESCRIPCIÓN', source: 'CATÁLOGO · fila sin SKU por descripción exacta', reason: null };
    const alias = aliasKey(id, description), aliasRows = alias ? byAlias.get(alias) || [] : [];
    if (distinct(priced(aliasRows)).length === 1) return { cost: priced(aliasRows)[0].cost, basis: 'DESCRIPCIÓN', source: 'CATÁLOGO · alias operativo ' + alias, reason: null };
    if (distinct(priced([...descRows, ...aliasRows])).length > 1) return { cost: null, basis: 'CONFLICTO', source: null, reason: 'Varias filas del catálogo con precios distintos para la misma descripción.' };
    return { cost: null, basis: 'SIN_COSTO', source: null, reason: id && !id.startsWith('PEND-') ? 'SKU ausente del Catálogo SKUs.' : 'Material sin fila de precio en el Catálogo SKUs (ni por SKU, descripción o alias).' };
  }

  function coverage(items) {
    const seen = new Map();
    for (const it of items) { const key = (it.sku || '') + '|' + clean(it.description); if (!seen.has(key)) seen.set(key, it); }
    const out = [...seen.values()].map(it => ({ sku: it.sku || null, description: it.description || descriptions.get(it.sku) || null, ...cost(it.sku, it.description), unit: unit(it.sku, it.description).unit }));
    return { total: out.length, resolved: out.filter(x => x.cost !== null).length, items: out };
  }

  return { unit, cost, coverage, description: sku => descriptions.get(String(sku || '').trim()) || null, referenceCenter: refCenter };
}
