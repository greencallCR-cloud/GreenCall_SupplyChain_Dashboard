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
export function createCloudAuth({env=process.env,clock=Date.now}={}){
  const access=env.GREENCALL_ACCESS_KEY,secret=env.GREENCALL_SESSION_SECRET,adminKey=env.GREENCALL_ADMIN_KEY;
  const configured=typeof access==='string'&&access.length>=32&&typeof secret==='string'&&secret.length>=32;
  // Writes need a distinct, long admin key. The read access key never grants admin.
  const adminConfigured=configured&&typeof adminKey==='string'&&adminKey.length>=32&&adminKey!==access;
  const sign=value=>createHmac('sha256',secret).update(value).digest('base64url');
  const notConfigured=()=>failure('ACCESS_NOT_CONFIGURED','El acceso protegido aún no está configurado.',503);
  function session(request){
    if(!configured)return null;
    const raw=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!raw||raw.length>1024)return null;
    const [payload,signature,...extra]=raw.split('.');
    if(!payload||!signature||extra.length||!same(signature,sign(payload)))return null;
    try{
      const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
      const now=Math.floor(clock()/1000);
      if(!(data.v===1&&Number.isSafeInteger(data.exp)&&data.exp>now&&data.exp<=now+TTL&&typeof data.nonce==='string'&&data.nonce.length===32))return null;
      return {role:data.r==='admin'&&adminConfigured?'admin':'viewer'};
    }catch{return null}
  }
  const authenticated=request=>Boolean(session(request));
  function sameOrigin(request){
    return request.headers.get('origin')===new URL(request.url).origin;
  }
  return {
    state:request=>!configured?'not_configured':authenticated(request)?'authenticated':'required',
    authorize:request=>!configured?notConfigured():authenticated(request)?null:failure('AUTH_REQUIRED','Inicie sesión para consultar los datos.',401),
    role:request=>session(request)?.role||null,
    adminConfigured,
    sameOrigin,
    authorizeAdmin(request){
      if(!configured)return notConfigured();
      const current=session(request);
      if(!current)return failure('AUTH_REQUIRED','Inicie sesión de administración.',401);
      if(!adminConfigured)return failure('ADMIN_NOT_CONFIGURED','La administración Cloud aún no está configurada (GREENCALL_ADMIN_KEY).',503);
      if(current.role!=='admin')return failure('ADMIN_REQUIRED','Esta acción requiere la clave de administración.',403);
      if(!sameOrigin(request))return failure('ORIGIN_REJECTED','Origen no permitido.',403);
      return null;
    },
    async login(request){
      const invalid=methodGuard(request,'POST');if(invalid)return invalid;
      if(!configured)return notConfigured();
      if(!sameOrigin(request))return failure('ORIGIN_REJECTED','Origen no permitido.',403);
      const body=await boundedJson(request);if(body.error)return body.error;
      const token=body.value?.token;
      const isAdmin=typeof token==='string'&&token.length<=512&&adminConfigured&&same(token,adminKey);
      if(!isAdmin&&(typeof token!=='string'||token.length>512||!same(token,access)))
        return failure('INVALID_ACCESS','Clave de acceso inválida.',401);
      const role=isAdmin?'admin':'viewer';
      const payload=Buffer.from(JSON.stringify({v:1,exp:Math.floor(clock()/1000)+TTL,nonce:randomBytes(24).toString('base64url'),...(isAdmin?{r:'admin'}:{})})).toString('base64url');
      return jsonResponse({ok:true,role},200,{'set-cookie':cookie(payload+'.'+sign(payload),TTL)});
    },
    async logout(request){
      const invalid=methodGuard(request,'POST');if(invalid)return invalid;
      if(!sameOrigin(request))return failure('ORIGIN_REJECTED','Origen no permitido.',403);
      return jsonResponse({ok:true},200,{'set-cookie':cookie('',0)});
    }
  };
}
