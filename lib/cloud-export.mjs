import {analyze} from '../src/core.mjs';
import {safeCsvCell} from '../src/security.mjs';
import {loadSnapshot as defaultLoadSnapshot,sanitizeSnapshot,snapshotFields} from './snapshot-store.mjs';
import {validateDataFilter,matchesDataFilter} from './dashboard-service.mjs';
import {isPrivateKey,PUBLIC_EXPORTS} from './public-view.mjs';

const MAX_ROWS=100_000;
// Leave room below Vercel's buffered response ceiling for headers/transport.
const MAX_BYTES=4*1024*1024;
const invalid=()=>Object.assign(new Error('Tipo de exportación inválido.'),{code:'INVALID_QUERY'});
const tooLarge=()=>Object.assign(new Error('La exportación excede el límite. Aplique filtros o reduzca el período.'),{code:'EXPORT_LIMIT'});
const computed=new Set(['abc','planning','forecast','physical','intervals','inventory']);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const cell=value=>safeCsvCell(plain(value)||Array.isArray(value)?JSON.stringify(value):value);

/** Authenticated read path only; never writes or publishes a source snapshot. */
export function createExportService({loadSnapshot=defaultLoadSnapshot}={}){
 return {
  async exportCsv(input={}){
   const filter=validateDataFilter(input,['type','q','publicView']);
   if(input.publicView&&!PUBLIC_EXPORTS.includes(input.type||'abc'))throw invalid();
   const type=input.type||'abc',q=input.q||'';
   if(typeof type!=='string'||typeof q!=='string'||q.length>160)throw invalid();
   if(!computed.has(type)&&!['inventory','consumptions','dispatch'].includes(type)&&!snapshotFields(type))throw invalid();
   const snapshot=await loadSnapshot();if(!snapshot)return null;
   const data=sanitizeSnapshot(snapshot.data);
   let rows;
   if(computed.has(type)){
    const dashboard=analyze(data,{},filter);
    rows=type==='inventory'?dashboard.business.stock:type==='abc'?dashboard.charts.abc:type==='planning'?dashboard.planning:type==='forecast'?dashboard.forecasts:type==='physical'?dashboard.physical.latest:dashboard.physical.intervals;
   }else{
    rows=type==='inventory'?data.tables.inventory_real||[]:type==='consumptions'?data.tables.google_consumos||[]:type==='dispatch'?[...(data.tables.dispatch_serial||[]),...(data.tables.dispatch_nonserial||[])]:data.tables[type]||[];
    const search=q.toLocaleLowerCase('es');
    rows=rows.filter(row=>matchesDataFilter(row,filter)&&(!search||Object.entries(row).some(([key,value])=>!key.startsWith('_')&&String(value??'').toLocaleLowerCase('es').includes(search))));
   }
   if(rows.length>MAX_ROWS)throw tooLarge();
   const columns=[...new Set(rows.flatMap(row=>Object.keys(row).filter(key=>!key.startsWith('_')&&!(input.publicView&&isPrivateKey(key)))))];
   const chunks=['\uFEFF'+columns.map(cell).join(',')+'\r\n'];let bytes=Buffer.byteLength(chunks[0]);
   for(const row of rows){
    const line=columns.map(key=>cell(row[key])).join(',')+'\r\n';bytes+=Buffer.byteLength(line);
    if(bytes>MAX_BYTES)throw tooLarge();
    chunks.push(line);
   }
   return new Response(chunks.join(''),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="greencall-${type}.csv"`,'cache-control':'no-store, private, max-age=0','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY'}});
  }
 };
}
