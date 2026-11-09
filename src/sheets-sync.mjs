// GreenCall v1.4: Google Sheets is the authoritative READ-ONLY operational source.
// No browser-side credentials, no Google writes. Supports full and tail sync, atomic snapshots.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ingestRows,norm} from './core.mjs';

export const DEFAULT_SHEET_ID='1gUK6b2eLyC2Al5opwiNb1r21-QAYrsJtncS37aP8nj8';
export const SOURCE_TABS=[
  {tab:'Consumos',type:'google_consumos',columns:'Q',tail:'W'},
  {tab:'Inventario Real',type:'inventory_real',columns:'V'},
  {tab:'Despachos Serializados',type:'dispatch_serial',columns:'Q'},
  {tab:'Despachos No Serializados',type:'dispatch_nonserial',columns:'M'},
  {tab:'Rotación Técnicos',type:'rotation_tech',columns:'O'},
  {tab:'Devoluciones Rotación',type:'rotation_returns',columns:'N'},
  {tab:'Catálogo SKUs',type:'sku_catalog',columns:'K'},
  {tab:'Tecnicos',type:'technicians',columns:'D'}, // Do not read personal ID column E.
  {tab:'Series SAP',type:'sap_serials',columns:'G'},
  {tab:'Cantidades SAP',type:'sap_quantities',columns:'G'},
  {tab:'Existencias ETA',type:'eta',columns:'K'},
  {tab:'Cobros',type:'charges',columns:'Q'},
  {tab:'Control Devoluciones Taller',type:'workshop',columns:'E'},
  {tab:'Recepciones',type:'receipts',columns:'G'}
];
const EXPECTED_HEADERS={
 google_consumos:['materialsku','numerodeorden','cantidad','codigotecnico'],
 inventory_real:['ubicacionreal','materialsku','criterioasignacion','corteeta'],
 dispatch_serial:['fechadelaentrega','serie','codtecnico','descripcion'],
 dispatch_nonserial:['material','unidad','fechadespacho','tecnico'],
 rotation_tech:['codigotecnico','numerodeserie','diasantiguedad','prioridadconsumo'],
 rotation_returns:['numerodeserie','fechadeingreso','diasantiguedad','politica'],
 sku_catalog:['material','valorunitario','lote','clavedescripcion'],
 technicians:['contratista','estatus','nombre','codigotecnico'],
 sap_serials:['fechacortesap','materialsku','numerodeserie','lote'],
 sap_quantities:['centro','almacen','material','libreutilizacion'],
 eta:['fechacorteeta','ubicacioneta','materialsku','cantidad'],
 charges:['fechacobro','numerodeserie','total','subtotal'],
 workshop:['fechadevolucion','numerodeserie','materialsku','detalle'],
 receipts:['numerodeserie','descripcion','cantidad']
};
function sourceHeaderIndex(type,rows){const req=EXPECTED_HEADERS[type];if(!req)throw Error('Fuente inesperada');
 const ix=rows.findIndex(row=>{const h=new Set((row||[]).map(norm));return req.every(x=>h.has(x))});
 if(ix<0)throw syncFail('SOURCE_HEADERS_INCOMPATIBLE','Encabezados incompatibles con '+type,{type});return ix;
}
const SCOPES='https://www.googleapis.com/auth/spreadsheets.readonly';
/** Sync failure with a stable code and a SAFE detail (tab names, HTTP status, percentages): never
 * credentials, connection strings, Google response bodies or operational values. */
export class SheetsSyncError extends Error{constructor(code,message,safe={}){super(message);this.name='SheetsSyncError';this.code=code;this.safe=safe}}
const syncFail=(code,message,safe)=>new SheetsSyncError(code,message,safe);
// Tables that are a stock CUT (replaced wholesale on every cut) and the field(s) holding the cut date.
// Everything else is treated as an append-only history.
export const CUT_FIELDS=Object.freeze({eta:['cut'],inventory_real:['eta_cut','sap_cut'],sap_serials:['cut']});
const maxCut=(rows,fields)=>{let m='';for(const r of rows)for(const f of fields){const v=String(r?.[f]||'');if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>m)m=v}return m||null};
/** Guard against silent truncation. Histories: >0.5 % fewer rows is blocked. Stock cuts: fewer rows
 * are accepted only when the source carries a NEWER cut date, and never a loss above 50 %. */
export function reductionDecision(type,existing,merged,{inventoryRows}={}){
  if(existing.length<=100||merged.length>=existing.length*.995)return {allowed:true,reason:'NO_REDUCTION'};
  const pct=Math.round((1-merged.length/existing.length)*1000)/10,fields=CUT_FIELDS[type];
  // "Rotación Técnicos" is a recalculated view of currently held serialized inventory,
  // NOT an append-only dispatch history. Permit a smaller view only when it matches
  // the new Inventario Real serial-for-serial and has no duplicate or blank serials.
  // A missing/mismatched reference or a >50% reduction still blocks publication.
  if(type==='rotation_tech'||type==='rotation_returns'){
    const inventory=Array.isArray(inventoryRows)?inventoryRows:[];
    const current=merged.map(r=>String(r?.serial??'').trim());
    const stock=inventory.map(r=>String(r?.serial??'').trim()).filter(Boolean);
    const currentSet=new Set(current),stockSet=new Set(stock);
    if(merged.length>=existing.length*.5&&current.length>0
       &&current.every(Boolean)&&currentSet.size===current.length
       &&stockSet.size===stock.length&&stockSet.size===currentSet.size
       &&current.every(serial=>stockSet.has(serial))){
      return {allowed:true,reason:'RECONCILED_ROTATION',reduction_pct:pct};
    }
    return {allowed:false,code:'SOURCE_REDUCTION',reduction_pct:pct,
      detail:'Reporte de rotación no concilia exactamente con Inventario Real; se conserva el corte anterior'};
  }
  if(fields){const before=maxCut(existing,fields),after=maxCut(merged,fields);
    if(before&&after&&after>before&&merged.length>=existing.length*.5)return {allowed:true,reason:'NEW_CUT',reduction_pct:pct,previous_cut:before,new_cut:after};
    return {allowed:false,code:'SOURCE_REDUCTION',reduction_pct:pct,detail:after&&before&&after>before?'nuevo corte con pérdida mayor al 50 %':'mismo corte o corte anterior con menos filas'}}
  return {allowed:false,code:'SOURCE_REDUCTION',reduction_pct:pct,detail:'historial acumulativo con menos filas'};
}
const escapeRange=s=>`'${s.replaceAll("'","''")}'`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function safeConf(c={}){
  return {enabled:Boolean(c.enabled),spreadsheet_id:c.spreadsheet_id||DEFAULT_SHEET_ID,
    credential_path:c.credential_path||'',interval_minutes:Math.max(5,Math.min(120,Number(c.interval_minutes)||10)),
    full_every_hours:Math.max(1,Math.min(168,Number(c.full_every_hours)||24)),
    last_sync_at:c.last_sync_at||null,last_full_at:c.last_full_at||null,last_attempt_at:c.last_attempt_at||null,
    cursors:c.cursors||{},source_log:c.source_log||{}};
}
const publicConf=c=>({enabled:c.enabled,spreadsheet_id:c.spreadsheet_id,credential_configured:Boolean(c.credential_path),interval_minutes:c.interval_minutes,full_every_hours:c.full_every_hours,last_sync_at:c.last_sync_at,last_full_at:c.last_full_at,last_attempt_at:c.last_attempt_at,source_log:c.source_log});
export class SheetsSync {
  constructor({configPath,getDb,commit,fetchImpl=fetch,pause=sleep,clock=()=>new Date()}={}){
    this.configPath=configPath;this.getDb=getDb;this.commit=commit;this.fetchImpl=fetchImpl;
    this.pause=pause;this.clock=clock;this.config=safeConf();this.busy=false;
    this.lastError=null;this.progress={phase:'sin configurar',tab:null,processed:0,total:0};
    this.lastAttempt=null;this.token=null;this.tokenExpires=0;this.lastRequest=0;this.timer=null;
  }
  async load(){this.config=safeConf(JSON.parse(await fs.readFile(this.configPath,'utf8').catch(()=>'{}')));return this.status()}
  status(){return {...publicConf(this.config),busy:this.busy,progress:this.progress,
  state:this.busy?'SINCRONIZANDO':this.lastError?'ERROR':!this.config.enabled?'PRECARGADOS':this.config.last_sync_at?'CONECTADO':'PRECARGADOS',
  last_error:this.lastError,last_attempt:this.lastAttempt||this.config.last_attempt_at,account_email:this.accountEmail||null}}
  async save(){await fs.mkdir(path.dirname(this.configPath),{recursive:true});const tmp=this.configPath+'.tmp';await fs.writeFile(tmp,JSON.stringify(this.config,null,2),{mode:0o600});await fs.rename(tmp,this.configPath)}
  async readCredential(filePath=this.config.credential_path){if(!filePath)throw syncFail('GOOGLE_CREDENTIAL_INVALID','Configure la ruta del archivo JSON de cuenta de servicio.');
    const resolved=path.resolve(String(filePath));
    // Evitar empaquetar accidentalmente secretos o servirlos desde el webroot.
    const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
    if(resolved===projectRoot||resolved.startsWith(projectRoot+path.sep))throw syncFail('GOOGLE_CREDENTIAL_INVALID','Guarde la credencial fuera de la carpeta del dashboard.');
    const s=await fs.stat(resolved);if(!s.isFile()||s.size>30_000)throw syncFail('GOOGLE_CREDENTIAL_INVALID','El archivo de credenciales no es válido.');
    const c=JSON.parse(await fs.readFile(resolved,'utf8'));
    if(c.type!=='service_account'||!c.client_email?.endsWith('.gserviceaccount.com')||!c.private_key?.includes('BEGIN PRIVATE KEY')||c.token_uri!=='https://oauth2.googleapis.com/token')throw syncFail('GOOGLE_CREDENTIAL_INVALID','Se necesita una clave JSON de cuenta de servicio de Google.');
    this.accountEmail=c.client_email;return c;
  }
  async configure(next){if(this.busy)throw Error('Hay una sincronización en curso');
    const candidate=safeConf({...this.config,
      credential_path:String(next.credential_path||this.config.credential_path||'').trim(),
      spreadsheet_id:String(next.spreadsheet_id||this.config.spreadsheet_id).trim(),
      enabled:next.enabled!==false,
      interval_minutes:next.interval_minutes??this.config.interval_minutes,
      full_every_hours:next.full_every_hours??this.config.full_every_hours,
    });
    if(!/^[a-zA-Z0-9_-]{20,120}$/.test(candidate.spreadsheet_id))throw Error('ID de Google Sheets inválido.');
    await this.readCredential(candidate.credential_path);
    if(candidate.spreadsheet_id!==this.config.spreadsheet_id || candidate.credential_path!==this.config.credential_path){
      candidate.cursors={};candidate.source_log={};candidate.last_sync_at=null;candidate.last_full_at=null;
    }
    // Connectivity is tested explicitly; saving configuration never changes Google Sheets.
    this.config=candidate;this.token=null;await this.save();return this.status();
  }
  async accessToken(){if(this.token&&this.tokenExpires-Date.now()>120_000)return this.token;
    const c=await this.readCredential();const issued=Math.floor(Date.now()/1000),enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const msg=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:c.client_email,scope:SCOPES,aud:c.token_uri,iat:issued,exp:issued+3600});
    const signature=crypto.sign('RSA-SHA256',Buffer.from(msg),c.private_key).toString('base64url');
    const form=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:msg+'.'+signature});
    const response=await this.fetchImpl(c.token_uri,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form.toString(),signal:AbortSignal.timeout(25000)});
    const json=await response.json().catch(()=>({}));if(!response.ok||!json.access_token)throw syncFail('GOOGLE_AUTH_FAILED','OAuth Google: '+(json.error_description||json.error||response.status),{status:response.status,error:typeof json.error==='string'?json.error.slice(0,40):null});
    this.token=json.access_token;this.tokenExpires=Date.now()+Number(json.expires_in||3500)*1000;return this.token;
  }
  async googleGet(route,params={}){const token=await this.accessToken(),url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(this.config.spreadsheet_id)+route;
    const query=new URLSearchParams(params);let err;
    for(let attempt=0;attempt<5;attempt++){
      // A service account has a 60-read-requests/minute per-user quota.
      const diff=Date.now()-this.lastRequest;if(diff<1150)await this.pause(1150-diff);
      this.lastRequest=Date.now();const res=await this.fetchImpl(url+(query.size?'?'+query.toString():''),{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(90000)});
      if(res.ok)return res.json();const body=await res.text().catch(()=>'');err=syncFail('GOOGLE_HTTP',`Google Sheets HTTP ${res.status}: ${body.slice(0,350)}`,{status:res.status,stage:'metadata'});
      if(![429,500,502,503,504].includes(res.status))break;await this.pause(Math.min(32000,1500*2**attempt));
    }throw err;
  }
  async metadata(){return this.googleGet('',{fields:'spreadsheetId,properties(title),sheets(properties(title,gridProperties(rowCount)))'});}
  async test(){const meta=await this.metadata();const found=new Set((meta.sheets||[]).map(s=>s.properties.title));return {ok:true,title:meta.properties?.title,id:meta.spreadsheetId,account:this.accountEmail,available:SOURCE_TABS.filter(t=>found.has(t.tab)).map(x=>x.tab),missing:SOURCE_TABS.filter(t=>!found.has(t.tab)).map(x=>x.tab)};}
  async fetchBlock(tab,start,end,mainCol,tailCol){const params=new URLSearchParams({valueRenderOption:'FORMATTED_VALUE'});
    params.append('ranges',`${escapeRange(tab)}!A${start}:${mainCol}${end}`);
    if(tailCol)params.append('ranges',`${escapeRange(tab)}!U${start}:${tailCol}${end}`);
    const token=await this.accessToken();const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(this.config.spreadsheet_id)+'/values:batchGet?'+params;
    let lastError;for(let attempt=0;attempt<5;attempt++){
      const delay=Date.now()-this.lastRequest;if(delay<1150)await this.pause(1150-delay);this.lastRequest=Date.now();
      const res=await this.fetchImpl(url,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(90000)});
      if(res.ok){const values=(await res.json()).valueRanges||[],a=values[0]?.values||[],b=values[1]?.values||[];
        return Array.from({length:Math.max(a.length,b.length)},(_,i)=>[...(tailCol?Array.from({length:17},(_,j)=>a[i]?.[j]??''):(a[i]||[])),...(tailCol?Array.from({length:3},(_,j)=>b[i]?.[j]??''):[])]);
      }
      lastError=syncFail('GOOGLE_HTTP',`Google Sheets ${tab} HTTP ${res.status}: ${(await res.text().catch(()=>'' )).slice(0,220)}`,{status:res.status,tab});
      if(![429,500,502,503,504].includes(res.status))break;await this.pause(Math.min(32000,1500*2**attempt));
    }throw lastError;
  }
  async readTab(source,maxRows,startRow=1){let headers=null,rows=[],lastActualRow=0,previousHeaderRows=[];const {tab,type,columns,tail}=source;
    const step=2500;
    // For incremental refresh, read the header separately, then the last 3000 physical rows + appended rows.
    if(startRow>1){const hh=await this.fetchBlock(tab,1,1,columns,tail);headers=hh[0]||[];if(!headers.length)throw Error(`${tab}: sin encabezados`)}
    for(let from=startRow;from<=maxRows;from+=step){const to=Math.min(maxRows,from+step-1);
      this.progress={phase:'leyendo',tab,processed:from-startRow,total:maxRows-startRow+1};
      const block=await this.fetchBlock(tab,from,to,columns,tail);
      if(from===1){previousHeaderRows=block.slice(0,40);const headerIndex=sourceHeaderIndex(type,previousHeaderRows);
        headers=block[headerIndex];
        const chunk=ingestRows(block,type,headerIndex);
        const blankShift=headerIndex+1;
        const populated=block.slice(blankShift).map((r,i)=>r.some(v=>String(v??'').trim())?i+blankShift+1:null).filter(Boolean);
        chunk.forEach((r,i)=>r._sheet_row=populated[i]??(i+blankShift+1));rows.push(...chunk);
        for(let k=block.length-1;k>=0;k--)if(block[k]?.some(v=>String(v??'').trim())){lastActualRow=Math.max(lastActualRow,from+k);break}
      }else{
        const chunk=ingestRows([headers,...block],type,0);
        const populated=block.map((r,i)=>r.some(v=>String(v??'').trim())?from+i:null).filter(Boolean);
        chunk.forEach((r,i)=>r._sheet_row=populated[i]??(from+i));rows.push(...chunk);
        for(let k=block.length-1;k>=0;k--)if(block[k]?.some(v=>String(v??'').trim())){lastActualRow=Math.max(lastActualRow,from+k);break}
      }
    }
    this.progress={phase:'validando',tab,processed:rows.length,total:rows.length};
    return {rows,last_actual_row:lastActualRow||startRow-1};
  }
  async sync({forceFull=false}={}){
    if(!this.config.enabled)throw Error('Primero habilite la conexión a Google Sheets.');
    if(this.busy)throw Error('Ya hay una sincronización ejecutándose.');
    this.busy=true;this.lastAttempt=this.clock().toISOString();this.config.last_attempt_at=this.lastAttempt;this.lastError=null;
    let full=forceFull||!this.config.last_full_at||(Date.parse(this.lastAttempt)-Date.parse(this.config.last_full_at)>this.config.full_every_hours*3600_000);
    const staged={},logs={},nextCursors={...this.config.cursors};
    try{
      const meta=await this.metadata();const known=new Map((meta.sheets||[]).map(s=>[s.properties.title,s.properties.gridProperties?.rowCount||0]));
      const old=this.getDb();
      for(const source of SOURCE_TABS){const {tab,type}=source;
        if(!known.has(tab))throw syncFail('SOURCE_TAB_MISSING',`Falta la pestaña obligatoria: ${tab}`,{tab});
        const allocated=known.get(tab);if(allocated>400000)throw syncFail('SOURCE_TOO_LARGE',`Demasiadas filas asignadas en ${tab}; revisar el origen.`,{tab});
        const existing=old.tables[type]||[];
        let startRow=1;if(type==='google_consumos'&&!full&&nextCursors[type]?.last_actual_row){const last=nextCursors[type].last_actual_row;
          if(allocated<last)full=true;
          else startRow=Math.max(2,last-2999);
        }
        let {rows,last_actual_row}=await this.readTab(source,Math.max(1,allocated),startRow);
        // La posición de fila es útil como cursor, NO como identidad estable.
        // Una inserción/eliminación en el solapamiento cambia el registro en esa posición.
        // Reconciliar entonces desde el principio para no duplicar ni mezclar líneas.
        if(type==='google_consumos'&&startRow>1){
          const identity=r=>[r.order||'',r.sku||'',r.serial||'',r.center||'',r.warehouse||''].join('\u001f');
          const prior=new Map(existing.filter(r=>Number.isInteger(r._sheet_row)).map(r=>[r._sheet_row,r]));
          const overlap=rows.filter(r=>prior.has(r._sheet_row));
          if(overlap.some(r=>identity(r)!==identity(prior.get(r._sheet_row)))){
            this.progress={phase:'reconciliación completa por desplazamiento/cambio de identidad',tab,processed:0,total:allocated};
            ({rows,last_actual_row}=await this.readTab(source,Math.max(1,allocated),1));
            startRow=1;full=true;
          }
        }
        if(!rows.length&&existing.length)throw syncFail('SOURCE_EMPTY',`${tab} devolvió cero registros; se conserva el snapshot anterior.`,{tab});
        const merged=startRow>1?[...existing.filter(x=>Number(x._sheet_row||0)<startRow),...rows]:rows;
        // Reducir considerablemente un dataset crítico requiere verificación, nunca truncar en silencio.
        const guard=reductionDecision(type,existing,merged,{inventoryRows:staged.inventory_real});
        if(!guard.allowed)throw syncFail('SOURCE_REDUCTION',`${tab}: ${existing.length} filas anteriores vs ${merged.length} actuales (${guard.detail}). Se conservó el snapshot, requiere revisión de la fuente.`,{tab,reduction_pct:guard.reduction_pct,detail:guard.detail});
        if(type==='google_consumos'&&startRow===1&&existing.length>0&&rows.length<existing.length)
          throw syncFail('SOURCE_REDUCTION','Consumos: el origen tiene menos líneas que el respaldo; se bloqueó el borrado histórico automático.',{tab,detail:'historial de consumos con menos líneas'});
        staged[type]=merged;
        nextCursors[type]={last_actual_row:last_actual_row||nextCursors[type]?.last_actual_row||0,source_rows:merged.length};
        logs[type]={tab,mode:startRow>1?'COLA 3000 + NUEVAS':'COMPLETA',rows:merged.length,...(guard.reason==='NEW_CUT'?{new_cut:{previous:guard.previous_cut,current:guard.new_cut,reduction_pct:guard.reduction_pct}}:{}),...(guard.reason==='RECONCILED_ROTATION'?{reconciled_report:{reference:'Inventario Real',reduction_pct:guard.reduction_pct}}:{}),read_rows:rows.length,at:this.clock().toISOString(),allocated_rows:allocated};
      }
      this.progress={phase:'guardando',tab:null,processed:SOURCE_TABS.length,total:SOURCE_TABS.length};
      const now=this.clock().toISOString(),next={...old,tables:{...old.tables,...staged},sources:{...old.sources}};
      for(const src of SOURCE_TABS){next.sources[src.type]={source_type:'GOOGLE_SHEETS_API_READ_ONLY',source_tab:src.tab,original_data_rows:staged[src.type].length,retrieved_at:now,sanitized:true}};
      next.batches=[...(old.batches||[]).slice(-90),{at:now,source:'GOOGLE_SHEETS_API_READ_ONLY',mode:full?'COMPLETA':'INCREMENTAL',datasets:Object.fromEntries(Object.entries(logs).map(([k,v])=>[k,v.rows]))}];
      if(this.getDb()!==old)throw syncFail('SYNC_CONFLICT','La base local cambió durante la lectura de Sheets; se conserva la importación reciente. Reintente la sincronización.');
      await this.commit(next);
      this.config={...this.config,cursors:nextCursors,source_log:logs,last_sync_at:now,last_full_at:full?now:this.config.last_full_at};await this.save();
      this.progress={phase:'al día',tab:null,processed:SOURCE_TABS.length,total:SOURCE_TABS.length};return {ok:true,full,at:now,sources:logs};
    }catch(e){this.lastError=String(e?.message||e);this.progress={...this.progress,phase:'error'};await this.save().catch(()=>{});throw e}
    finally{this.busy=false;}
  }
  schedule(){if(this.timer)clearInterval(this.timer);this.timer=setInterval(()=>{
    if(!this.config.enabled||this.busy)return;const last=Math.max(this.config.last_sync_at?Date.parse(this.config.last_sync_at):0,this.lastAttempt?Date.parse(this.lastAttempt):0);
    if(this.clock().getTime()-last<this.config.interval_minutes*60000)return;
    this.sync().catch(e=>{this.lastError=String(e?.message||e)});
  },60000);this.timer.unref?.()}
}
