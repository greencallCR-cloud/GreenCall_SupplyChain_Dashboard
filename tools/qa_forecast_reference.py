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
report={'fixture':'SYNTHETIC_METHOD_CHECK_ONLY','statsmodels_version':statsmodels.__version__,'polars_version':pl.__version__,'reference_predictions':checks,'independently_recomputed_candidate_metrics':metric_checks,'real_data_validation':False}
Path('work/forecast-reference-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
