import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastMonthly } from '../src/forecast.mjs';

// Synthetic series only.
const months = n => Array.from({ length: n }, (_, i) => `${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`);
const steady = n => Array.from({ length: n }, (_, i) => 100 + (i % 3) * 5);

test('an interior unknown month is handled as missing, not zero, and the forecast proceeds', () => {
  const v = steady(24); v[18] = null;
  const f = forecastMonthly(v, months(24));
  assert.notEqual(f.model, 'Sin datos');
  assert.deepEqual(f.missing_months, [months(24)[18]]);
  assert.ok(f.pred[0] > 80 && f.pred[0] < 130, 'projection stays at the observed level, not dragged to zero');
  assert.match(f.data_quality_note, /no se imputa/i);
});

test('validation never scores against the unknown month', () => {
  const v = steady(24); v[21] = null;
  const f = forecastMonthly(v, months(24));
  const scored = f.evaluation.candidates.flatMap(c => c.folds.map(x => x.month));
  assert.ok(!scored.includes(months(24)[21]));
  for (const h of Object.values(f.evaluation.by_horizon)) for (const o of h.origins) assert.ok(o.actual.every((x, i) => x !== null || !o.scored?.[i]));
});

test('unknown first/last month, too many gaps or too few observations stay non calculable', () => {
  const last = steady(24); last[23] = null;
  assert.equal(forecastMonthly(last, months(24)).model, 'Sin datos');
  const many = steady(20); for (const i of [3, 6, 9, 12]) many[i] = null;
  assert.equal(forecastMonthly(many, months(20)).model, 'Sin datos');
  const short = [10, null, 12, 11, 13]; 
  assert.equal(forecastMonthly(short, months(5)).model, 'Sin datos');
});

test('complete series behave exactly as before (no missing metadata)', () => {
  const f = forecastMonthly(steady(24), months(24));
  assert.deepEqual(f.missing_months, []);
});
