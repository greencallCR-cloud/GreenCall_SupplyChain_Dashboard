// Admin-only sessions (spec v3): anonymous visitors read publicly; only GREENCALL_ADMIN_KEY logs in.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudAuth} from '../lib/cloud-auth.mjs';

const access = 'test-access-key-only-000000000000000000000000';
const admin = 'test-admin-key-only-2222222222222222222222222222';
const secret = 'test-signing-secret-only-11111111111111111111';
const env = {GREENCALL_ACCESS_KEY:access,GREENCALL_SESSION_SECRET:secret,GREENCALL_ADMIN_KEY:admin};
const request = (path, options={}) => new Request('https://preview.example'+path,options);
const login = (auth, token=admin, origin='https://preview.example') => auth.login(request('/api/login',{
  method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token})
}));
const write = cookie => request('/api/physical/apply',{method:'POST',headers:{...(cookie?{cookie}:{}),origin:'https://preview.example'}});

test('admin mode fails closed when the admin key is absent, short or equal to another secret',async()=>{
  for(const config of [{},{GREENCALL_SESSION_SECRET:secret},{...env,GREENCALL_ADMIN_KEY:'short'},{...env,GREENCALL_ADMIN_KEY:access},{...env,GREENCALL_SESSION_SECRET:'short'}]){
    const auth=createCloudAuth({env:config});
    assert.equal(auth.adminConfigured,false);
    assert.equal(auth.authorizeAdmin(write()).status,503);
    assert.equal((await login(auth,config.GREENCALL_ADMIN_KEY||admin)).status,503);
  }
});
test('the admin key grants a signed secure cookie; expiry is enforced',async()=>{
  let now=Date.parse('2026-10-31T10:00:00Z');
  const auth=createCloudAuth({env,clock:()=>now});
  const result=await login(auth);
  assert.equal(result.status,200);assert.equal((await result.json()).role,'admin');
  const cookie=result.headers.get('set-cookie');
  assert.match(cookie,/^__Host-gc_cloud_session=/);
  for(const attribute of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(cookie.includes(attribute));
  for(const value of [access,admin,secret])assert.ok(!cookie.includes(value));
  const c=cookie.split(';')[0];
  assert.equal(auth.isAdmin(write(c)),true);assert.equal(auth.authorizeAdmin(write(c)),null);
  now+=8*3600_000+1;
  assert.equal(auth.isAdmin(write(c)),false);assert.equal(auth.authorizeAdmin(write(c)).status,401);
});
test('the former reader access key, wrong keys, tampered cookies and cross-origin requests are refused',async()=>{
  const auth=createCloudAuth({env});
  assert.equal((await login(auth,access)).status,401,'access key is not an admin credential');
  assert.equal((await login(auth,'wrong')).status,401);
  assert.equal((await login(auth,admin,'https://other.example')).status,403);
  assert.equal((await auth.login(request('/api/login',{method:'POST',body:'{}'}))).status,403);
  const c=(await login(auth)).headers.get('set-cookie').split(';')[0];
  assert.equal(auth.authorizeAdmin(write(c+'x')).status,401);
  assert.equal(auth.authorizeAdmin(request('/api/physical/apply',{method:'POST',headers:{cookie:c,origin:'https://other.example'}})).status,403);
  assert.equal(auth.authorizeAdmin(request('/api/physical/batches',{headers:{cookie:c}})),null,'GET needs no origin header');
  const out=await auth.logout(request('/api/logout',{method:'POST',headers:{origin:'https://preview.example'}}));
  assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
});
test('login validates media type, JSON, method and bounded body without leaking keys',async()=>{
  const auth=createCloudAuth({env});
  assert.equal((await auth.login(request('/api/login'))).status,405);
  for(const [body,media,status] of [['bad','application/json',400],['{}','text/plain',415],['x'.repeat(2048),'application/json',413]]){
    const r=await auth.login(request('/api/login',{method:'POST',headers:{origin:'https://preview.example','content-type':media},body}));
    assert.equal(r.status,status);const text=await r.text();assert.ok(!text.includes(admin)&&!text.includes(access));
  }
});
test('rotating the admin key revokes existing admin sessions',async()=>{
  const before=createCloudAuth({env});
  const c=(await login(before)).headers.get('set-cookie').split(';')[0];
  const after=createCloudAuth({env:{...env,GREENCALL_ADMIN_KEY:'test-admin-key-rotated-3333333333333333333333333'}});
  assert.equal(before.role(write(c)),'admin');
  assert.equal(after.role(write(c)),null);
  assert.equal(after.authorizeAdmin(write(c)).status,401);
});
test('failed attempts are limited per client within a sliding window',async()=>{
  let now=0;const auth=createCloudAuth({env,loginLimiter:(await import('../lib/cloud-auth.mjs')).memoryLimiter(()=>now)});
  for(let i=0;i<10;i++)assert.equal((await login(auth,'bad-'+i)).status,401);
  assert.equal((await login(auth)).status,429);
  now+=15*60*1000+1;
  assert.equal((await login(auth)).status,200,'window expires');
});
