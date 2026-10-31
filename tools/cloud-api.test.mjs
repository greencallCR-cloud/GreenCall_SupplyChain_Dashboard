import test from 'node:test';
import assert from 'node:assert/strict';
const {createCloudApi}=await import('../lib/cloud-api.mjs').catch(()=>({}));
const env={GREENCALL_ACCESS_KEY:'test-access-key-only-000000000000000000000000',GREENCALL_SESSION_SECRET:'test-signing-secret-only-11111111111111111111'};
const req=(path,options={})=>new Request('https://preview.example'+path,options);
async function cookieFor(api){
 const r=await api(req('/api/login',{method:'POST',headers:{origin:'https://preview.example','content-type':'application/json'},body:JSON.stringify({token:env.GREENCALL_ACCESS_KEY})}));
 return r.headers.get('set-cookie').split(';')[0];
}
test('public status and protected reads do not touch private stores',async()=>{
 assert.equal(typeof createCloudApi,'function');
 let calls=0;const touch=async()=>{calls++;throw Error('must not access private store')};
 const api=createCloudApi({env,getService:touch,getSnapshotStatus:touch,checkDatabase:touch});
 const r=await api(req('/api/status'));assert.equal(r.status,200);
 const data=await r.json();assert.equal(data.access.state,'required');assert.equal(data.authenticated,false);
 assert.deepEqual(data.sources,{});assert.equal(calls,0);
 for(const path of ['/api/dashboard','/api/rows','/api/sheets/status'])assert.equal((await api(req(path))).status,401);
 assert.equal(calls,0);
});
test('authenticated dashboard and rows call real service contract with bounded query',async()=>{
 const api=createCloudApi({env,getService:async()=>({
  getDashboard:async filter=>({kpis:{orders:2},filter}),
  getRows:async query=>({rows:[],total:0,limit:query.limit})
 }),getSnapshotStatus:async()=>({state:'ready',captured_at:'2026-10-30T12:00:00Z'}),checkDatabase:async()=>({state:'connected'})});
 const cookie=await cookieFor(api);const headers={cookie};
 const dash=await api(req('/api/dashboard?sku=TEST&from=2026-01-01',{headers}));
 assert.equal(dash.status,200);assert.equal((await dash.json()).filter.sku,'TEST');
 const rows=await api(req('/api/rows?type=google_consumos&limit=999',{headers}));
 assert.equal((await rows.json()).limit,200);
 for(const q of ['from=2026-02-30','from=2026-03-01&to=2026-01-01','offset=-1','limit=NaN']){
  const path=q.includes('offset')||q.includes('limit')?'/api/rows?':'/api/dashboard?';
  assert.equal((await api(req(path+q,{headers}))).status,400);
 }
 const status=await (await api(req('/api/status',{headers}))).json();
 assert.equal(status.authenticated,true);assert.equal(status.data.state,'ready');
});
test('missing snapshot and unexpected private errors are explicit and sanitized',async()=>{
 for(const getDashboard of [async()=>null,async()=>{throw Error('postgres://secret@host PRIVATE DATA')}]){
  const api=createCloudApi({env,getService:async()=>({getDashboard})});const cookie=await cookieFor(api);
  const result=await api(req('/api/dashboard',{headers:{cookie}}));
  assert.equal(result.status,503);assert.ok(!(await result.text()).includes('secret'));
 }
});
test('unknown routes and wrong methods return JSON, no write capabilities exposed',async()=>{
 const api=createCloudApi({env:{}});
 assert.equal((await api(req('/api/dashboard',{method:'POST'}))).status,405);
 assert.equal((await api(req('/api/import/apply',{method:'POST'}))).status,404);
 assert.equal((await api(req('/api/dashboard'))).status,503);
});
