import test from 'node:test';
import assert from 'node:assert/strict';

const {createCloudAuth} = await import('../lib/cloud-auth.mjs').catch(() => ({}));
const key = 'test-access-key-only-000000000000000000000000';
const secret = 'test-signing-secret-only-11111111111111111111';
const env = {GREENCALL_ACCESS_KEY:key,GREENCALL_SESSION_SECRET:secret};
const request = (path, options={}) => new Request('https://preview.example'+path,options);
const login = (auth, token=key, origin='https://preview.example') => auth.login(request('/api/login',{
  method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token})
}));

test('cloud access fails closed with absent or short configuration',async()=>{
  assert.equal(typeof createCloudAuth,'function');
  for(const config of [{},{GREENCALL_ACCESS_KEY:'short',GREENCALL_SESSION_SECRET:secret}]){
    const auth=createCloudAuth({env:config});
    assert.equal(auth.state(request('/api/status')),'not_configured');
    assert.equal(auth.authorize(request('/api/dashboard')).status,503);
    assert.equal((await login(auth)).status,503);
  }
});
test('random access key grants a signed secure cookie and expiry is enforced',async()=>{
  let now=Date.parse('2026-10-31T10:00:00Z');
  const auth=createCloudAuth({env,clock:()=>now});
  const result=await login(auth);
  assert.equal(result.status,200);
  const cookie=result.headers.get('set-cookie');
  assert.match(cookie,/^__Host-gc_cloud_session=/);
  for(const attribute of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(cookie.includes(attribute));
  assert.ok(!cookie.includes(key));assert.ok(!cookie.includes(secret));
  const authed=request('/api/dashboard',{headers:{cookie:cookie.split(';')[0]}});
  assert.equal(auth.state(authed),'authenticated');
  assert.equal(auth.authorize(authed),null);
  now+=8*3600_000+1;
  assert.equal(auth.authorize(authed).status,401);
});
test('wrong keys, tampered cookies and cross-origin mutations are refused',async()=>{
  const auth=createCloudAuth({env});
  assert.equal((await login(auth,'wrong')).status,401);
  assert.equal((await login(auth,key,'https://other.example')).status,403);
  assert.equal((await auth.login(request('/api/login',{method:'POST',body:'{}'}))).status,403);
  const result=await login(auth);
  const cookie=result.headers.get('set-cookie').split(';')[0];
  assert.equal(auth.authorize(request('/api/dashboard',{headers:{cookie:cookie+'x'}})).status,401);
  const out=await auth.logout(request('/api/logout',{method:'POST',headers:{origin:'https://preview.example'}}));
  assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
});
test('login validates media type, JSON, method and bounded body without leaking key',async()=>{
  const auth=createCloudAuth({env});
  assert.equal((await auth.login(request('/api/login'))).status,405);
  for(const [body,media,status] of [['bad','application/json',400],['{}','text/plain',415],['x'.repeat(2048),'application/json',413]]){
    const r=await auth.login(request('/api/login',{method:'POST',headers:{origin:'https://preview.example','content-type':media},body}));
    assert.equal(r.status,status);assert.ok(!(await r.text()).includes(key));
  }
});
