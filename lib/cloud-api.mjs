import {createCloudAuth} from './cloud-auth.mjs';
import {jsonResponse,methodGuard} from './cloud-response.mjs';
import {checkNeon} from './neon-status.mjs';
import {publicDashboard,PUBLIC_EXPORTS} from './public-view.mjs';

const error=(code,message,status=503)=>jsonResponse({ok:false,code,error:message},status);
const FILTERS=['sku','tech','from','to','month','center','warehouse','technology'];
function filters(params){
 const result={};
 for(const key of FILTERS){
  const value=params.get(key);if(!value)continue;
  if(value.length>120)throw Error('INVALID_QUERY');
  if(['from','to'].includes(key)&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error('INVALID_QUERY');
  if(key==='month'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw Error('INVALID_QUERY');
  result[key]=value;
 }
 if(result.from&&result.to&&result.from>result.to)throw Error('INVALID_QUERY');
 return result;
}
function integer(params,key,fallback,max=Number.MAX_SAFE_INTEGER){
 const raw=params.get(key);if(raw===null||raw==='')return fallback;
 if(!/^\d+$/.test(raw))throw Error('INVALID_QUERY');
 const value=Number(raw);if(!Number.isSafeInteger(value)||(key==='limit'&&value===0))throw Error('INVALID_QUERY');
 return Math.min(value,max);
}
let defaultService;
async function service(){
 defaultService??=import('./dashboard-service.mjs').then(x=>x.createDashboardService());
 return defaultService;
}
async function snapshotStatus(){
 const {getSnapshotStatus}=await import('./snapshot-store.mjs');
 return getSnapshotStatus();
}
async function exporter(){
 const {createExportService}=await import('./cloud-export.mjs');
 return createExportService();
}

// Physical counts use a SEPARATE writer connection; the read runtime role stays SELECT-only.
async function physicalService(env){
 const url=env.GREENCALL_PHYSICAL_DATABASE_URL;
 if(!url)return null;
 const [{createNeonAdapter,createSnapshotRepository},{createPhysicalLedger},{createPhysicalService}]=await Promise.all([import('./snapshot-store.mjs'),import('./physical-ledger.mjs'),import('./physical-service.mjs')]);
 const adapter=await createNeonAdapter(url);
 return createPhysicalService({repository:createSnapshotRepository(adapter),ledger:createPhysicalLedger(adapter)});
}
const MAX_UPLOAD=4*1024*1024;
async function boundedBody(request,max){
 const declared=Number(request.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>max)return {error:error('FILE_TOO_LARGE','El archivo supera 4 MiB.',413)};
 const reader=request.body?.getReader();
 if(!reader)return {error:error('EMPTY_FILE','No se recibió archivo.',400)};
 const chunks=[];let size=0;
 while(true){
  const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;
  if(size>max){await reader.cancel().catch(()=>{});return {error:error('FILE_TOO_LARGE','El archivo supera el límite permitido.',413)}}
  chunks.push(Buffer.from(value));
 }
 return {value:Buffer.concat(chunks)};
}
function fileName(request){
 try{return decodeURIComponent(request.headers.get('x-file-name')||'toma.xlsx').slice(0,200)}catch{return 'toma.xlsx'}
}
async function physicalRoute(route,request,auth,getPhysicalService,env){
 const write=route!=='/api/physical/batches';
 const invalid=methodGuard(request,write?'POST':'GET');if(invalid)return invalid;
 const denied=auth.authorizeAdmin(request);if(denied)return denied;
 let physical;
 try{physical=await getPhysicalService(env)}catch{return error('DATA_UNAVAILABLE','No se pudo conectar el almacenamiento privado de tomas físicas.')}
 if(!physical)return error('SIN_CREDENCIALES','Falta la conexión de escritura privada (GREENCALL_PHYSICAL_DATABASE_URL) para tomas físicas Cloud.');
 try{
  if(route==='/api/physical/batches')return jsonResponse({ok:true,...await physical.history()});
  if(route==='/api/physical/revert'){
   if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return error('INVALID_MEDIA_TYPE','Se requiere JSON.',415);
   const body=await boundedBody(request,2048);if(body.error)return body.error.status===413?error('BODY_TOO_LARGE','Solicitud demasiado grande.',413):body.error;
   let input;try{input=JSON.parse(body.value.toString('utf8'))}catch{return error('INVALID_BODY','Solicitud inválida.',400)}
   return jsonResponse(await physical.revert({batchId:input?.batch_id,baseSnapshotId:input?.base_snapshot_id}));
  }
  const body=await boundedBody(request,MAX_UPLOAD);if(body.error)return body.error;
  const filename=fileName(request);
  if(route==='/api/physical/preview')return jsonResponse({ok:true,...await physical.preview({buffer:body.value,filename})});
  return jsonResponse(await physical.apply({buffer:body.value,filename,expectedSha:request.headers.get('x-file-sha256'),baseSnapshotId:request.headers.get('x-base-snapshot')}));
 }catch(e){
  if(e?.name==='PhysicalImportError'&&Number.isInteger(e.status))return jsonResponse({ok:false,code:e.code,error:e.message,...(e.preview?{preview:e.preview}:{})},e.status);
  return error('DATA_UNAVAILABLE','No se pudo completar la operación de toma física. Reintente más tarde.');
 }
}
const PHYSICAL_ROUTES=new Set(['/api/physical/preview','/api/physical/apply','/api/physical/revert','/api/physical/batches']);

/** Public read-only consultation (owner decision, spec v3): sanitized aggregates need no key.
 * Raw rows, source health, physical counts and private exports are ADMIN only; authorization is
 * checked per route BEFORE any call into the private data store. */
export function createCloudApi({env=process.env,getService=service,getExporter=exporter,getSnapshotStatus=snapshotStatus,checkDatabase=()=>checkNeon(env.DATABASE_URL),getPhysicalService=physicalService,loginLimiter}={}){
 const auth=createCloudAuth({env,...(loginLimiter?{loginLimiter}:{})});
 return async function handle(request){
  const url=new URL(request.url),route=url.pathname;
  if(route==='/api/login')return auth.login(request);
  if(route==='/api/logout')return auth.logout(request);
  if(PHYSICAL_ROUTES.has(route))return physicalRoute(route,request,auth,getPhysicalService,env);
  if(!['/api/status','/api/dashboard','/api/rows','/api/exports','/api/sheets/status'].includes(route))return error('NOT_FOUND','Ruta no disponible.',404);
  const invalid=methodGuard(request);if(invalid)return invalid;
  const admin=auth.isAdmin(request),role=admin?'admin':'public';
  if(route==='/api/status'){
   const result={ok:true,version:'3.0.0-cloud',deployment:'vercel',authenticated:admin,access:{state:admin?'authenticated':'public',role,admin_configured:auth.adminConfigured},database:{state:'not_disclosed'},data:{state:'unavailable'},sheets:{enabled:false,state:'SIN_CONFIGURAR',last_sync_at:null,busy:false},sources:{},partial_history:true,now:new Date().toISOString()};
   try{
    const snapshot=await getSnapshotStatus();
    result.data={state:snapshot?.state||'unavailable'};
    if(snapshot?.state==='ready'){
     result.data.snapshot={id:snapshot.id,captured_at:snapshot.captured_at};
     result.sheets={...result.sheets,state:'PRECARGADOS',snapshot_at:snapshot.captured_at};
    }
   }catch{result.data.state='unavailable'}
   if(admin){
    result.physical={state:env.GREENCALL_PHYSICAL_DATABASE_URL?'LISTO':'SIN_CREDENCIALES',can_write:Boolean(env.GREENCALL_PHYSICAL_DATABASE_URL)};
    try{result.database=await checkDatabase()}catch{result.database={state:'unavailable'}}
   }
   return jsonResponse(result);
  }
  const type=url.searchParams.get('type')||'abc';
  const adminOnly=route==='/api/rows'||route==='/api/sheets/status'||(route==='/api/exports'&&!PUBLIC_EXPORTS.includes(type));
  if(adminOnly){const denied=auth.authorizeAdmin(request);if(denied)return denied;}
  try{
   if(route==='/api/sheets/status'){
    const snapshot=await getSnapshotStatus();
    return jsonResponse({ok:true,enabled:false,state:snapshot?.state==='ready'?'PRECARGADOS':'SIN_CONFIGURAR',last_sync_at:null,snapshot_at:snapshot?.captured_at||null,busy:false,message:'Snapshot privado; la disponibilidad actual de Google no se certifica desde esta petición.'});
   }
   const input=filters(url.searchParams);
   if(route==='/api/exports'){
    const exportService=await getExporter();
    const response=await exportService.exportCsv({...input,type,q:url.searchParams.get('q')||'',publicView:!admin});
    return response||error('SNAPSHOT_REQUIRED','No hay un snapshot privado validado disponible.');
   }
   const dataService=await getService();
   let data;
   if(route==='/api/dashboard'){
    data=await dataService.getDashboard(input);
    if(data)data={...(admin?data:publicDashboard(data)),access:{role}};
   }else{
    const params=url.searchParams;
    if((params.get('q')||'').length>200||(params.get('sort')||'').length>80)throw Error('INVALID_QUERY');
    data=await dataService.getRows({...input,type:params.get('type')||'google_consumos',offset:integer(params,'offset',0),limit:integer(params,'limit',50,200),q:params.get('q')||'',sort:params.get('sort')||'',dir:params.get('dir')||'asc'});
   }
   return data?jsonResponse(data):error('SNAPSHOT_REQUIRED','No hay un snapshot privado validado disponible.');
  }catch(e){
   if(e.code==='EXPORT_LIMIT')return error('EXPORT_LIMIT','La exportación excede el límite. Aplique filtros o reduzca el período.',413);
   if(e.message==='INVALID_QUERY'||e.code==='INVALID_QUERY')return error('INVALID_QUERY','Revise los filtros y la paginación.',400);
   return error('DATA_UNAVAILABLE','No se pudo consultar la fuente privada. Reintente más tarde.');
  }
 };
}
