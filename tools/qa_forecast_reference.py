"""Development-only synthetic reference checks; no operational data or runtime dependency.

From the repository root:
  uv venv work/forecast-venv
  uv pip install --python work/forecast-venv/bin/python statsmodels==0.15.0 polars==1.44.2
  node tools/forecast_reference_input.mjs
  work/forecast-venv/bin/python tools/qa_forecast_reference.py

Generated input/report stay under ignored work/. Python dependencies are optional QA tools,
not dependencies of the application. This check does not establish accuracy on GreenCall data.
"""
import json
from pathlib import Path
import statsmodels
import polars as pl
from statsmodels.tsa.holtwinters import SimpleExpSmoothing, Holt

payload=json.loads(Path('work/forecast-reference-input.json').read_text())
assert payload.get('synthetic') is True, 'Only the explicitly synthetic reference fixture is accepted.'
values=payload['values']
checks=[]
for candidate in payload['forecast']['evaluation']['candidates']:
    if candidate['name'] not in ('ses','holt','damped'):
        continue
    max_error=0.0
    for fold in candidate['folds']:
        t=payload['months'].index(fold['month'])
        train=values[:t]
        if candidate['name']=='ses':
            model=SimpleExpSmoothing(train,initialization_method='known',initial_level=train[0])
            fitted=model.fit(smoothing_level=.35,optimized=False)
        else:
            damped=candidate['name']=='damped'
            # JS consumes the first value as initialization, then updates from the second.
            model=Holt(train[1:],initialization_method='known',initial_level=train[0],initial_trend=train[1]-train[0],damped_trend=damped)
            kwargs={'smoothing_level':.4,'smoothing_trend':.2,'optimized':False}
            if damped:
                kwargs['damping_trend']=.8
            fitted=model.fit(**kwargs)
        reference=max(0,float(fitted.forecast(1)[0]))
        error=abs(reference-fold['predicted'])
        assert error<1e-10,(candidate['name'],error)
        max_error=max(max_error,error)
    checks.append({'model':candidate['name'],'folds':len(candidate['folds']),'maximum_absolute_difference':max_error})

# Independent columnar definitions of the validation metrics for every candidate.
metric_checks=0
for candidate in payload['forecast']['evaluation']['candidates']:
    if candidate['status']!='EVALUADO':
        continue
    frame=pl.DataFrame(candidate['folds']).lazy().with_columns((pl.col('actual')-pl.col('predicted')).abs().alias('absolute_error'))
    result=frame.select(
        pl.col('absolute_error').mean().alias('mae'),
        (100*pl.col('absolute_error').sum()/pl.col('actual').abs().sum()).alias('wape'),
        (100*(2*pl.col('absolute_error')/(pl.col('actual').abs()+pl.col('predicted').abs())).mean()).alias('smape'),
    ).collect().row(0,named=True)
    for name in ('mae','wape','smape'):
        assert abs(result[name]-candidate[name])<1e-10,(candidate['name'],name,result[name],candidate[name])
    metric_checks+=1
# Independent multi-step refits and metrics on the nested outer folds. The
# fixture's selected models are all supported below; an unverified model fails
# instead of silently dropping its origins from the reference comparison.
def outer_reference(name, train, horizon):
    if name == 'naive':
        return [train[-1]] * horizon
    if name in ('ma3', 'ma6'):
        window = 3 if name == 'ma3' else 6
        return [pl.Series(train[-window:], dtype=pl.Float64).mean()] * horizon
    if name == 'ses':
        model = SimpleExpSmoothing(train, initialization_method='known', initial_level=train[0])
        fitted = model.fit(smoothing_level=.35, optimized=False)
    elif name in ('holt', 'damped'):
        damped = name == 'damped'
        model = Holt(train[1:], initialization_method='known', initial_level=train[0], initial_trend=train[1]-train[0], damped_trend=damped)
        kwargs = {'smoothing_level': .4, 'smoothing_trend': .2, 'optimized': False}
        if damped:
            kwargs['damping_trend'] = .8
        fitted = model.fit(**kwargs)
    else:
        raise AssertionError(f'Outer model has no independent reference: {name}')
    return [max(0, float(value)) for value in fitted.forecast(horizon)]

def outer_metrics(rows):
    frame = pl.DataFrame(rows, schema={'actual':pl.Float64, 'predicted':pl.Float64}).lazy().with_columns(
        (pl.col('actual')-pl.col('predicted')).abs().alias('absolute_error'),
        (pl.col('actual').abs()+pl.col('predicted').abs()).alias('pair_denominator'),
    )
    return frame.select(
        pl.col('absolute_error').mean().alias('mae'),
        pl.when(pl.col('actual').abs().sum() > 0)
          .then(100*pl.col('absolute_error').sum()/pl.col('actual').abs().sum())
          .otherwise(None).alias('wape'),
        (100*pl.when(pl.col('pair_denominator') > 0)
          .then(2*pl.col('absolute_error')/pl.col('pair_denominator'))
          .otherwise(0).mean()).alias('smape'),
    ).collect().row(0, named=True)

horizon_checks = []
for horizon_text, evaluation in payload['forecast']['evaluation']['by_horizon'].items():
    horizon = int(horizon_text)
    assert evaluation['status'] == 'EVALUADO'
    selected_rows, baseline_rows, max_error = [], [], 0.0
    for origin in evaluation['origins']:
        t = payload['months'].index(origin['months'][0])
        train, actual = values[:t], values[t:t+horizon]
        assert origin['actual'] == actual
        reference = outer_reference(origin['selected_model'], train, horizon)
        assert len(reference) == len(origin['predicted']) == horizon
        for step, (want, observed) in enumerate(zip(reference, origin['predicted'])):
            error = abs(want-observed)
            assert error < 1e-10, (horizon, origin['selected_model'], step, error)
            max_error = max(max_error, error)
            selected_rows.append({'actual':actual[step], 'predicted':want})
            baseline_rows.append({'actual':actual[step], 'predicted':train[-1]})
        assert origin['baseline_predicted'] == [train[-1]] * horizon
    for source, rows in ((evaluation, selected_rows), (evaluation['baseline'], baseline_rows)):
        reference = outer_metrics(rows)
        for metric in ('mae', 'wape', 'smape'):
            assert abs(source[metric]-reference[metric]) < 1e-10, (horizon, metric, source[metric], reference[metric])
    assert evaluation['observations'] == len(selected_rows)
    horizon_checks.append({'horizon':horizon,'origins':len(evaluation['origins']),
                           'observations':len(selected_rows),'maximum_absolute_difference':max_error})

report={'fixture':'SYNTHETIC_METHOD_CHECK_ONLY','statsmodels_version':statsmodels.__version__,'polars_version':pl.__version__,'reference_predictions':checks,'independently_recomputed_candidate_metrics':metric_checks,'nested_horizon_references':horizon_checks,'real_data_validation':False}
Path('work/forecast-reference-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
