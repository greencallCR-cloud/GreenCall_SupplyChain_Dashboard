// Spec v3 §4: consumption per order from physical balances (synthetic data only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicalIntervals, consumptionPerOrder } from '../src/consumption-per-order.mjs';
import { number } from '../src/core.mjs';

const c = (tech, date, count, sku = 'PEND-TENSORES', description = 'TENSORES') => ({ tech, tech_name: 'Tech ' + tech, sku, description, date, count, take: date });
const d = (tech, date, quantity, description = 'TENSOR') => ({ sku: '', description, date, quantity, cost: 800, value: quantity === null ? null : quantity * 800, tech_name: 'Tech ' + tech });
const orders = (tech, dates) => dates.map((date, i) => ({ order: `${tech}-${date}-${i}`, tech, date }));

test('balance = initial + dispatches(t0,t1] − final; per order uses unique orders of the technician in (t0,t1]', () => {
  const { intervals } = physicalIntervals({
    counts: [c('T1', '2026-09-01', 10), c('T1', '2026-09-15', 4)],
    dispatches: [d('T1', '2026-09-01', 99), d('T1', '2026-09-05', 20), d('T1', '2026-09-15', 6), d('T2', '2026-09-05', 50)],
    orders: [...orders('T1', ['2026-09-01', '2026-09-02', '2026-09-10', '2026-09-15']), { order: 'T1-2026-09-02-1', tech: 'T1', date: '2026-09-02' }, ...orders('T2', ['2026-09-03'])],
    number,
  });
  assert.equal(intervals.length, 1);
  const it = intervals[0];
  assert.equal(it.replenishments, 26, 'dispatch on t0 excluded, on t1 included, other technician excluded, alias TENSOR matched');
  assert.equal(it.consumption, 10 + 26 - 4);
  assert.equal(it.orders, 3, 'order on t0 excluded; duplicate lines of one order counted once');
  assert.equal(it.per_order, 32 / 3); assert.equal(it.status, 'VALIDO');
});

test('negative balance is a reconciliation alert (not clipped); zero orders is N/D; unknown quantity is not verifiable', () => {
  const { intervals } = physicalIntervals({
    counts: [c('T1', '2026-09-01', 5), c('T1', '2026-09-10', 9), c('T2', '2026-09-01', 5), c('T2', '2026-09-10', 1), c('T3', '2026-09-01', 5), c('T3', '2026-09-10', 1)],
    dispatches: [{ ...d('T3', '2026-09-05', null), cost: null, value: null }],
    orders: orders('T1', ['2026-09-05']), number,
  });
  const by = Object.fromEntries(intervals.map(x => [x.tech, x]));
  assert.equal(by.T1.status, 'ALERTA_CONCILIACION'); assert.equal(by.T1.consumption, -4); assert.equal(by.T1.per_order, null);
  assert.equal(by.T2.status, 'SIN_ORDENES'); assert.equal(by.T2.per_order, null);
  assert.equal(by.T3.status, 'NO_VERIFICABLE');
});

test('supply card aggregates SUM(consumption)/SUM(orders) and keeps the dispatch proxy separate', () => {
  const counts = [c('T1', '2026-09-01', 10), c('T1', '2026-09-11', 0), c('T2', '2026-09-01', 0), c('T2', '2026-09-11', 2), c('T3', '2026-09-20', 7)];
  const dispatches = [d('T2', '2026-09-03', 12), d('T1', '2026-06-10', 30), d('T2', '2026-07-10', 10)];
  const ord = [...orders('T1', ['2026-09-02', '2026-09-03']), ...orders('T2', Array(8).fill('2026-09-04')), ...orders('T1', ['2026-06-11', '2026-06-12']), ...orders('T2', ['2026-07-11', '2026-07-12'])];
  const { intervals, latest } = physicalIntervals({ counts, dispatches, orders: ord, number });
  const card = consumptionPerOrder({ intervals, latest, dispatches, orders: ord, number, dispatchStart: '2026-06-01', dispatchCut: '2026-09-25', techCodeByName: new Map([['TECH T1', 'T1'], ['TECH T2', 'T2']]) }).find(x => x.supply === 'TENSORES');
  assert.equal(card.physical.consumption, 10 + 10); assert.equal(card.physical.orders, 2 + 8);
  assert.equal(card.physical.per_order, 2, 'weighted, not the mean of 5 and 1.25');
  assert.equal(card.physical.technicians, 2); assert.equal(card.physical.technicians_counted, 3); assert.equal(card.physical.state, 'CALCULADO');
  assert.deepEqual(card.proxy.months, ['2026-06', '2026-07', '2026-08'], 'September is the partial closing month');
  assert.equal(card.proxy.dispatched, 40); assert.equal(card.proxy.orders, 4); assert.equal(card.proxy.per_order, 10);
  assert.match(card.proxy.label, /NO CONSUMO OBSERVADO/);
  const toallas = consumptionPerOrder({ intervals, latest, dispatches, orders: ord, number, dispatchStart: '2026-06-01', dispatchCut: '2026-09-25' }).find(x => x.supply === 'TOALLAS');
  assert.equal(toallas.physical.state, 'SIN_TOMAS'); assert.equal(toallas.physical.per_order, null);
});

test('a single count without a verified baseline is pending, never a fabricated consumption', () => {
  const { intervals, latest } = physicalIntervals({ counts: [c('T1', '2026-09-01', 3)], dispatches: [d('T1', '2026-08-01', 10)], orders: orders('T1', ['2026-08-02']), number });
  assert.equal(intervals.length, 0);
  const card = consumptionPerOrder({ intervals, latest, dispatches: [], orders: [], number, dispatchStart: null, dispatchCut: null }).find(x => x.supply === 'TENSORES');
  assert.equal(card.physical.state, 'PENDIENTE_LINEA_BASE'); assert.equal(card.physical.per_order, null);
});
