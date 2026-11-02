import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastOne, forecastMonthly} from '../src/forecast.mjs';

// Explicitly synthetic monthly demand; no operational observations.
const months = n => Array.from({length:n}, (_,i) => new Date(Date.UTC(2020,i,1)).toISOString().slice(0,7));
const horizons = [3,6,12];

test('partial closing months validate the same skipped lead as the displayed forecast',()=>{
 const calendar=months(30),values=Array.from({length:30},(_,i)=>10+i);
 const result=forecastMonthly(values,calendar,{horizon:3,cutoff:'2022-06-15'});
 assert.deepEqual(result.forecast_months,['2022-07','2022-08','2022-09']);
 const evaluation=result.evaluation.by_horizon[3];
 assert.equal(evaluation.lead_start,2);assert.equal(evaluation.lead_end,4);
 for(const origin of evaluation.origins){
  assert.equal(calendar.indexOf(origin.months[0])-calendar.indexOf(origin.train_end),2);
  const prefix=forecastOne(values.slice(0,origin.training_observations),calendar.slice(0,origin.training_observations),4);
  assert.deepEqual(origin.predicted.map(x=>Math.round(x*100)/100),prefix.pred.slice(1));
 }
});

test('multi-month validation reports complete origins and equal naive baseline targets', () => {
  const calendar = months(30), forecast = forecastOne(Array(30).fill(10),calendar,12);
  assert.ok(forecast.evaluation.by_horizon, 'multi-month validation diagnostics are present');
  for (const horizon of horizons) {
    const evaluation = forecast.evaluation.by_horizon[horizon];
    assert.equal(evaluation.status,'EVALUADO');
    assert.equal(evaluation.method,'NESTED_ROLLING_ORIGIN');
    assert.equal(evaluation.evaluated_subject,'MODEL_SELECTION_PROCEDURE');
    assert.equal(evaluation.selection_horizon,1);
    assert.equal(evaluation.observed_horizon,horizon);
    assert.equal(evaluation.backtests,6);
    assert.equal(evaluation.observations,6*horizon);
    assert.deepEqual([evaluation.mae,evaluation.wape,evaluation.smape],[0,0,0]);
    assert.deepEqual(evaluation.baseline,{model:'naive',mae:0,wape:0,smape:0});
    assert.equal(evaluation.origins.at(-1).train_end,calendar[29-horizon]);
    for (const origin of evaluation.origins) {
      assert.equal(origin.months.length,horizon);
      assert.ok(origin.train_end<origin.months[0]);
      assert.equal(origin.inner_backtests,6);
      assert.equal(origin.actual.length,horizon);
      assert.deepEqual(origin.predicted,Array(horizon).fill(10));
      assert.deepEqual(origin.baseline_predicted,Array(horizon).fill(10));
    }
    assert.ok(evaluation.overlap_note);
  }
  // Existing metrics still describe one-step candidate selection.
  assert.equal(forecast.evaluation.horizon,1);
  assert.equal(forecast.evaluation.method,'ROLLING_ORIGIN');
  assert.equal(forecast.pred.length,12);
});

test('insufficient full horizons have unknown metrics rather than zero errors', () => {
  for (const horizon of horizons) {
    const n=horizon+9, evaluation=forecastOne(Array(n).fill(10),months(n),12).evaluation.by_horizon?.[horizon];
    assert.ok(evaluation,'missing horizon diagnostics');
    assert.equal(evaluation.status,'DATOS_INSUFICIENTES');
    assert.equal(evaluation.observed_horizon,null);
    assert.equal(evaluation.available_origins,2);
    assert.equal(evaluation.backtests,0);
    assert.equal(evaluation.observations,0);
    assert.equal(evaluation.min_origins,3);
    assert.deepEqual(evaluation.origins,[]);
    assert.deepEqual([evaluation.mae,evaluation.wape,evaluation.smape],[null,null,null]);
    assert.deepEqual(evaluation.baseline,{model:'naive',mae:null,wape:null,smape:null});
  }
  for (const forecast of [forecastOne([],[],12),forecastMonthly([10,null],months(2),{horizon:12})]) {
    for (const horizon of horizons) {
      const evaluation=forecast.evaluation.by_horizon?.[horizon];
      assert.equal(evaluation?.status,'DATOS_INSUFICIENTES');
      assert.equal(evaluation.available_origins,0);
      assert.equal(evaluation.mae,null);
    }
  }
});

test('nested horizon predictions and model choice cannot see their own future targets', () => {
  const calendar=months(30), values=Array.from({length:30},(_,i)=>20+i*.7+[0,2,-1,1,-2][i%5]);
  const initial=forecastOne(values,calendar,12);
  for (const horizon of horizons) {
    const evaluation=initial.evaluation.by_horizon?.[horizon];
    assert.ok(evaluation,'missing horizon diagnostics');
    const origin=evaluation.origins[0], firstTarget=calendar.indexOf(origin.months[0]);
    const altered=values.map((value,i)=>i<firstTarget?value:(i%2?0:10000));
    const revised=forecastOne(altered,calendar,12).evaluation.by_horizon[horizon].origins[0];
    for (const key of ['train_end','selected_model','selection_metric','inner_backtests','eligibility_as_of','predicted','baseline_predicted']) {
      assert.deepEqual(revised[key],origin[key],`${horizon} months: ${key} changed after future perturbation`);
    }
    assert.notDeepEqual(revised.actual,origin.actual);
    const prefix=forecastOne(values.slice(0,firstTarget),calendar.slice(0,firstTarget),horizon);
    assert.equal(origin.selected_model,prefix.model);
    assert.equal(origin.selection_metric,prefix.evaluation.selection_metric);
    assert.equal(origin.eligibility_as_of,prefix.evaluation.eligibility_as_of);
    // Public final predictions are rounded; validation retains full precision.
    assert.deepEqual(origin.predicted.map(x=>Math.round(x*100)/100),prefix.pred);
  }
});

test('horizon metrics aggregate origin-target pairs with hand-checked errors', () => {
  const values=[10,10,10,10,10,10,10,10,10,20,20,20,20];
  const evaluation=forecastOne(values,months(values.length),12).evaluation.by_horizon?.[3];
  assert.ok(evaluation,'missing horizon diagnostics');
  assert.equal(evaluation.status,'EVALUADO');
  assert.equal(evaluation.backtests,3);
  assert.equal(evaluation.observations,9);
  assert.deepEqual(evaluation.origins.map(x=>x.predicted),[[10,10,10],[10,10,10],[20,20,20]]);
  assert.ok(Math.abs(evaluation.mae-50/9)<1e-12);
  assert.ok(Math.abs(evaluation.wape-500/17)<1e-12);
  assert.ok(Math.abs(evaluation.smape-1000/27)<1e-12);
  for (const metric of ['mae','wape','smape']) assert.equal(evaluation.baseline[metric],evaluation[metric]);
});

test('zero actual horizon demand has undefined WAPE and finite zero-pair sMAPE', () => {
  const forecast=forecastOne(Array(24).fill(0),months(24),12);
  assert.ok(forecast.evaluation.by_horizon,'missing horizon diagnostics');
  for (const horizon of horizons) {
    const evaluation=forecast.evaluation.by_horizon[horizon];
    assert.equal(evaluation.status,'EVALUADO');
    assert.deepEqual([evaluation.mae,evaluation.wape,evaluation.smape],[0,null,0]);
    assert.deepEqual(evaluation.baseline,{model:'naive',mae:0,wape:null,smape:0});
  }
});

test('partial months are excluded from nested horizon selection and target validation', () => {
  const calendar=months(25), values=Array(25).fill(10);
  values[24]=10000;
  const forecast=forecastMonthly(values,calendar,{horizon:12,cutoff:'2022-01-15'});
  assert.equal(forecast.observations,24);
  const evaluation=forecast.evaluation.by_horizon?.[12];
  assert.ok(evaluation,'missing horizon diagnostics');
  assert.equal(evaluation.observed_horizon,12);
  assert.equal(evaluation.origins.at(-1).months.at(-1),'2021-12');
  assert.equal(evaluation.mae,0);
});
