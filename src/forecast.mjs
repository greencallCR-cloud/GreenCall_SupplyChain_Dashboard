// Deterministic monthly demand forecasts. No Python/runtime dependencies.
// Candidate eligibility is frozen before the first validation target is seen.
const total = a => a.reduce((sum, x) => sum + x, 0);
const finiteDemand = a => Array.isArray(a) && a.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0);
const monthIndex = m => +m.slice(0, 4) * 12 + +m.slice(5, 7) - 1;
const monthAt = i => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`;
const validMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const monthEnd = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);
const nextMonths = (m, n) => m ? Array.from({length: n}, (_, i) => monthAt(monthIndex(m) + i + 1)) : [];

export function forecastMetrics(actual, predicted) {
  if (!finiteDemand(actual) || !finiteDemand(predicted) || actual.length !== predicted.length) {
    throw new TypeError('Forecast metrics require aligned finite nonnegative observations.');
  }
  if (!actual.length) return {mae: null, wape: null, smape: null};
  const absoluteError = total(actual.map((x, i) => Math.abs(x - predicted[i])));
  const denominator = total(actual.map(Math.abs));
  return {
    mae: absoluteError / actual.length,
    wape: denominator > 0 ? 100 * absoluteError / denominator : null,
    // The zero/zero pair contributes zero, rather than an arbitrary epsilon.
    smape: 100 * total(actual.map((x, i) => {
      const d = Math.abs(x) + Math.abs(predicted[i]);
      return d ? 2 * Math.abs(x - predicted[i]) / d : 0;
    })) / actual.length,
  };
}

function demandPattern(values) {
  const positive = values.filter(x => x > 0), adi = positive.length ? values.length / positive.length : Infinity;
  const mean = positive.length ? total(positive) / positive.length : 0;
  const cv2 = positive.length > 1 ? total(positive.map(x => (x - mean) ** 2)) / (positive.length * mean ** 2) : 0;
  return {pattern: adi >= 1.32 ? (cv2 >= .49 ? 'Lumpy' : 'Intermittent') : (cv2 >= .49 ? 'Erratic' : 'Smooth'), adi: Number.isFinite(adi) ? adi : null, cv2};
}

function holt(values, horizon, damping = 1) {
  let level = values[0], trend = values[1] - values[0];
  for (const x of values.slice(1)) {
    const previous = level;
    level = .4 * x + .6 * (level + damping * trend);
    trend = .2 * (level - previous) + .8 * damping * trend;
  }
  return Array.from({length: horizon}, (_, i) => level + trend * (damping === 1 ? i + 1 : damping * (1 - damping ** (i + 1)) / (1 - damping)));
}

function winters(values, horizon, multiplicative = false) {
  const period = 12, first = total(values.slice(0, period)) / period, second = total(values.slice(period, period * 2)) / period;
  let level = first, trend = (second - first) / period;
  const seasonal = values.slice(0, period).map(x => multiplicative ? x / first : x - first);
  for (let i = period; i < values.length; i++) {
    const k = i % period, previous = level, oldSeason = seasonal[k];
    level = .28 * (multiplicative ? values[i] / oldSeason : values[i] - oldSeason) + .72 * (level + trend);
    trend = .09 * (level - previous) + .91 * trend;
    seasonal[k] = .15 * (multiplicative ? values[i] / level : values[i] - level) + .85 * oldSeason;
  }
  return Array.from({length: horizon}, (_, i) => {
    const projected = level + (i + 1) * trend, seasonalValue = seasonal[(values.length + i) % period];
    return multiplicative ? projected * seasonalValue : projected + seasonalValue;
  });
}

function croston(values, horizon) {
  let size = 0, interval = 1, last = 0, initialized = false;
  for (let i = 0; i < values.length; i++) if (values[i] > 0) {
    if (!initialized) {size = values[i]; interval = i + 1; initialized = true;}
    else {size = .2 * values[i] + .8 * size; interval = .2 * (i - last) + .8 * interval;}
    last = i;
  }
  return Array(horizon).fill(size / interval);
}

const models = {
  naive: (a, h) => Array(h).fill(a.at(-1)),
  ma3: (a, h) => Array(h).fill(total(a.slice(-3)) / Math.min(a.length, 3)),
  ma6: (a, h) => Array(h).fill(total(a.slice(-6)) / Math.min(a.length, 6)),
  ses: (a, h) => {let level = a[0]; for (const x of a.slice(1)) level = .35 * x + .65 * level; return Array(h).fill(level);},
  holt: (a, h) => holt(a, h),
  damped: (a, h) => holt(a, h, .8),
  croston,
  sba: (a, h) => croston(a, h).map(x => .9 * x),
  tsb: (a, h) => {
    let probability = a[0] > 0 ? 1 : 0, size = 0, initialized = false;
    for (const x of a) {
      probability = .2 * Number(x > 0) + .8 * probability;
      if (x > 0) {size = initialized ? .2 * x + .8 * size : x; initialized = true;}
    }
    return Array(h).fill(probability * size);
  },
  seasonal: (a, h) => Array.from({length: h}, (_, i) => a[a.length - 12 + i % 12]),
  hwadd: (a, h) => winters(a, h),
  hwmul: (a, h) => winters(a, h, true),
};

function eligibleModels(prefix) {
  const n = prefix.length, names = ['naive'];
  if (n >= 3) names.push('ma3', 'ses');
  if (n >= 6) names.push('ma6', 'holt', 'damped');
  if (n >= 8 && ['Intermittent', 'Lumpy'].includes(demandPattern(prefix).pattern)) names.push('croston', 'sba', 'tsb');
  if (n >= 12) names.push('seasonal');
  if (n >= 24) names.push('hwadd');
  if (n >= 24 && prefix.every(x => x > 0)) names.push('hwmul');
  return names;
}

function prediction(name, values, horizon) {
  if (name === 'hwmul' && values.some(x => x <= 0)) return null;
  const result = models[name](values, horizon);
  return result.every(Number.isFinite) ? result.map(x => Math.max(0, x)) : null;
}

// Shared by the final refit and each outer validation fold. Only this training
// prefix may determine eligibility, ranking and applicability of its model.
function selectForecast(values, months, horizon) {
  const n = values.length;
  // Every candidate is scored against the same last (at most six) targets.
  // Eligibility uses only the prefix before those targets, including pattern and positivity.
  const firstOrigin = Math.max(2, n - 6), canEvaluate = n >= 4;
  const prefix = values.slice(0, firstOrigin), candidates = [];
  if (canEvaluate) for (const name of eligibleModels(prefix)) {
    const folds = [];
    let status = 'EVALUADO';
    for (let t = firstOrigin; t < n; t++) {
      const projected = prediction(name, values.slice(0, t), 1);
      if (!projected) {status = 'NO_COMPARABLE'; break;}
      folds.push({train_end:months[t-1],month:months[t],actual:values[t],predicted:projected[0]});
    }
    candidates.push({name,status,folds,...(status==='EVALUADO'?forecastMetrics(folds.map(x=>x.actual),folds.map(x=>x.predicted)):{mae:null,wape:null,smape:null})});
  }
  const ranked = candidates.filter(x=>x.status==='EVALUADO').sort((a,b)=>(a.wape??a.mae)-(b.wape??b.mae)||a.mae-b.mae);
  let selected = ranked[0];
  // A model also has to remain applicable to the complete refit, e.g. multiplicative seasonality needs positive data.
  if (selected && !prediction(selected.name, values, horizon)) selected = ranked.find(x=>prediction(x.name,values,horizon));
  const winner = selected?.name || 'naive', projected = prediction(winner, values, horizon);
  return {selected,winner,projected,candidates,
    evaluation:{method:canEvaluate?'ROLLING_ORIGIN':'SIN_VALIDACION',horizon:1,selection_metric:selected?(selected.wape===null?'MAE':'WAPE'):null,eligibility_as_of:canEvaluate?months[firstOrigin-1]:null,pattern_at_eligibility:canEvaluate?demandPattern(prefix).pattern:null,parameters:'Coeficientes fijos; sin ajuste sobre validación.',candidates},
  };
}

function evaluateHorizons(values, months, leadOffset=0) {
  const minTraining=8, minOrigins=3, maxOrigins=6;
  return Object.fromEntries([3,6,12].map(horizon => {
    const availableOrigins=Math.min(maxOrigins,Math.max(0,values.length-horizon-leadOffset-minTraining+1));
    const base={method:'NESTED_ROLLING_ORIGIN',evaluated_subject:'MODEL_SELECTION_PROCEDURE',
      status:'DATOS_INSUFICIENTES',horizon,observed_horizon:null,lead_start:leadOffset+1,lead_end:leadOffset+horizon,selection_horizon:1,
      min_training_observations:minTraining,min_origins:minOrigins,max_origins:maxOrigins,
      available_origins:availableOrigins,backtests:0,observations:0,...forecastMetrics([],[]),
      baseline:{model:'naive',...forecastMetrics([],[])},origins:[],
      aggregation:'ALL_ORIGIN_TARGET_PAIRS',
      overlap_note:'Los orígenes mensuales pueden solaparse; cada par origen-mes pesa igual y los errores no son independientes.',
      reason:'Se requieren al menos tres orígenes completos, con ocho meses previos para selección interna a un mes.',
    };
    if (availableOrigins<minOrigins) return [horizon,base];
    const origins=[];
    for (let t=values.length-horizon-leadOffset-availableOrigins+1; t<=values.length-horizon-leadOffset; t++) {
      const prefix=values.slice(0,t), selection=selectForecast(prefix,months.slice(0,t),horizon+leadOffset);
      origins.push({train_end:months[t-1],training_observations:t,
        selected_model:selection.winner,selection_metric:selection.evaluation.selection_metric,
        inner_backtests:selection.selected?.folds.length||0,eligibility_as_of:selection.evaluation.eligibility_as_of,
        months:months.slice(t+leadOffset,t+leadOffset+horizon),actual:values.slice(t+leadOffset,t+leadOffset+horizon),
        predicted:selection.projected.slice(leadOffset),baseline_predicted:prediction('naive',prefix,horizon+leadOffset).slice(leadOffset),
      });
    }
    const actual=origins.flatMap(x=>x.actual);
    return [horizon,{...base,status:'EVALUADO',observed_horizon:horizon,backtests:origins.length,observations:actual.length,
      ...forecastMetrics(actual,origins.flatMap(x=>x.predicted)),
      baseline:{model:'naive',...forecastMetrics(actual,origins.flatMap(x=>x.baseline_predicted))},origins,reason:null,
    }];
  }));
}

export function forecastOne(values, months, horizon = 6, {leadOffset=0}={}) {
  if (!finiteDemand(values) || !Array.isArray(months) || values.length !== months.length || !months.every(validMonth)
    || months.some((m, i) => i > 0 && monthIndex(m) !== monthIndex(months[i - 1]) + 1)) {
    throw new TypeError('Forecast requires finite nonnegative values on an aligned consecutive monthly grid.');
  }
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 160) throw new RangeError('Invalid forecast horizon.');
  if(!Number.isInteger(leadOffset)||leadOffset<0||leadOffset>160)throw new RangeError('Invalid validation lead offset.');
  const n = values.length, by_horizon=evaluateHorizons(values,months,leadOffset);
  const base = {model:'Sin datos',pred:[],low:[],high:[],confidence:'NO CALCULABLE',mae:null,wape:null,smape:null,pattern:'Desconocido',observations:n,backtests:0,candidate_count:0,interval_method:'NO_CALIBRADO',training_start:months[0]||null,training_end:months.at(-1)||null,forecast_months:nextMonths(months.at(-1),horizon),forecast_start:nextMonths(months.at(-1),1)[0]||null};
  if (!n) return {...base,evaluation:{method:'SIN_VALIDACION',horizon:1,candidates:[],by_horizon}};
  const {selected,winner,projected,candidates,evaluation}=selectForecast(values,months,horizon);
  const pred = projected.map(x=>Math.round(x*100)/100), backtests=selected?.folds.length||0;
  return {...base,...demandPattern(values),model:winner,pred,low:pred.map(()=>null),high:pred.map(()=>null),
    mae:selected?.mae??null,wape:selected?.wape??null,smape:selected?.smape??null,backtests,candidate_count:candidates.length,
    confidence:backtests<3?'SIN VALIDAR':backtests<6?'LIMITADA':selected.wape!==null&&selected.wape<30?'MEDIA':'BAJA',
    confidence_basis:'Grado heurístico del backtest a un mes; no es probabilidad ni validación de los 12 meses.',
    evaluation:{...evaluation,by_horizon},
  };
}

export function forecastMonthly(values, months, {horizon=12, cutoff=null, coverageStart=null, cutoffBasis='ULTIMO_EVENTO_OBSERVADO'}={}) {
  const excluded = [];
  const isOpeningPartial = months.length && coverageStart && coverageStart.slice(0,7)===months[0] && coverageStart.slice(8,10)!=='01';
  const isClosingPartial = months.length && cutoff && cutoff.slice(0,7)===months.at(-1) && cutoff<monthEnd(months.at(-1));
  if (isOpeningPartial) excluded.push({month:months[0],reason:'INICIO_PARCIAL'});
  if (isClosingPartial && !excluded.some(x=>x.month===months.at(-1))) excluded.push({month:months.at(-1),reason:'CIERRE_PARCIAL_O_NO_ACREDITADO'});
  const start=isOpeningPartial?1:0, end=isClosingPartial?Math.max(start,months.length-1):months.length;
  const trainingMonths=months.slice(start,end), trainingValues=values.slice(start,end);
  const invalidMonths=months.filter((_,i)=>!finiteDemand([values[i]]));
  if (trainingValues.some(x=>!finiteDemand([x]))) {
    return {...forecastOne([],[],horizon),excluded_months:excluded,partial_month:isClosingPartial?months.at(-1):null,
      cutoff,cutoff_basis:cutoffBasis,training_months:[],invalid_months:invalidMonths,
      non_calculable_reason:'CANTIDADES_NO_VERIFICABLES',
      data_quality_note:'Cantidades no verificables impiden el ajuste: los meses afectados no se imputan como demanda cero.',
    };
  }
  const anchor = cutoff && validMonth(cutoff.slice(0,7)) && cutoff.slice(0,7)>(months.at(-1)||'') ? cutoff.slice(0,7) : months.at(-1);
  const skipped = trainingMonths.length ? Math.max(0,monthIndex(anchor)-monthIndex(trainingMonths.at(-1))) : 0;
  const forecast = forecastOne(trainingValues,trainingMonths,horizon+skipped,{leadOffset:skipped});
  for(const key of ['pred','low','high']) forecast[key]=forecast[key].slice(skipped);
  forecast.forecast_months=forecast.pred.length?nextMonths(anchor,horizon):[];
  forecast.forecast_start=forecast.forecast_months[0]||null;
  return {...forecast,excluded_months:excluded,partial_month:isClosingPartial?months.at(-1):null,invalid_months:invalidMonths,
    cutoff,cutoff_basis:cutoffBasis,training_months:trainingMonths,
    data_quality_note:excluded.length?'Meses de borde parciales o sin cierre acreditado excluidos del ajuste y del backtest.':null,
    completeness_note:'El último evento no certifica cobertura del origen. Meses interiores sin eventos se tratan como cero dentro del histórico cargado; verificar integridad de la extracción.',
  };
}
