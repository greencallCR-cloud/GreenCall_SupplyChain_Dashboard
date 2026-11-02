// Consumption per order from physical counts (spec v3 §4). Pure functions, no I/O.
//   Consumo(t,s,t0,t1] = Inventario físico(t0) + despachos recibidos(t0,t1] + entradas documentadas
//                        − devoluciones/salidas documentadas − Inventario físico(t1)
//   Consumo por orden   = Σ consumo válido / Σ órdenes ÚNICAS del técnico en (t0,t1]
// A negative balance is a reconciliation ALERT (never clipped to 0); zero orders => N/D (never 0);
// a dispatch line without verifiable quantity makes the interval NO_VERIFICABLE.
import { SUPPLIES, canonicalSupply, dispatchQuantity } from './supplies.mjs';

export const normName = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const keyOf = (sku, description) => canonicalSupply(sku, description)?.sku || String(sku || '');

/**
 * @param counts   valid physical counts {tech, tech_name, sku, description, date, count, take}
 * @param dispatches dispatch_nonserial rows {sku, description, date, quantity, cost, value, tech, tech_name}
 * @param orders   closed orders {order, tech, date} (unique order ids; Google Consumos)
 * @param returns  documented returns/transfers out {tech, sku, description, date, quantity} (optional)
 */
export function physicalIntervals({ counts, dispatches, orders, returns = [], number }) {
  const series = new Map();
  for (const r of counts) {
    const sku = keyOf(r.sku, r.description), k = r.tech + '|' + sku;
    const list = series.get(k) || []; list.push({ ...r, sku }); series.set(k, list);
  }
  const ordersByTech = new Map();
  for (const o of orders) { if (!o.tech || !o.date) continue; const l = ordersByTech.get(o.tech) || []; l.push(o); ordersByTech.set(o.tech, l); }
  const dispatchFor = (tech, techName, sku) => dispatches.filter(d => keyOf(d.sku, d.description) === sku && (d.tech && d.tech === tech || techName && normName(d.tech_name) === normName(techName)));
  const out = [], latest = [];
  for (const rows of series.values()) {
    // One reading per date: the last take of that date (same-day conflicts are reported upstream).
    const byDate = new Map();
    for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date) || String(a.take || '').localeCompare(String(b.take || '')))) byDate.set(r.date, r);
    const valid = [...byDate.values()];
    latest.push({ ...valid.at(-1), observations: valid.length });
    const mine = dispatchFor(valid[0].tech, valid[0].tech_name, valid[0].sku), techOrders = ordersByTech.get(valid[0].tech) || [];
    for (let i = 1; i < valid.length; i++) {
      const a = valid[i - 1], b = valid[i], span = days(a.date, b.date);
      if (span <= 0) continue;
      const lines = mine.filter(d => d.date > a.date && d.date <= b.date).map(d => dispatchQuantity(d, number));
      const unknown = lines.filter(q => q.value === null || q.value < 0).length;
      const entries = lines.reduce((s, q) => s + (q.value > 0 ? q.value : 0), 0);
      const out_docs = returns.filter(x => x.tech === a.tech && keyOf(x.sku, x.description) === a.sku && x.date > a.date && x.date <= b.date).reduce((s, x) => s + (number(x.quantity) || 0), 0);
      const consumption = a.count + entries - out_docs - b.count;
      const orderCount = new Set(techOrders.filter(o => o.date > a.date && o.date <= b.date).map(o => o.order)).size;
      const status = unknown ? 'NO_VERIFICABLE' : consumption < 0 ? 'ALERTA_CONCILIACION' : !orderCount ? 'SIN_ORDENES' : 'VALIDO';
      out.push({
        tech: a.tech, tech_name: a.tech_name || null, sku: a.sku, start: a.date, end: b.date, days: span,
        initial: a.count, replenishments: entries, returns: out_docs, final: b.count, consumption,
        orders: orderCount, per_order: status === 'VALIDO' ? consumption / orderCount : null,
        rate: status === 'VALIDO' || status === 'SIN_ORDENES' ? consumption / span : null,
        monthly: status === 'VALIDO' || status === 'SIN_ORDENES' ? consumption / span * 30.4375 : null,
        status, unknown_dispatch_lines: unknown,
        unidentified_adjustment: consumption < 0 ? -consumption : 0,
        method: entries ? 'BALANCE FÍSICO: CONTEO + DESPACHOS − CONTEO' : 'BALANCE FÍSICO: DIFERENCIA ENTRE CONTEOS',
      });
    }
  }
  return { intervals: out, latest };
}

/** Per-supply cards: physical balance per order (primary) and dispatch per order (separate proxy). */
export function consumptionPerOrder({ intervals, latest, dispatches, orders, number, dispatchStart, dispatchCut, techCodeByName = new Map() }) {
  const closedMonths = monthsClosed(dispatchStart, dispatchCut);
  // Proxy denominator: unique orders, in the same closed months, of the technicians who received the supply.
  const ordersByTechMonth = new Map();
  for (const o of orders) { if (!o.date || !o.tech) continue; const k = o.tech + '|' + o.date.slice(0, 7); const s = ordersByTechMonth.get(k) || new Set(); s.add(o.order); ordersByTechMonth.set(k, s); }
  const codeOf = d => d.tech || techCodeByName.get(normName(d.tech_name)) || null;
  return SUPPLIES.map(s => {
    const mine = intervals.filter(x => x.sku === s.sku), ok = mine.filter(x => x.status === 'VALIDO');
    const consumption = ok.reduce((t, x) => t + x.consumption, 0), denom = ok.reduce((t, x) => t + x.orders, 0);
    const counts = latest.filter(x => x.sku === s.sku);
    // Proxy window: closed months from the supply's first dispatched month (not before it existed).
    const first = dispatches.filter(d => keyOf(d.sku, d.description) === s.sku).map(d => String(d.date || '').slice(0, 7)).filter(Boolean).sort()[0];
    const months = first ? closedMonths.filter(m => m >= first) : [];
    const disp = dispatches.filter(d => keyOf(d.sku, d.description) === s.sku && months.includes(String(d.date || '').slice(0, 7)));
    const q = disp.map(d => dispatchQuantity(d, number)), unknown = q.filter(x => x.value === null).length;
    const dispatched = q.reduce((t, x) => t + (x.value > 0 ? x.value : 0), 0);
    const receivers = new Set(disp.map(codeOf).filter(Boolean)), unmapped = disp.filter(d => !codeOf(d)).length;
    const proxyOrdersSet = new Set(); for (const t of receivers) for (const m of months) for (const o of ordersByTechMonth.get(t + '|' + m) || []) proxyOrdersSet.add(o);
    const proxyOrders = proxyOrdersSet.size;
    return {
      supply: s.id, sku: s.sku, name: s.name, unit: s.unit,
      physical: {
        per_order: denom ? consumption / denom : null, consumption, orders: denom,
        technicians: new Set(ok.map(x => x.tech)).size, intervals: ok.length, intervals_total: mine.length,
        alerts: mine.filter(x => x.status === 'ALERTA_CONCILIACION').length, not_verifiable: mine.filter(x => x.status === 'NO_VERIFICABLE').length,
        without_orders: mine.filter(x => x.status === 'SIN_ORDENES').length,
        period: ok.length ? { from: ok.map(x => x.start).sort()[0], to: ok.map(x => x.end).sort().at(-1) } : null,
        last_count: counts.map(x => x.date).sort().at(-1) || null, technicians_counted: counts.length,
        technicians_two_counts: counts.filter(x => x.observations >= 2).length,
        state: denom ? 'CALCULADO' : counts.length ? (counts.some(x => x.observations >= 2) ? 'SIN_INTERVALO_VALIDO' : 'PENDIENTE_LINEA_BASE') : 'SIN_TOMAS',
        returns_documented: false,
      },
      proxy: {
        per_order: proxyOrders && !unknown && !unmapped ? dispatched / proxyOrders : null, dispatched, orders: proxyOrders,
        technicians: receivers.size, months, unknown_lines: unknown, unmapped_lines: unmapped,
        label: 'PROXY: DESPACHO / ORDEN (NO CONSUMO OBSERVADO)',
      },
    };
  });
}

function monthsClosed(start, cut) {
  if (!start || !cut) return [];
  const months = [], first = start.slice(8, 10) === '01' ? start.slice(0, 7) : next(start.slice(0, 7));
  const lastDay = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).toISOString().slice(0, 10);
  const last = cut === lastDay(cut) ? cut.slice(0, 7) : prev(cut.slice(0, 7));
  for (let m = first; m <= last; m = next(m)) months.push(m);
  return months;
}
function next(m) { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)); return d.toISOString().slice(0, 7); }
function prev(m) { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)); return d.toISOString().slice(0, 7); }
