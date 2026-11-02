// Canonical non-serialized supplies (spec v3 §3). One auditable alias table shared by forecast,
// consumption-per-order and the physical-count importer. Aliases come from evidence in
// "Despachos No Serializados"; a pattern never merges two different materials:
//  - CLIVERS never matches CLIP GALVANIZADO PRENSACABLE (different material, SAP 1023834).
//  - A bare "TAPE" is generic: it maps to the black electrical tape only with colour/insulation context.
//  - SERVILLETAS is NOT an alias of TOALLAS: no evidence in the sources confirms they are the same item.
const clean = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export const SUPPLIES = Object.freeze([
  { id: 'CINTA-AISLANTE', sku: '1023943', name: 'CINTA AISLANTE ELÉCTRICA NEGRA', unit: 'PZA', codes: ['1023943', 'PEND-CINTA-AISLANTE'], match: x => /\bCINTA (AISLANTE|ELECTRICA)\b/.test(x) && !/\bETIQ/.test(x) || /\bTAPE\b/.test(x) && /\b(NEGR[OA]|AISLANTE|ELECTRIC[OA])\b/.test(x) },
  { id: 'TENSORES', sku: 'PEND-TENSORES', name: 'TENSORES', unit: 'PZA', codes: ['PEND-TENSORES'], match: x => /\bTENSOR(ES)?\b/.test(x) },
  { id: 'MAJA-DEDOS', sku: 'PEND-MAJA-DEDOS', name: 'MAJA DEDOS', unit: 'PZA', codes: ['PEND-MAJA-DEDOS'], match: x => /\bMAJA ?DEDOS?\b|\bMAJADER(O|OS)\b|\bMAJADEOS\b/.test(x) },
  { id: 'UTP-EXTERIOR', sku: 'PEND-UTP-EXTERIOR', name: 'UTP PARA EXTERIORES', unit: 'M', codes: ['PEND-UTP-EXTERIOR'], match: x => /\bUTP\b.*\bEXTERIOR(ES)?\b/.test(x) },
  { id: 'TOALLAS', sku: 'PEND-TOALLAS', name: 'TOALLAS', unit: 'PZA', codes: ['PEND-TOALLAS'], match: x => /\bTOALLAS?\b/.test(x) },
  { id: 'CLIVERS', sku: 'PEND-CLIVERS', name: 'CLIVERS', unit: 'PZA', codes: ['PEND-CLIVERS', 'PEND-CLIVER'], match: x => /\bCLI(V|PP?)ERS?\b|\bCLEAVERS?\b/.test(x) && !/\bCLIP\b/.test(x) },
  { id: 'CINTA-ETIQUETADORA', sku: 'PEND-CINTA-ETIQ', name: 'CINTA PARA ETIQUETADORA', unit: 'PZA', codes: ['PEND-CINTA-ETIQ', 'PEND-CINTA-ETIQUETADORA'], match: x => /\bCINTA\b.*\b(ETIQ|ETIQUETADORA|DYMO)\b/.test(x) },
]);
const BY_CODE = new Map(SUPPLIES.flatMap(s => s.codes.map(c => [c, s])));

/** Canonical supply for a dispatch/count row, or null. An official code wins over the text. */
export function canonicalSupply(sku, description) {
  const code = String(sku ?? '').trim().toUpperCase();
  if (BY_CODE.has(code)) return { ...BY_CODE.get(code), matched_by: 'CÓDIGO' };
  if (code && !code.startsWith('PEND') && /^\d+$/.test(code)) return null; // another SAP SKU: never re-labelled by text
  const text = clean(code.replace(/^PEND-?/, '') + ' ' + (description || ''));
  const hits = SUPPLIES.filter(s => s.match(text));
  if (hits.length === 1) return { ...hits[0], matched_by: 'ALIAS' };
  return null; // none, or an ambiguous collision (reported by supplyAliasAudit)
}

/** Auditable list of every variant merged into each supply, plus text collisions. */
export function supplyAliasAudit(rows) {
  const variants = new Map(), collisions = new Map();
  for (const r of rows) {
    const text = clean(String(r.sku || '').replace(/^PEND-?/, '') + ' ' + (r.description || ''));
    const hits = SUPPLIES.filter(s => s.match(text));
    if (hits.length > 1) { const k = (r.sku || '') + '|' + (r.description || ''); collisions.set(k, { sku: r.sku || null, description: r.description || null, candidates: hits.map(h => h.id), rows: (collisions.get(k)?.rows || 0) + 1 }); continue; }
    const s = canonicalSupply(r.sku, r.description); if (!s) continue;
    const k = s.id + '|' + (r.sku || '') + '|' + (r.description || '');
    const v = variants.get(k) || { supply: s.id, canonical_sku: s.sku, sku: r.sku || null, description: r.description || null, matched_by: s.matched_by, rows: 0 };
    v.rows++; variants.set(k, v);
  }
  return { variants: [...variants.values()].sort((a, b) => a.supply.localeCompare(b.supply) || b.rows - a.rows), collisions: [...collisions.values()] };
}

/** Dispatched quantity with evidence. A blank quantity whose line total is exactly 0 at a positive
 * unit price reconciles to 0 units (Precio total = cantidad × Precio unitario); otherwise unknown. */
export function dispatchQuantity(row, number) {
  const q = number(row.quantity);
  if (q !== null) return { value: q, reconciled: false };
  const unit = number(row.cost), total = number(row.value);
  if (unit !== null && unit > 0 && total === 0) return { value: 0, reconciled: true };
  return { value: null, reconciled: false };
}
