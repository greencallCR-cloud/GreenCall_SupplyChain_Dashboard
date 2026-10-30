import test from 'node:test';
import assert from 'node:assert/strict';
import status from '../api/status.mjs';
import dashboard from '../api/dashboard.mjs';
import rows from '../api/rows.mjs';
import sheets from '../api/sheets/status.mjs';
import { checkNeon } from '../lib/neon-status.mjs';

const req=(path='/api/status',method='GET')=>new Request('http://localhost:8788'+path,{method});

test('API status da JSON sin declarar datos migrados',async()=>{
 const current=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
 try{
  const r=await status(req());const d=await r.json();
  assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/json/);
  assert.equal(d.database.state,'not_configured');assert.equal(d.data.state,'pending_migration');
  assert.equal(d.authenticated,false);assert.deepEqual(d.sources,{});
  assert.equal(r.headers.get('cache-control').includes('no-store'),true);
 } finally { if(current!==undefined)process.env.DATABASE_URL=current; }
});
test('API status rechaza métodos de escritura',async()=>{
 const r=await status(req('/api/status','POST'));assert.equal(r.status,405);
});
test('Dashboard y filas no inventan resultados',async()=>{
 for(const handler of [dashboard,rows]){
  const r=await handler(req());assert.equal(r.status,503);
  const d=await r.json();assert.equal(d.code,'DATA_MIGRATION_PENDING');
 }
});
test('Sheets informa explícitamente falta de sincronización',async()=>{
 const d=await (await sheets(req())).json();assert.equal(d.state,'SIN_CONFIGURAR');
});
test('Neon verifica nombre de base y no divulga contraseña',async()=>{
 const url='postgresql://user:secret@db.local/greencall_bi';
 const ok=await checkNeon(url, async ()=> async()=>[{db_name:'greencall_bi'}]);
 assert.equal(ok.state,'connected');
 const wrong=await checkNeon(url, async ()=> async()=>[{db_name:'otra_base'}]);
 assert.equal(wrong.state,'wrong_database');
 const error=await checkNeon(url, async ()=>{throw Error('PASSWORD=secret')});
 assert.equal(error.state,'unavailable');assert.equal(JSON.stringify(error).includes('secret'),false);
});
test('No se requiere credencial para servir status incompleto',async()=>{
 assert.equal((await checkNeon('')).state,'not_configured');
 assert.equal((await checkNeon('INVALID')).state,'invalid_config');
});
