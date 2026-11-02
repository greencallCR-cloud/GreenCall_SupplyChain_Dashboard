import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {jsonResponse,methodGuard} from './cloud-response.mjs';

const COOKIE='__Host-gc_cloud_session';
const TTL=8*3600;
const digest=value=>createHash('sha256').update(value).digest();
const same=(a,b)=>timingSafeEqual(digest(a),digest(b));
const cookie=(value,maxAge)=>`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const failure=(code,error,status)=>jsonResponse({ok:false,code,error},status);

async function boundedJson(request){
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
    return {error:failure('INVALID_MEDIA_TYPE','Se requiere JSON.',415)};
  const reader=request.body?.getReader();
  if(!reader)return {error:failure('INVALID_BODY','Solicitud inválida.',400)};
  const chunks=[];let size=0;
  while(true){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>1024){await reader.cancel();return {error:failure('BODY_TOO_LARGE','Solicitud demasiado grande.',413)}}
    chunks.push(Buffer.from(value));
  }
  try{return {value:JSON.parse(Buffer.concat(chunks).toString('utf8'))}}
  catch{return {error:failure('INVALID_BODY','Solicitud inválida.',400)}}
}

/** A long random deployment access key; never a password stored in code.
 * Sessions are stateless. Rotate GREENCALL_SESSION_SECRET to revoke all sessions.
 * Use Vercel Deployment Protection and a persistent rate limiter before broad access.
 */
/** Public read-only consultation needs no key (owner decision, spec v3). Only the admin key
 * (GREENCALL_ADMIN_KEY, >=32 chars) opens an admin session; GREENCALL_ACCESS_KEY is no longer a
 * login credential and, if present, can never act as the admin key. Sessions are stateless and
 * bound to the current admin key (rotating it revokes them). loginLimiter: {count(key), fail(key)}
 * enforces a per-client attempt window (persistent when backed by the database). */
export function createCloudAuth({env=process.env,clock=Date.now,loginLimiter=memoryLimiter()}={}){
  const access=env.GREENCALL_ACCESS_KEY,secret=env.GREENCALL_SESSION_SECRET,adminKey=env.GREENCALL_ADMIN_KEY;
  const adminConfigured=typeof secret==='string'&&secret.length>=32&&typeof adminKey==='string'&&adminKey.length>=32&&adminKey!==access&&adminKey!==secret;
  const adminTag=adminConfigured?createHmac('sha256',secret).update('admin-key:'+adminKey).digest('base64url').slice(0,22):null;
  const sign=value=>createHmac('sha256',secret).update(value).digest('base64url');
  const notConfigured=()=>failure('ADMIN_NOT_CONFIGURED','La administración aún no está configurada.',503);
  function session(request){
    if(!adminConfigured)return null;
    const raw=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!raw||raw.length>1024)return null;
    const [payload,signature,...extra]=raw.split('.');
    if(!payload||!signature||extra.length||!same(signature,sign(payload)))return null;
    try{
      const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
      const now=Math.floor(clock()/1000);
      if(!(data.v===1&&Number.isSafeInteger(data.exp)&&data.exp>now&&data.exp<=now+TTL&&typeof data.nonce==='string'&&data.nonce.length===32))return null;
      return data.r==='admin'&&typeof data.k==='string'&&same(data.k,adminTag)?{role:'admin'}:null;
    }catch{return null}
  }
  function sameOrigin(request){
    return request.headers.get('origin')===new URL(request.url).origin;
  }
  // Client key for the attempt limiter: HMAC of the forwarded client IP (never stored in clear).
  const clientKey=request=>{const ip=(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'unknown').split(',')[0].trim().slice(0,64);return createHmac('sha256',String(secret||'no-secret')).update('login:'+ip).digest('hex').slice(0,32)};
  return {
    role:request=>session(request)?.role||null,
    isAdmin:request=>session(request)?.role==='admin',
    adminConfigured,
    sameOrigin,
    authorizeAdmin(request){
      if(!adminConfigured)return notConfigured();
      if(!session(request))return failure('ADMIN_REQUIRED','Esta sección requiere el modo administrador.',401);
      if(!['GET','HEAD'].includes(request.method)&&!sameOrigin(request))return failure('ORIGIN_REJECTED','Origen no permitido.',403);
      return null;
    },
    async login(request){
      const invalid=methodGuard(request,'POST');if(invalid)return invalid;
      if(!adminConfigured)return notConfigured();
      if(!sameOrigin(request))return failure('ORIGIN_REJECTED','Origen no permitido.',403);
      const key=clientKey(request);
      let attempts=0;try{attempts=await loginLimiter.count(key)}catch{}
      if(attempts>=LOGIN_MAX_FAILURES)return failure('TOO_MANY_ATTEMPTS','Demasiados intentos. Espere unos minutos antes de reintentar.',429);
      const body=await boundedJson(request);if(body.error)return body.error;
      const token=body.value?.token;
      if(typeof token!=='string'||token.length>512||!same(token,adminKey)){
        try{await loginLimiter.fail(key)}catch{}
        return failure('INVALID_ACCESS','Clave de administración inválida.',401);
      }
      const payload=Buffer.from(JSON.stringify({v:1,exp:Math.floor(clock()/1000)+TTL,nonce:randomBytes(24).toString('base64url'),r:'admin',k:adminTag})).toString('base64url');
      return jsonResponse({ok:true,role:'admin'},200,{'set-cookie':cookie(payload+'.'+sign(payload),TTL)});
    },
    async logout(request){
      const invalid=methodGuard(request,'POST');if(invalid)return invalid;
      if(!sameOrigin(request))return failure('ORIGIN_REJECTED','Origen no permitido.',403);
      return jsonResponse({ok:true},200,{'set-cookie':cookie('',0)});
    }
  };
}
export const LOGIN_MAX_FAILURES=10,LOGIN_WINDOW_MS=15*60*1000;
/** Per-instance fallback limiter (sliding window). Production wires a database-backed one. */
export function memoryLimiter(clock=Date.now){
  const failures=new Map();
  const recent=key=>(failures.get(key)||[]).filter(t=>clock()-t<LOGIN_WINDOW_MS);
  return {count:async key=>recent(key).length,fail:async key=>{const list=recent(key);list.push(clock());failures.set(key,list);if(failures.size>5000)failures.delete(failures.keys().next().value)}};
}
