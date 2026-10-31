import {createCloudAuth} from './cloud-auth.mjs';
import {jsonResponse,methodGuard} from './cloud-response.mjs';
import {checkNeon} from './neon-status.mjs';

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

/** Authentication always precedes any call into the private data store. */
export function createCloudApi({env=process.env,getService=service,getExporter=exporter,getSnapshotStatus=snapshotStatus,checkDatabase=()=>checkNeon(env.DATABASE_URL)}={}){
 const auth=createCloudAuth({env});
 return async function handle(request){
  const url=new URL(request.url),route=url.pathname;
  if(route==='/api/login')return auth.login(request);
  if(route==='/api/logout')return auth.logout(request);
  if(!['/api/status','/api/dashboard','/api/rows','/api/exports','/api/sheets/status'].includes(route))return error('NOT_FOUND','Ruta no disponible.',404);
  const invalid=methodGuard(request);if(invalid)return invalid;
  const state=auth.state(request);
  if(route==='/api/status'){
   const result={ok:true,version:'2.0.0-cloud',deployment:'vercel',authenticated:state==='authenticated',access:{state},database:{state:'not_verified'},data:{state:state==='not_configured'?'not_configured':'unavailable'},sheets:{enabled:false,state:'SIN_CONFIGURAR',last_sync_at:null,busy:false},sources:{},partial_history:true,now:new Date().toISOString()};
   if(state==='authenticated'){
    try{
     const [database,snapshot]=await Promise.all([checkDatabase(),getSnapshotStatus()]);
     result.database=database;
     result.data={state:snapshot?.state||'unavailable'};
     if(snapshot?.state==='ready'){
      result.data.snapshot={id:snapshot.id,captured_at:snapshot.captured_at};
      result.sheets={...result.sheets,state:'PRECARGADOS',snapshot_at:snapshot.captured_at};
     }
    }catch{result.data.state='unavailable'}
   }
   return jsonResponse(result);
  }
  const denied=auth.authorize(request);if(denied)return denied;
  try{
   if(route==='/api/sheets/status'){
    const snapshot=await getSnapshotStatus();
    return jsonResponse({ok:true,enabled:false,state:snapshot?.state==='ready'?'PRECARGADOS':'SIN_CONFIGURAR',last_sync_at:null,snapshot_at:snapshot?.captured_at||null,busy:false,message:'Snapshot privado; la disponibilidad actual de Google no se certifica desde esta petición.'});
   }
   const input=filters(url.searchParams);
   if(route==='/api/exports'){
    const exportService=await getExporter();
    const response=await exportService.exportCsv({...input,type:url.searchParams.get('type')||'abc',q:url.searchParams.get('q')||''});
    return response||error('SNAPSHOT_REQUIRED','No hay un snapshot privado validado disponible.');
   }
   const dataService=await getService();
   let data;
   if(route==='/api/dashboard')data=await dataService.getDashboard(input);
   else{
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
