import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('real cloud HTTP harness exposes public assets and denies private paths and API reads',async()=>{
 const child=spawn(process.execPath,['tools/cloud-dev.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',GREENCALL_ACCESS_KEY:'',GREENCALL_SESSION_SECRET:''},stdio:['ignore','pipe','ignore']});
 try{
  const base=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Cloud server readiness timeout')),10_000);
   child.once('exit',()=>{clearTimeout(timer);reject(Error('Cloud server exited'))});
   child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0])}});
  });
  const status=await fetch(base+'/api/status');
  assert.equal(status.status,200);assert.equal((await status.json()).access.state,'not_configured');
  assert.match(status.headers.get('cache-control'),/no-store/);
  const dashboard=await fetch(base+'/api/dashboard');assert.equal(dashboard.status,503);
  assert.equal((await dashboard.json()).code,'ACCESS_NOT_CONFIGURED');
  for(const url of ['/local-data/base.json','/.env','/docs/GREENCALL_ESTADO_CONTINUIDAD.md','/lib/cloud-auth.mjs'])assert.equal((await fetch(base+url)).status,404,url);
  assert.equal((await fetch(base+'/api/status',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/api/import/apply',{method:'POST'})).status,404);
  for(const url of ['/','/assets/app.js','/assets/styles.css'])assert.equal((await fetch(base+url)).status,200,url);
 }finally{child.kill('SIGTERM')}
});
