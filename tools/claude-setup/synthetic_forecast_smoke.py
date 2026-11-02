"""PRUEBA TÉCNICA CON DATOS SINTÉTICOS — NO SON DATOS DE GREENCALL.

Verifica que el entorno Python aislado puede ejecutar los métodos que el
proyecto necesita: MA, SES, Holt, Holt-Winters, Croston/SBA/TSB, backtesting
cronológico (rolling origin, sin fuga), MAE/WAPE/sMAPE, ABC y rotación con
Polars sobre volumen grande. No lee ni escribe ninguna fuente real.
Uso: ~/.greencall-sc/venv/bin/python -I tools/claude-setup/synthetic_forecast_smoke.py
"""
import time
import warnings

import numpy as np
import polars as pl
from statsmodels.tsa.holtwinters import ExponentialSmoothing, SimpleExpSmoothing

warnings.filterwarnings("ignore")
rng = np.random.default_rng(20261102)


def mae(y, f): return float(np.mean(np.abs(y - f)))
def wape(y, f): return float(np.sum(np.abs(y - f)) / max(np.sum(np.abs(y)), 1e-9))
def smape(y, f):
    d = np.abs(y) + np.abs(f)
    return float(np.mean(np.where(d == 0, 0, 2 * np.abs(y - f) / np.where(d == 0, 1, d))))


def croston(y, h, alpha=0.1, variant="croston"):
    z = p = None; q = 1; zs = ps = None
    for v in y:
        if v > 0:
            z = v if z is None else z + alpha * (v - z)
            p = q if p is None else p + alpha * (q - p)
            q = 1
        else:
            q += 1
    if z is None: return np.zeros(h)
    f = z / p
    if variant == "sba": f *= (1 - alpha / 2)
    return np.full(h, f)


def tsb(y, h, a=0.1, b=0.1):
    pr = float(np.mean(y > 0)); nz = y[y > 0]; z = float(nz.mean()) if nz.size else 0.0
    for v in y:
        pr += b * ((v > 0) - pr)
        if v > 0: z += a * (v - z)
    return np.full(h, pr * z)


MODELS = {
    "naive": lambda tr, h: np.full(h, tr[-1]),
    "ma3": lambda tr, h: np.full(h, tr[-3:].mean()),
    "ses": lambda tr, h: SimpleExpSmoothing(tr, initialization_method="estimated").fit().forecast(h),
    "holt": lambda tr, h: ExponentialSmoothing(tr, trend="add", initialization_method="estimated").fit().forecast(h),
    "holt_winters": lambda tr, h: ExponentialSmoothing(tr, trend="add", seasonal="add", seasonal_periods=12,
                                                       initialization_method="estimated").fit().forecast(h),
    "croston": lambda tr, h: croston(tr, h),
    "sba": lambda tr, h: croston(tr, h, variant="sba"),
    "tsb": lambda tr, h: tsb(tr, h),
}


def backtest(y, h=3, min_train=24):
    res = {}
    for name, fn in MODELS.items():
        ys, fs = [], []
        for cut in range(min_train, len(y) - h + 1):  # origen móvil: solo pasado
            ys.append(y[cut:cut + h]); fs.append(np.asarray(fn(y[:cut], h), dtype=float))
        ys, fs = np.concatenate(ys), np.maximum(np.concatenate(fs), 0)
        res[name] = (mae(ys, fs), wape(ys, fs), smape(ys, fs))
    return res


t = np.arange(48)
series = {
    "SINT_estacional": 200 + 2 * t + 40 * np.sin(2 * np.pi * t / 12) + rng.normal(0, 8, 48),
    "SINT_intermitente": np.where(rng.random(48) < 0.25, rng.poisson(6, 48), 0).astype(float),
}
print("== [SINTÉTICO] Backtesting rolling-origin h=3 ==")
for sname, y in series.items():
    r = backtest(y)
    best = min(r, key=lambda k: r[k][1])
    print(f"{sname}: mejor por WAPE = {best}")
    for k, (a, w, s) in r.items():
        print(f"   {k:13s} MAE={a:8.2f} WAPE={w:6.3f} sMAPE={s:6.3f}")

n = 175_000
t0 = time.perf_counter()
df = pl.DataFrame({
    "orden": rng.integers(0, 17_000, n), "sku": rng.integers(0, 900, n),
    "unidad": rng.choice(["PZA", "M", "ML"], n), "cantidad": rng.gamma(2, 3, n),
    "costo_unit": rng.gamma(3, 2_000, n),
})
ordenes = df.select(pl.col("orden").n_unique()).item()
apariciones = df.select(pl.struct("orden", "sku").n_unique()).item()
abc = (df.group_by("sku").agg((pl.col("cantidad") * pl.col("costo_unit")).sum().alias("valor"))
         .sort("valor", descending=True)
         .with_columns((pl.col("valor").cum_sum() / pl.col("valor").sum()).alias("acum"))
         .with_columns(pl.when(pl.col("acum") <= 0.8).then(pl.lit("A"))
                       .when(pl.col("acum") <= 0.95).then(pl.lit("B")).otherwise(pl.lit("C")).alias("clase")))
por_unidad = df.group_by("sku", "unidad").agg(pl.col("cantidad").sum())  # sin mezclar unidades
dt = time.perf_counter() - t0
print(f"== [SINTÉTICO] Polars {n:,} filas en {dt:.2f}s: ordenes={ordenes:,} apariciones={apariciones:,} "
      f"grupos sku+unidad={por_unidad.height:,} ABC={abc['clase'].value_counts().sort('clase').rows()}")
print("RESULTADO: entorno estadístico OK (datos SINTÉTICOS, no validan GreenCall)")
