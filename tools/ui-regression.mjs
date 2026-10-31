// Reproducible browser QA: node tools/ui-regression.mjs (requires agent-browser).
// Only loopback servers and labelled synthetic records. No external source or credential access.
// Reuses the recovered work/greencall-synthetic-ui.mjs fixture and route checks.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {TYPES,analyze} from '../src/core.mjs';
import {SOURCE_TABS} from '../src/sheets-sync.mjs';
import {snapshotFields} from '../lib/snapshot-store.mjs';
import {createCloudApi} from '../lib/cloud-api.mjs';
import {createDashboardService} from '../lib/dashboard-service.mjs';
import {createExportService} from '../lib/cloud-export.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function syntheticData(empty=false){
const data={tables:Object.fromEntries(TYPES.map(t=>[t,[]])),sources:{}};
const t=data.tables;
t.sku_catalog=[{sku:'QA-001',description:'QA SINTÉTICO · Material de prueba A',unit:'PZA',cost:100,center:'QA',warehouse:'QA',lot:'QA'},{sku:'QA-002',description:'QA SINTÉTICO · UTP exterior',unit:'M',cost:5,center:'QA',warehouse:'QA',lot:'QA'},{sku:'QA-003',description:'QA SINTÉTICO · Material sin costo',unit:'PZA',cost:null}];
t.technicians=[{tech:'QA-T1',name:'QA SINTÉTICO · Ubicación de prueba',status:'Activo'}];
for(let month=0;month<20;month++)for(let sku=0;sku<3;sku++){
 const date=new Date(Date.UTC(2024,month,15)).toISOString().slice(0,10),item=t.sku_catalog[sku];
 t.google_consumos.push({order:`QA-ORDER-${month}`,date,sku:item.sku,description:item.description,quantity:sku===0?1:3+month%5,tech:'QA-T1',center:'QA',warehouse:'QA',technology:'QA',_sheet_row:2+month*3+sku});
 t.dispatch_nonserial.push({acta:`QA-ACTA-${month}`,date,tech:'QA-T1',tech_name:t.technicians[0].name,sku:item.sku,description:item.description,quantity:5+month%3});
}
t.inventory_real=t.sku_catalog.map((item,index)=>({sku:item.sku,description:item.description,quantity:30+index,cost:item.cost,value:item.cost===null?null:(30+index)*item.cost,location:'QA-T1',location_type:'TÉCNICO',eta_cut:'2025-08-31',sap_cut:'2025-08-31',center:'QA',warehouse:'QA',lot:'QA',result:'INCLUIDO'}));
t.physical_counts=[{take:'QA-P1',date:'2025-06-30',tech:'QA-T1',sku:'QA-002',description:t.sku_catalog[1].description,count:40,status:'VALID'},{take:'QA-P2',date:'2025-07-31',tech:'QA-T1',sku:'QA-002',description:t.sku_catalog[1].description,count:30,status:'VALID'}];
t.charges=[{date:'2025-08-01',tech:'QA-T1',sku:'QA-001',description:t.sku_catalog[0].description,detail:'Cobrado',value:113,cost:100,quantity:1}];
t.workshop=[{date:'2025-08-01',sku:'QA-001',description:t.sku_catalog[0].description,serial:'QA-SERIAL-1',tech:'QA-T1',cost:100}];
t.rotation_tech=[{date:'2025-08-31',tech:'QA-T1',sku:'QA-001',serial:'QA-SERIAL-1',description:t.sku_catalog[0].description,days:60,status:'VENCIDO',cost:100}];
if(empty)for(const type of Object.keys(t))t[type]=[];
// Match the snapshot schema using synthetic metadata only. No Google request occurs.
const tabs=Object.fromEntries(SOURCE_TABS.map(({type,tab})=>[type,tab]));
for(const [type,rows]of Object.entries(t)){
 const allowed=new Set(snapshotFields(type)||[]);t[type]=rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>allowed.has(key))));
 if(rows.length)data.sources[type]={source_type:type==='physical_counts'?'PRIVATE_PHYSICAL_COUNT_XLSX':'GOOGLE_SHEETS_API_READ_ONLY',source_tab:type==='physical_counts'?'QA-SYNTHETIC-PHYSICAL':tabs[type],original_data_rows:rows.length,retrieved_at:'2025-08-31T00:00:00Z',sanitized:true};
}

return data;
}

async function fixtureServer(){
  const data=syntheticData(process.env.QA_UI_SCENARIO==='empty');
  const loadSnapshot=async()=>({id:'QA-SYNTHETIC',captured_at:'2025-08-31T00:00:00Z',data});
  const empty=process.env.QA_UI_SCENARIO==='empty';
  const base=createDashboardService({loadSnapshot}),exporter=createExportService({loadSnapshot});
  const service={...base,getRows:empty?async input=>({type:input.type,rows:[],total:0,offset:0,limit:30}):base.getRows,getDashboard:async filter=>{const d=empty?analyze(data,{},filter):await base.getDashboard(filter);d.coverage.notice='PRUEBAS SINTÉTICAS: estos registros no provienen de la operación ni verifican Google Sheets.';return d}};
  const api=createCloudApi({getService:async()=>service,getExporter:async()=>({exportCsv:async input=>{
    // Explicit fault injection exercises the actual HTTP error mapper and download UI.
    if(input.q==='QA_FORCE_EXPORT_LIMIT')throw Object.assign(Error('QA export limit'),{code:'EXPORT_LIMIT'});
    return exporter.exportCsv(input);
  }}),getSnapshotStatus:async()=>({state:'ready',id:'QA-SYNTHETIC',captured_at:'2025-08-31T00:00:00Z'}),checkDatabase:async()=>({state:'not_verified'})});
  const publicDir=path.join(root,'public');
  const server=http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname.startsWith('/api/')){
      const opt={method:req.method,headers:req.headers};if(!['GET','HEAD'].includes(req.method)){opt.body=req;opt.duplex='half'}
      const response=await api(new Request(url,opt));let body=Buffer.from(await response.arrayBuffer());
      if(url.pathname==='/api/status'){const s=JSON.parse(body);s.sheets={state:'QA_SINTETICO',last_sync_at:null};body=Buffer.from(JSON.stringify(s))}
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(body);return;
    }
    const target=path.resolve(publicDir,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!target.startsWith(publicDir+path.sep))throw Error('invalid path');
    let body=await fs.readFile(target);if(target.endsWith('.html'))body=Buffer.from(body.toString().replace('<title>','<title>PRUEBAS SINTÉTICAS | '));
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpeg':'image/jpeg','.png':'image/png'};
    res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('QA fixture resource unavailable')}});
  server.listen(0,'127.0.0.1',()=>console.log(`QA SYNTHETIC loopback http://127.0.0.1:${server.address().port}`));
}

if(process.argv.includes('--fixture')){await fixtureServer()}else{await regression()}

async function regression(){
  const artifactDir=path.resolve(process.env.GREENCALL_UI_ARTIFACT_DIR||path.join(root,'..','work','ui-regression'));
  await fs.mkdir(artifactDir,{recursive:true});
  const children=[],token=randomBytes(32).toString('base64url'),secret=randomBytes(48).toString('base64url');
  const session=`greencall-ui-regression-${process.pid}`;
  const report={timestamp:new Date().toISOString(),source:'Loopback only; all populated records are synthetic. No Google connection or operational validation.',routes:[],a11y:[],flows:[],initialStates:[],console:[],browserErrors:[],limitations:['axe cannot resolve every Plotly SVG contrast check','No private snapshot, Neon runtime, Google connectivity, or hosted Preview is certified by this test']};
  const save=()=>fs.writeFile(path.join(artifactDir,'results.json'),JSON.stringify(report,null,2)+'\n');
  function ab(...args){try{
    const result=JSON.parse(execFileSync('agent-browser',['--session',session,'--download-path',artifactDir,'--json',...args],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:5e6}));
    if(!result.success)throw Error(result.error||'Browser command failed');return result.data;
  }catch{throw Error(`Agent Browser command failed: ${args[0]}${args[0]==='wait'?' '+args.slice(1).join(' '):args[0]==='click'?' '+args[1]:''}`)}}
  const ev=js=>ab('eval',js).result;
  const scroll=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'center'})`);
  function verify(name,details){report.flows.push({name,...details});if(details.pass===false)throw Error(name)}
  function audit(phase,page,viewport){const r=ab('a11y','--tags','wcag2a,wcag2aa');report.a11y.push({phase,page,viewport,counts:r.counts,violations:r.violations,incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))});if(r.counts.violations)throw Error(`Accessibility violations: ${phase}/${page}`)}
  async function start(mode){
    // Do not inherit runtime database, Google, access keys, or other configured secrets.
    const env={PATH:process.env.PATH,HOME:process.env.HOME,PORT:'0'};
    if(mode!=='unconfigured')Object.assign(env,{GREENCALL_ACCESS_KEY:token,GREENCALL_SESSION_SECRET:secret});
    if(['populated','empty'].includes(mode))env.QA_UI_SCENARIO=mode;
    const child=spawn(process.execPath,['populated','empty'].includes(mode)?[fileURLToPath(import.meta.url),'--fixture']:['tools/cloud-dev.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});children.push(child);
    return new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('QA harness did not start')),15000);child.stdout.on('data',chunk=>{output+=chunk;const found=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(found){clearTimeout(timer);resolve(found[0])}});child.on('exit',()=>{clearTimeout(timer);reject(Error('QA harness exited'))});child.on('error',()=>{clearTimeout(timer);reject(Error('QA harness unavailable'))})});
  }
  function open(origin,login=false){ab('open',origin+'/#overview');ab('wait','--fn','!document.querySelector("#content .loader")');if(login&&ev('!!document.getElementById("accessToken")')){ab('fill','#accessToken',token);ab('click','#accessSubmit');ab('wait','--fn','!document.getElementById("accessToken")&&!document.querySelector("#content .loader")')}}
  function goto(page){ev(`document.querySelector('#nav a[data-page="${page}"]').click()`);ab('wait','--fn','!document.querySelector("#content .loader")&&[...document.querySelectorAll("#content .plot")].every(el=>el.querySelector(".main-svg,.empty-state"))')}
  const viewports=[[1920,1080],[1366,768],[768,1024],[390,844],[360,800]];
  const pages=['overview','inventory','consumptions','dispatch','rotation','policy','abc','forecast','planning','charges','workshop','technicians','physical','quality','admin'];
  try{
    const [pending,realAuth,empty,populated]=await Promise.all(['unconfigured','auth','empty','populated'].map(start));
    if(!process.argv.includes('--flows-only'))for(const [phase,origin]of [['unconfigured',pending],['authenticated-empty',empty],['SYNTHETIC-populated',populated]]){
      ab('set','viewport','1366','768');open(origin,phase!=='unconfigured');
      const state=ev('(async()=>{const s=await fetch("/api/status").then(r=>r.json());return {authenticated:s.authenticated,access:s.access.state,data:s.data.state,sheets:s.sheets.state}})()');report.initialStates.push({phase,...state});
      if(phase!=='unconfigured'&&(!state.authenticated||state.data!=='ready'))throw Error('Incorrect QA source state');
      if(phase==='SYNTHETIC-populated'&&!ev('!!document.querySelector("#content .kpi")'))throw Error('Populated fixture did not render analytics');
      ab('errors','--clear');ab('console','--clear');
      for(const [w,h]of viewports){
        ab('set','viewport',String(w),String(h));
        for(const page of pages){
          const row=ev(`(async()=>{
            document.querySelector('#nav a[data-page="${page}"]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            const start=performance.now();
            while([...document.querySelectorAll('#content .plot')].some(el=>!el.querySelector('.main-svg,.empty-state'))&&performance.now()-start<4000)await new Promise(r=>setTimeout(r,25));
            if('${page}'==='quality')while(document.querySelector('#rowResults')&&!document.querySelector('#rowResults table,#rowResults .empty-state')&&performance.now()-start<4000)await new Promise(r=>setTimeout(r,25));
            return {phase:'${phase}',page:'${page}',viewport:[innerWidth,innerHeight],title:document.querySelector('h1').textContent,active:document.querySelector('#nav [aria-current=page]')?.dataset.page,overflow:document.documentElement.scrollWidth>innerWidth,contentLength:document.getElementById('content').innerText.length,kpis:document.querySelectorAll('#content .kpi').length,plots:document.querySelectorAll('#content .plot').length,pendingPlots:[...document.querySelectorAll('#content .plot')].filter(el=>!el.querySelector('.main-svg,.empty-state')).length,tables:document.querySelectorAll('#content table').length,explorerError:document.querySelector('#rowResults .warning-inline')?.textContent||null};})()`);
          report.routes.push(row);if(row.overflow||row.pendingPlots||row.explorerError||row.active!==page||row.contentLength<100)throw Error(`Route regression: ${phase}/${page}/${w}`);
          if(w===1366)audit(phase,page,[w,h]);
        }
        goto('overview');ab('screenshot',path.join(artifactDir,`${phase}-${w}.png`));if(w===360)audit(phase,'overview',[w,h]);
      }
      const errors=ab('errors').errors;report.browserErrors.push({phase,errors});report.console.push({phase,messages:ab('console').messages});if(errors.length)throw Error('Unexpected JavaScript error');await save();
      console.log(`${phase}: 75 routes, 16 axe audits passed`);
    }
    ab('set','media','light','reduced-motion');ab('set','viewport','390','844');ab('cookies','clear');open(realAuth);ab('wait','--text','Acceda a su operación');audit('flow','login',[390,844]);
    ab('fill','#accessToken','QA_INTENTIONALLY_WRONG');ab('click','#accessSubmit');ab('wait','--text','La clave no es válida');
    verify('invalid login focuses field',ev('({pass:document.activeElement.id==="accessToken"&&document.getElementById("accessToken").getAttribute("aria-invalid")==="true"&&!document.getElementById("accessSubmit").disabled})'));audit('flow','invalid login',[390,844]);
    ab('fill','#accessToken',token);ab('click','#accessSubmit');ab('wait','--text','Aún no hay datos disponibles');
    verify('actual Cloud harness authenticated without source',ev('(async()=>{const s=await fetch("/api/status").then(r=>r.json());return {pass:s.authenticated&&s.data.state==="not_configured"&&!document.querySelector(".kpi"),data:s.data.state}})()'));
    ab('click','#stateLogout');ab('wait','--text','Acceda a su operación');verify('logout rejects dashboard',ev('(async()=>({pass:(await fetch("/api/dashboard")).status===401&&!document.querySelector(".kpi")}))()'));
    open(pending);ab('network','route','**/api/status','--abort');ab('click','#retryData');ab('wait','--text','No se pudo leer la operación');
    verify('network error disables data controls',ev('({pass:!document.querySelector(".kpi")&&[...document.querySelectorAll("#globalFilters input,#globalFilters select,#globalFilters button")].every(el=>el.disabled)})'));audit('flow','network error',[390,844]);
    ab('network','unroute');ab('click','#retryData');ab('wait','--text','Prepare un acceso seguro');verify('network retry recovers',{pass:true});
    ab('click','#menuToggle');verify('mobile drawer inerts workspace',ev('({pass:document.querySelector(".workspace").inert&&!document.getElementById("sidebar").inert})'));
    ab('focus','#nav a[data-page="admin"]');ab('press','Tab');verify('mobile drawer focus loop',ev('({pass:document.activeElement.classList.contains("side-brand")})'));
    ab('press','Escape');verify('mobile drawer Escape returns focus',ev('({pass:document.activeElement.id==="menuToggle"&&!document.querySelector(".workspace").inert&&document.getElementById("sidebar").inert})'));
    ab('click','#menuToggle');ab('wait','--fn','document.querySelector("#nav a[data-page=inventory]").getBoundingClientRect().left>=0');ab('click','#nav a[data-page="inventory"]');verify('mobile navigation closes drawer',ev('({pass:location.hash==="#inventory"&&!document.body.classList.contains("drawer-open")&&!document.querySelector(".workspace").inert})'));
    ab('set','viewport','1366','768');open(populated,true);ab('wait','--fn','!!document.querySelector("#ov1 .main-svg")');
    ab('click','.focus[data-chart="ov1"]');ab('focus','#closeFocus');ab('press','Shift+Tab');verify('modal backward focus stays inside',ev('({pass:!!document.activeElement.closest("#focusModal")&&document.getElementById("sidebar").inert})'));ab('press','Tab');verify('modal forward focus loops',ev('({pass:document.activeElement.id==="closeFocus"})'));audit('flow','chart modal',[1366,768]);
    ab('press','Escape');verify('modal closes and restores focus',ev('({pass:document.getElementById("focusModal").hidden&&document.activeElement.dataset.chart==="ov1"&&!document.querySelector(".workspace").inert&&!document.getElementById("sidebar").inert})'));
    goto('inventory');ab('focus','.skip-link');ab('press','Enter');verify('skip link preserves module',ev('({pass:location.hash==="#inventory"&&document.activeElement.id==="content"&&document.querySelector("#nav [aria-current=page]").dataset.page==="inventory"})'));
    verify('latest filter response wins',ev('(async()=>{const original=window.fetch;window.__qaResolved=[];window.fetch=async(...args)=>{const r=await original(...args);if(String(args[0]).includes("/api/dashboard?")){if(String(args[0]).includes("sku=QA-001"))await new Promise(done=>setTimeout(done,300));window.__qaResolved.push(String(args[0]))}return r};try{const el=document.getElementById("fSku");el.value="QA-001";el.dispatchEvent(new Event("change"));el.value="QA-002";el.dispatchEvent(new Event("change"));const start=performance.now();while((window.__qaResolved.length<2||document.getElementById("content").hasAttribute("aria-busy"))&&performance.now()-start<5000)await new Promise(r=>setTimeout(r,25));return {pass:window.__qaResolved.length===2&&document.getElementById("fSku").value==="QA-002"&&location.search.includes("sku=QA-002")&&document.getElementById("invTable").innerText.includes("UTP exterior")&&!document.getElementById("invTable").innerText.includes("Material de prueba A"),resolved:window.__qaResolved}}finally{window.fetch=original}})()'));
    goto('forecast');ab('select','#forecastHorizon','12');verify('nested validation follows selected horizon',ev('({pass:document.getElementById("horizonValidation")?.dataset.horizon==="12"&&document.getElementById("horizonValidation").innerText.includes("selección automática")})'));ab('select','#forecastHorizon','3');verify('nested validation switches horizon without relabeling one-step metrics',ev('({pass:document.getElementById("horizonValidation")?.dataset.horizon==="3"&&document.getElementById("content").innerText.includes("WAPE a un mes")})'));
    ev('for(const [id,value]of [["fFrom","2025-06-01"],["fTo","2025-08-31"]]){document.getElementById(id).value=value;document.getElementById(id).dispatchEvent(new Event("change"))}');ab('wait','--fn','!document.getElementById("content").hasAttribute("aria-busy")');goto('abc');
    ev('window.__qaExportMeta=[];window.__qaCaptureFetch=fetch;window.fetch=async(...args)=>{const r=await window.__qaCaptureFetch(...args);if(String(args[0]).startsWith("/api/exports?"))window.__qaExportMeta.push({status:r.status,type:r.headers.get("content-type"),url:String(args[0])});return r}');
    scroll('[data-export="abc"]');ab('click','[data-export="abc"]');const consumptionFile=path.join(artifactDir,'SYNTHETIC-abc.csv');ab('wait','--download',consumptionFile);const csv=await fs.readFile(consumptionFile,'utf8');
    verify('computed CSV download honors SKU and date filters',{pass:csv.trim().split(/\r?\n/).length===2&&csv.includes('QA-002')&&!csv.includes('QA-001')&&!csv.includes('QA-003'),dataRows:csv.trim().split(/\r?\n/).length-1});
    goto('inventory');scroll('[data-export="inventory"]');ab('click','[data-export="inventory"]');const inventoryFile=path.join(artifactDir,'SYNTHETIC-inventory.csv');ab('wait','--download',inventoryFile);const inventoryCsv=await fs.readFile(inventoryFile,'utf8'),inventoryLines=inventoryCsv.trim().split(/\r?\n/),quantityColumn=inventoryLines[0].split(',').indexOf('"quantity"');
    verify('inventory CSV matches visible analytic stock',{pass:inventoryLines.length===2&&inventoryCsv.includes('QA-002')&&quantityColumn>=0&&inventoryLines[1].split(',')[quantityColumn]==='"30"',dataRows:inventoryLines.length-1});
    goto('quality');scroll('#dataType');ab('select','#dataType','google_consumos');ab('fill','#dataSearch','QA-ORDER-19');scroll('#dataSearchBtn');ab('click','#dataSearchBtn');ab('wait','--fn','document.getElementById("rowResults").innerText.includes("QA-ORDER-19")&&!document.getElementById("rowResults").innerText.includes("QA-ORDER-18")');scroll('#rowCsv');ev('window.__qaExportMeta=[]');ab('click','#rowCsv');ab('wait','--fn','window.__qaExportMeta.length>0');verify('explorer CSV HTTP response',ev('({pass:window.__qaExportMeta[0].status===200&&window.__qaExportMeta[0].type.includes("text/csv")&&window.__qaExportMeta[0].url.includes("q=QA-ORDER-19"),response:window.__qaExportMeta[0],toast:document.getElementById("toast").innerText})'));const rowsFile=path.join(artifactDir,'SYNTHETIC-rows.csv');ab('wait','--download',rowsFile);const rowsCsv=await fs.readFile(rowsFile,'utf8');
    verify('explorer CSV honors query and global filters',{pass:rowsCsv.trim().split(/\r?\n/).length===2&&rowsCsv.includes('QA-ORDER-19')&&rowsCsv.includes('QA-002')&&!rowsCsv.includes('QA-001'),dataRows:rowsCsv.trim().split(/\r?\n/).length-1});
    const urlBefore=ev('location.href');ab('fill','#dataSearch','QA_FORCE_EXPORT_LIMIT');scroll('#dataSearchBtn');ab('click','#dataSearchBtn');scroll('#rowCsv');ab('click','#rowCsv');ab('wait','--text','La exportación excede el límite');verify('CSV 413 stays in workspace',ev(`({pass:location.href===${JSON.stringify(urlBefore)}&&document.getElementById('toast').innerText.includes('límite'),message:document.getElementById('toast').innerText})`));
    // Delay only delivery of a real export response to exercise logout cancellation.
    goto('abc');ev('window.__qaExportDone=false;window.__qaOriginalFetch=fetch;window.fetch=async(...args)=>{const r=await window.__qaOriginalFetch(...args);if(String(args[0]).startsWith("/api/exports?")){await new Promise(done=>setTimeout(done,500));window.__qaExportDone=true}return r}');
    const before=(await fs.readdir(artifactDir)).filter(f=>f.endsWith('.csv')).length;scroll('[data-export="abc"]');ab('click','[data-export="abc"]');ab('click','#sessionLogout');ab('wait','--text','Acceda a su operación');ab('wait','--fn','window.__qaExportDone');ev('window.fetch=window.__qaOriginalFetch');
    const after=(await fs.readdir(artifactDir)).filter(f=>f.endsWith('.csv')).length;verify('logout discards pending export',{pass:before===after&&!ev('!!document.querySelector(".kpi")')});
    report.success=true;await save();console.log(`${report.routes.length} routes, ${report.a11y.length} axe audits, ${report.flows.length} flows passed. Synthetic artifacts: ${artifactDir}`);
  }catch(error){try{report.failureState=ev('({url:location.origin+location.pathname+location.search+location.hash,title:document.querySelector("h1")?.textContent,heading:document.querySelector("#content h2")?.textContent,toast:document.getElementById("toast")?.innerText,exportMeta:window.__qaExportMeta,loader:!!document.querySelector("#content .loader"),login:!!document.getElementById("accessToken"),content:document.getElementById("content")?.innerText.slice(0,1000),plots:[...document.querySelectorAll(".plot")].map(el=>el.id)})')}catch{}report.success=false;report.failure=error.message;await save();console.error(`UI regression failed: ${error.message}. Report: ${path.join(artifactDir,'results.json')}`);process.exitCode=1}
  finally{try{ab('network','unroute');ab('close')}catch{}for(const child of children)child.kill('SIGTERM')}
}
