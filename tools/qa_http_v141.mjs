import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const port=8796,base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['local-server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),GC_NO_BROWSER:'1'},stdio:'ignore',windowsHide:true});
let passed=0;
async function check(title,fn){await fn();console.log('✓',title);passed++}
try{
 let ready=false;
 for(let i=0;i<70;i++){if(child.exitCode!==null)throw Error('Servidor detenido inesperadamente');try{const q=await fetch(base+'/api/status',{signal:AbortSignal.timeout(2000)});if(q.ok){ready=true;break}}catch{}await sleep(150)}
 assert(ready,'Servidor no inició');
 await check('Servidor local inicia, versión actual y 173.761 consumos',async()=>{const a=await(await fetch(base+'/api/status')).json();assert.equal(a.version,'1.4.1');assert.equal(a.sources.google_consumos,173761);assert.equal(a.partial_history,false)});
 await check('La SPA devuelve HTML real',async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);assert((await r.text()).includes('app.js'))});
 await check('El JavaScript de frontend se sirve localmente',async()=>{const r=await fetch(base+'/assets/app.js');assert.equal(r.status,200);assert((await r.text()).includes('SHEETS · DATOS PRECARGADOS'))});
 await check('Paginación Consumos conserva totales',async()=>{const a=await(await fetch(base+'/api/rows?type=google_consumos&limit=4&offset=5')).json();assert.equal(a.total,173761);assert.equal(a.rows.length,4);assert.equal(a.rows[0]._sheet_row,7)});
 await check('Dataset inexistente bloqueado',async()=>assert.equal((await fetch(base+'/api/rows?type=dataset_invalido')).status,400));
 await check('Sin credenciales la UI no declara conexión a Sheets',async()=>{const a=await(await fetch(base+'/api/sheets/status')).json();assert.equal(a.state,'PRECARGADOS');assert.equal(a.last_sync_at,null)});
 await check('La sincronización requiere login',async()=>assert.equal((await fetch(base+'/api/sheets/sync',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401));
 await check('Importador requiere login',async()=>assert.equal((await fetch(base+'/api/import/apply',{method:'POST',body:'{}'})).status,401));
 await check('Origen externo no tiene acceso',async()=>assert.equal((await fetch(base+'/api/status',{headers:{origin:'https://otro-sitio.example'}})).status,403));
 await check('Host externo denegado',async()=>{const status=await new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port,path:'/api/status',headers:{host:'127.0.0.1.evil.example:8796'}},r=>{resolve(r.statusCode);r.resume()}).on('error',reject)});assert.equal(status,403)});
 await check('Endpoint inexistente responde 404',async()=>assert.equal((await fetch(base+'/api/no-existe')).status,404));
 await check('Motor real retorna órdenes, stocks y forecast',async()=>{const a=await(await fetch(base+'/api/dashboard',{signal:AbortSignal.timeout(35000)})).json();assert.equal(a.kpis.orders,17290);assert.equal(a.insights.dispatch.orders,478);assert.equal(a.forecasts.length,44)});
 await check('Exportación CSV real conserva columnas y BOM',async()=>{const r=await fetch(base+'/api/exports?type=abc',{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert(Buffer.from(await r.arrayBuffer()).subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])))});
 console.log(`QA HTTP v1.4.1: ${passed}/${passed} verificaciones correctas`);
}finally{child.kill('SIGTERM');await sleep(150);if(child.exitCode===null)child.kill('SIGKILL')}
