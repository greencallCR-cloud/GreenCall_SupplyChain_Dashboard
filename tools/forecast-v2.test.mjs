import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../src/core.mjs';

// Synthetic regression fixtures: these quantities are not GreenCall observations.
const month = (index) => new Date(Date.UTC(2024, index, 1)).toISOString().slice(0, 7);
const monthEnd = (index) => new Date(Date.UTC(2024, index + 1, 0)).toISOString().slice(0, 10);
const source = (count = 12) => ({tables: {
  sku_catalog: [{sku: 'SYNTHETIC', description: 'Synthetic material', unit: 'PZA'}],
  google_consumos: Array.from({length: count}, (_, i) => ({order: `SYNTHETIC-${i}`, sku: 'SYNTHETIC', date: monthEnd(i), quantity: i + 1, tech: 'TEST'})),
}});

test('a historical daily cutoff excludes that partial month even when future source rows exist', () => {
  const data = source();
  data.tables.google_consumos.push({order:'SYNTHETIC-MID',sku:'SYNTHETIC',date:'2024-06-10',quantity:2,tech:'TEST'});
  const forecast = analyze(data, {}, {to: '2024-06-15'}).orderForecast;
  assert.equal(forecast.partial_month, '2024-06');
  assert.equal(forecast.observations, 5);
  assert.equal(forecast.forecast_start, '2024-07');
});

test('dispatch proxy respects the date and technician filter and has its own partial cutoff', () => {
  const data = source();
  data.tables.dispatch_nonserial = [
    {sku:'PEND-TENSORES',description:'Tensores',date:'2024-01-01',quantity:10,tech:'TEST'},
    {sku:'PEND-TENSORES',description:'Tensores',date:'2024-02-10',quantity:20,tech:'TEST'},
    {sku:'PEND-TENSORES',description:'Tensores',date:'2024-12-31',quantity:999,tech:'OTHER'},
  ];
  const forecast = analyze(data, {}, {tech:'TEST',to:'2024-02-15'}).forecasts.find(x=>x.sku==='PEND-TENSORES');
  assert.deepEqual(forecast.history.map(x=>x.units), [10,20]);
  assert.equal(forecast.partial_month, '2024-02');
  assert.equal(forecast.observations, 1);
  assert.equal(forecast.forecast_start, '2024-03');
});

test('an uncalibrated MAE multiplier is not exposed as a prediction interval', () => {
  const forecast = analyze(source()).orderForecast;
  assert.ok(forecast.low.every(x=>x===null));
  assert.ok(forecast.high.every(x=>x===null));
  assert.equal(forecast.interval_method, 'NO_CALIBRADO');
});

test('zero demand has undefined WAPE while MAE and sMAPE remain meaningful', () => {
  const data = source();
  data.tables.google_consumos.forEach(r=>r.quantity=0);
  const forecast = analyze(data).forecasts[0];
  assert.equal(forecast.wape, null);
  assert.equal(forecast.mae, 0);
  assert.equal(forecast.smape, 0);
});

test('all compared models use the same chronological origins and prefix eligibility', () => {
  const data = source(30);
  const forecast = analyze(data).forecasts[0];
  assert.equal(forecast.evaluation?.method, 'ROLLING_ORIGIN');
  assert.equal(forecast.evaluation.horizon, 1);
  assert.equal(forecast.backtests, 6);
  assert.ok(forecast.evaluation.candidates.some(x=>x.name==='hwadd'));
  const candidates = forecast.evaluation.candidates.filter(x=>x.status==='EVALUADO');
  assert.ok(candidates.length>1);
  assert.ok(candidates.every(x=>JSON.stringify(x.folds.map(f=>f.month))===JSON.stringify(candidates[0].folds.map(f=>f.month))));
  assert.ok(candidates.every(x=>x.folds.every(f=>f.train_end<f.month)));
});

test('future validation zeros do not retroactively enable intermittent candidates', () => {
  const data = source(18);
  data.tables.google_consumos.forEach((r,i)=>r.quantity=i<12?1:0);
  const forecast = analyze(data).forecasts[0];
  assert.ok(forecast.evaluation);
  assert.ok(!forecast.evaluation.candidates.some(x=>['croston','sba','tsb'].includes(x.name)));
  assert.equal(forecast.evaluation.eligibility_as_of, month(11));
});

test('Croston, SBA and TSB are compared on an intermittent training prefix', () => {
  const data = source(18);
  data.tables.google_consumos.forEach((r,i)=>r.quantity=i%3===0?9:0);
  const forecast = analyze(data).forecasts[0];
  assert.ok(forecast.evaluation);
  for(const name of ['croston','sba','tsb']){
    const candidate=forecast.evaluation.candidates.find(x=>x.name===name);
    assert.ok(candidate, name);
    assert.equal(candidate.folds.length,6);
    assert.ok(candidate.folds.every(x=>x.predicted>=0));
  }
});

test('a partial opening filter month is not fitted as a complete month', () => {
  const forecast = analyze(source(), {}, {from:'2024-01-15'}).orderForecast;
  assert.equal(forecast.observations, 11);
  assert.ok(forecast.excluded_months.some(x=>x.month==='2024-01'&&x.reason==='INICIO_PARCIAL'));
});

test('a selected month fixes the forecast origin before later loaded history', () => {
  const forecast=analyze(source(), {}, {month:'2024-06'}).orderForecast;
  assert.equal(forecast.forecast_start,'2024-07');
  assert.equal(forecast.cutoff,'2024-06-30');
});

test('Claro recovery materials do not fabricate a zero-order Google forecast', () => {
  const data=source();
  data.tables.claro_export=data.tables.google_consumos;
  data.tables.google_consumos=[];
  const forecast=analyze(data).orderForecast;
  assert.deepEqual(forecast.pred,[]);
  assert.equal(forecast.observations,0);
});

// Policy 2026-11 (owner request): an interior unverifiable month is a MISSING observation.
// It is never summed as zero; models carry their own prediction through the gap and are not scored on it.
test('missing material quantities stay unknown (never zero) and are handled as a missing observation', () => {
  const data=source();
  data.tables.google_consumos[5].quantity=null;
  const forecast=analyze(data).forecasts[0];
  assert.equal(forecast.history[5].units,null);
  assert.ok(forecast.invalid_months.includes('2024-06'));
  assert.deepEqual(forecast.missing_months,['2024-06']);
  assert.ok(forecast.pred.length>0&&forecast.pred.every(x=>x>0),'no zero dragged in by the unknown month');
  assert.match(forecast.data_quality_note,/no se imputa/);
  assert.ok(!forecast.evaluation.candidates.some(c=>c.folds.some(x=>x.month==='2024-06')));
});

test('negative proxy quantities stay unknown and are handled as a missing observation', () => {
  const data=source();
  data.tables.dispatch_nonserial=Array.from({length:12},(_,i)=>({sku:'PEND-TENSORES',description:'Tensores',date:monthEnd(i),quantity:i===5?-2:10,tech:'TEST'}));
  const forecast=analyze(data).forecasts.find(x=>x.sku==='PEND-TENSORES');
  assert.equal(forecast.history[5].units,null);
  assert.deepEqual(forecast.missing_months,[forecast.history[5].month]);
  assert.ok(forecast.pred.length>0&&forecast.pred.every(x=>x>0));
});

test('an unverifiable LAST month still prevents fitting (no forecast from an unknown edge)', () => {
  const data=source();
  data.tables.google_consumos.at(-1).quantity=null;
  const forecast=analyze(data).forecasts[0];
  assert.deepEqual(forecast.pred,[]);
  assert.equal(forecast.non_calculable_reason,'CANTIDADES_NO_VERIFICABLES');
});

test('the unvalidated order driver uses the same complete months as the fitted demand', () => {
  const data=source(6);
  data.tables.google_consumos.forEach(r=>r.quantity=10);
  Object.assign(data.tables.google_consumos[5],{date:'2024-06-10',quantity:999});
  const forecast=analyze(data).forecasts[0];
  assert.equal(forecast.partial_month,'2024-06');
  assert.equal(forecast.driver_pred[0],10);
});

test('an unvalidated baseline does not advertise a model-selection metric', async () => {
  const {forecastOne}=await import('../src/forecast.mjs');
  const forecast=forecastOne([10],['2024-01'],12);
  assert.equal(forecast.evaluation.method,'SIN_VALIDACION');
  assert.equal(forecast.evaluation.selection_metric,null);
});

test('an invalid month filter does not throw from forecast date construction', () => {
  assert.doesNotThrow(()=>analyze(source(), {}, {month:'invalid'}));
});

// Independent numeric checks on the public contract, beyond the integration regressions above.
test('metric definitions preserve fractional denominators and the zero/zero sMAPE convention', async () => {
  const {forecastMetrics}=await import('../src/forecast.mjs');
  const metrics=forecastMetrics([.2,.3],[.1,.1]);
  assert.ok(Math.abs(metrics.mae-.15)<1e-12);
  assert.ok(Math.abs(metrics.wape-60)<1e-12);
  assert.ok(Math.abs(metrics.smape-250/3)<1e-12);
  assert.deepEqual(forecastMetrics([0,0],[1,0]),{mae:.5,wape:null,smape:100});
  assert.deepEqual(forecastMetrics([],[]),{mae:null,wape:null,smape:null});
  assert.throws(()=>forecastMetrics([1],[1,2]),TypeError);
});

test('changing validation targets cannot change eligibility or the first fold prediction', async () => {
  const {forecastOne}=await import('../src/forecast.mjs');
  const months=Array.from({length:30},(_,i)=>month(i));
  const original=Array.from({length:30},(_,i)=>i+1), changed=[...original];
  for(let i=24;i<30;i++) changed[i]=0;
  const first=forecastOne(original,months,12), second=forecastOne(changed,months,12);
  assert.deepEqual(first.evaluation.candidates.map(x=>x.name),second.evaluation.candidates.map(x=>x.name));
  for(const candidate of first.evaluation.candidates){
    const other=second.evaluation.candidates.find(x=>x.name===candidate.name);
    assert.equal(other.folds[0].predicted,candidate.folds[0].predicted,candidate.name);
  }
  assert.equal(second.evaluation.candidates.find(x=>x.name==='hwmul').status,'NO_COMPARABLE');
  assert.notEqual(second.model,'hwmul');
});

test('one partial month provides no complete observations or fabricated predictions', () => {
  const data=source(1);
  data.tables.google_consumos[0].date='2024-01-15';
  const forecast=analyze(data).orderForecast;
  assert.deepEqual(forecast.pred,[]);
  assert.deepEqual(forecast.forecast_months,[]);
  assert.equal(forecast.observations,0);
  assert.equal(forecast.partial_month,'2024-01');
});

test('invalid quantities in an excluded closing month do not contaminate prior complete months', () => {
  const data=source(12);
  Object.assign(data.tables.google_consumos[11],{date:'2024-12-15',quantity:null});
  const forecast=analyze(data).forecasts[0];
  assert.equal(forecast.pred.length,12);
  assert.equal(forecast.observations,11);
  assert.equal(forecast.history[11].units,null);
  assert.equal(forecast.history[11].training,false);
  assert.ok(forecast.invalid_months.includes('2024-12'));
});

test('the order driver excludes an unknown month from both numerator and denominator', () => {
  const data=source();data.tables.google_consumos[5].quantity=null;
  const f=analyze(data).forecasts[0];
  assert.ok(Array.isArray(f.driver_pred));
  assert.ok(f.driver_pred.every(x=>Number.isFinite(x)&&x>=0));
});
