import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudApi} from '../lib/cloud-api.mjs';
import {createDashboardService} from '../lib/dashboard-service.mjs';
const {createExportService}=await import('../lib/cloud-export.mjs').catch(()=>({}));
const captured='2026-10-01T12:00:00.000Z';
function fixture(){
 const tables={google_consumos:[{sku:'TEST-A',order:'TEST-ONE',tech:'TEST-TECH',date:'2026-09-01',quantity:2,description:'=SUM(1,2)'},{sku:'TEST-B',order:'TEST-TWO',tech:'TEST-OTHER',date:'2026-09-02',quantity:3}],sku_catalog:[{sku:'TEST-A',description:'Synthetic fixture A',unit:'PZA',cost:null},{sku:'TEST-B',description:'Synthetic fixture B',unit:'M',cost:2}]};
 return {tables,sources:Object.fromEntries(Object.entries(tables).map(([type,rows])=>[type,{source_type:'GOOGLE_SHEETS_API_READ_ONLY',source_tab:type==='google_consumos'?'Consumos':'Catálogo SKUs',original_data_rows:rows.length,retrieved_at:captured,sanitized:true}]))};
}
test('private CSV uses validated snapshot, filters and formula escaping',async()=>{
 assert.equal(typeof createExportService,'function');
 const exporter=createExportService({loadSnapshot:async()=>({data:fixture()})});
 const response=await exporter.exportCsv({type:'consumptions',tech:'TEST-TECH'});
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);
 assert.match(response.headers.get('cache-control'),/no-store/);
 const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.subarray(0,3).equals(Buffer.from([239,187,191])));
 const csv=bytes.toString('utf8');assert.ok(csv.includes("'=SUM(1,2)"));assert.ok(csv.includes('TEST-ONE'));assert.ok(!csv.includes('TEST-TWO'));
});
test('calculated CSV preserves the existing analytics and missing costs',async()=>{
 const exporter=createExportService({loadSnapshot:async()=>({data:fixture()})});
 const csv=await(await exporter.exportCsv({type:'abc'})).text();
 assert.ok(csv.includes('TEST-A'));assert.ok(csv.includes('missing_cost'));
 assert.ok(!csv.includes('[object Object]'));
 await assert.rejects(exporter.exportCsv({type:'unknown'}),{code:'INVALID_QUERY'});
 assert.equal(await createExportService({loadSnapshot:async()=>null}).exportCsv({type:'abc'}),null);
});
test('CSV exceeding the serverless response budget is refused before sending a partial file',async()=>{
 const data=fixture();data.tables.google_consumos=Array.from({length:6000},(_,i)=>({...data.tables.google_consumos[0],order:'SYNTHETIC-'+i,description:'X'.repeat(950)}));data.sources.google_consumos.original_data_rows=6000;
 const exporter=createExportService({loadSnapshot:async()=>({data})});
 await assert.rejects(exporter.exportCsv({type:'consumptions'}),{code:'EXPORT_LIMIT'});
});
test('public CSV is limited to aggregated tables and strips private columns; raw exports need admin',async()=>{
 let calls=0;
 const env={GREENCALL_ADMIN_KEY:'test-admin-key-only-2222222222222222222222222222',GREENCALL_SESSION_SECRET:'test-signing-secret-only-11111111111111111111'};
 const api=createCloudApi({env,getExporter:async()=>{calls++;return createExportService({loadSnapshot:async()=>({data:fixture()})})}});
 const req=(path,init={})=>new Request('https://preview.example'+path,init);
 for(const type of ['consumptions','dispatch','google_consumos','physical','intervals'])assert.equal((await api(req('/api/exports?type='+type))).status,401,type);
 assert.equal(calls,0);
 const pub=await api(req('/api/exports?type=abc'));
 assert.equal(pub.status,200);assert.match(pub.headers.get('content-type'),/text\/csv/);assert.equal(calls,1);
 const login=await api(req('/api/login',{method:'POST',headers:{origin:'https://preview.example','content-type':'application/json'},body:JSON.stringify({token:env.GREENCALL_ADMIN_KEY})}));
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await api(req('/api/exports?type=consumptions',{headers:{cookie}}))).status,200);
 await assert.rejects(createExportService({loadSnapshot:async()=>({data:fixture()})}).exportCsv({type:'consumptions',publicView:true}),{code:'INVALID_QUERY'});
});
test('inventory download follows displayed stock and the raw explorer uses snapshot cuts',async()=>{
 const data=fixture();data.tables.inventory_real=[{sku:'TEST-A',location:'TEST-TECH',location_type:'Técnico',quantity:1,cost:null,value:null,result:'INCLUIDO',eta_cut:'2026-09-30',sap_cut:'2026-09-29'}];data.sources.inventory_real={source_type:'GOOGLE_SHEETS_API_READ_ONLY',source_tab:'Inventario Real',original_data_rows:1,retrieved_at:captured,sanitized:true};
 const loadSnapshot=async()=>({data});
 const service=createDashboardService({loadSnapshot}),exporter=createExportService({loadSnapshot});
 const inCut=await service.getRows({type:'inventory_real',from:'2026-09-01',to:'2026-09-30'});
 assert.equal(inCut.total,1);
 // A later demand window can still display the latest available stock cut.
 // The inventory download must use that same view, not an event-date filter.
 const filter={from:'2026-10-01',to:'2026-10-31'};
 const dashboard=await service.getDashboard(filter);assert.equal(dashboard.business.stock.length,1);
 const csv=await(await exporter.exportCsv({type:'inventory',...filter})).text();
 assert.ok(csv.includes('TEST-A'));assert.ok(csv.includes('quantity'));
});
