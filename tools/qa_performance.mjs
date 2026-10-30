// QA de rendimiento sobre las 173.761 líneas REALES importadas, sin fabricación de filas ni escritura cloud.
import fs from 'node:fs';import {performance} from 'node:perf_hooks';import {analyze} from '../src/core.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../local-data/base.json',import.meta.url),'utf8'));
const n=data.tables.google_consumos.length;const start=performance.now();const d=analyze(data);const elapsed=Math.round(performance.now()-start),mem=Math.round(process.memoryUsage().rss/1048576);
if(n!==173761||d.kpis.orders!==17290||!d.coverage.fullGoogleHistory)throw Error('Cobertura no conciliada');
const report={mode:'REGISTROS_REALES_SANITIZADOS',google_rows:n,elapsed_ms:elapsed,rss_mb:mem,unique_orders:d.kpis.orders,material_lines:d.kpis.consumption_lines,dispatch_orders:d.kpis.dispatch_orders,forecast_skus:d.forecasts.length,output_json_mb:Math.round(Buffer.byteLength(JSON.stringify(d))/1e5)/10};
fs.writeFileSync(new URL('../docs/QA_RENDIMIENTO.json',import.meta.url),JSON.stringify({...report,at:new Date().toISOString()},null,2));console.log(JSON.stringify(report));
