// Spec v3 (HERRAJE DSG08): one seasonal cycle is not evidence of seasonality. A run of zero
// months caused by a temporary substitution must not be copied into next year's forecast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastMonthly } from '../src/forecast.mjs';

const monthsFrom = (start, n) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5) - 1 + i, 1)); return d.toISOString().slice(0, 7); });
// Synthetic shape of the case: ramp-up, four substituted (zero) months, recovery, one missing month.
const values = [17, 82, 118, 183, 207, 201, 300, 343, 353, 333, 347, 110, 0, 0, 0, 0, 22, 236, 217, null, 322, 293, 405];

test('seasonal naive needs two full cycles (24 known months)', () => {
  const f = forecastMonthly(values, monthsFrom('2024-11', values.length), { horizon: 12 });
  assert.notEqual(f.model, 'seasonal', 'only 22 known months: seasonality is not identifiable');
  assert.ok(!f.evaluation.candidates.some(c => c.name === 'seasonal'));
  assert.ok(f.pred.slice(0, 4).every(v => v > 0), 'no zero forecast copied from the substitution gap: ' + f.pred.slice(0, 4));
});

test('with two full cycles seasonal remains a candidate', () => {
  const season = [10, 12, 30, 60, 90, 120, 120, 90, 60, 30, 12, 10];
  const long = [...season, ...season.map(x => x + 5), ...season.map(x => x + 10)];
  const f = forecastMonthly(long, monthsFrom('2023-01', long.length), { horizon: 12 });
  assert.ok(f.evaluation.candidates.some(c => c.name === 'seasonal'));
});
