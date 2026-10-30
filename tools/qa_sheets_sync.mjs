import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {SheetsSync,SOURCE_TABS,DEFAULT_SHEET_ID} from '../src/sheets-sync.mjs';
import {detect} from '../src/core.mjs';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'greencall-sync-'));let passed=0;
function check(label,fn){fn();passed++;console.log('✓ '+label)}
const templateMap={
 google_consumos:'01_CONSUMOS_GOOGLE.csv',inventory_real:'03_INVENTARIO_REAL.csv',
 dispatch_serial:'07_DESPACHOS_SER.csv',dispatch_nonserial:'08_DESPACHOS_NO_SER.csv',
 rotation_tech:'09_ROTACION_TECNICOS.csv',rotation_returns:'10_DEVOLUCION_ROTACION.csv',
 sku_catalog:'12_CATALOGO_SKUS.csv',technicians:'16_TECNICOS.csv',sap_serials:'04_SERIES_SAP.csv',
 sap_quantities:'05_CANTIDADES_SAP.csv',eta:'06_EXISTENCIAS_ETA.csv',charges:'13_COBROS.csv',
 workshop:'14_TALLER.csv',receipts:'15_RECEPCIONES.csv'
};
const raw={},headers={};for(const src of SOURCE_TABS){const s=await fs.readFile(new URL('../FORMATOS_IMPORTACION/'+templateMap[src.type],import.meta.url),'utf8');headers[src.tab]=s.split(/\r?\n/)[0].replace(/^\ufeff/,'').split(',');raw[src.tab]=[headers[src.tab]]}
raw['Consumos']=[
 ['Material SKU','Tipo Inventario','Número Serie','Modelo del Equipo','LOTE_SAP','Almacen','Centro','Cantidad','Tecnico','Número de Orden','Codigo Tecnico','Tipo de Actividad','Paquete','Sub Tipo de Orden','Año','Mes','Fecha instalacion','Fecha Cierre Fuente','Tipo Actividad Fuente','Código Técnico Fuente'],
 ['4018238','BUNDLE ZTE','','','VALORADO','A000','R859','1','JORGE','CW_100','GGRE058','Instalación','','','2026','','29/10/2026','29/10/2026','Instalación','GGRE058'],
 ['4018238','BUNDLE ZTE','','','VALORADO','A000','R859','1','JORGE','CW_101','GGRE058','Instalación','','','2026','','30/10/2026','30/10/2026','Instalación','GGRE058'],
];
// The styled Recepciones tab has its header at row 9.
raw['Recepciones']=Array.from({length:8},()=>[]).concat([['Número de serie','','Descripción','','','','Cantidad'],['ZTEST-001','','SWITCH DLINK DGS105','','','','1']]);
for(const src of SOURCE_TABS){const h=raw[src.tab].find(r=>r?.length&&r.some(x=>String(x).trim().toLowerCase().includes('numero de serie')||String(x).includes('Material SKU')||String(x).includes('Cantidad')))||headers[src.tab];if(src.tab!=='Recepciones'&&src.tab!=='Consumos')raw[src.tab]=[headers[src.tab]];}
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const credentialPath=path.join(tmp,'secret-test.json');await fs.writeFile(credentialPath,JSON.stringify({type:'service_account',client_email:'greencall-test@test-project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://oauth2.googleapis.com/token'}));
let committed=0,db={tables:{},sources:{},batches:[]},failAt=null;
const configPath=path.join(tmp,'config.json');
const engine=new SheetsSync({configPath,getDb:()=>db,commit:async next=>{db=next;committed++},pause:async()=>{},clock:()=>new Date('2026-10-30T20:00:00Z')});
await engine.load();check('Conexión deshabilitada por defecto',()=>assert.equal(engine.status().enabled,false));
await engine.configure({credential_path:credentialPath,spreadsheet_id:DEFAULT_SHEET_ID,interval_minutes:10});
check('Configuración no devuelve clave privada ni ruta absoluta',()=>{const st=engine.status();assert.equal(st.credential_configured,true);assert.ok(!JSON.stringify(st).includes('BEGIN PRIVATE KEY'));assert.ok(!JSON.stringify(st).includes(credentialPath))});
engine.metadata=async()=>({spreadsheetId:DEFAULT_SHEET_ID,properties:{title:'GreenCall'},sheets:SOURCE_TABS.map(x=>({properties:{title:x.tab,gridProperties:{rowCount:raw[x.tab].length}}}))});
engine.fetchBlock=async(tab,start,end)=>{if(failAt===tab)throw Error('API falla simulada');return raw[tab].slice(start-1,end)};
const first=await engine.sync({forceFull:true});check('Snapshot inicial usa solamente hojas reconocidas',()=>{assert.equal(committed,1);assert.equal(Object.keys(first.sources).length,SOURCE_TABS.length);assert.equal(db.tables.google_consumos.length,2)});
check('Orden y SKU preservados, fechas válidas',()=>{assert.equal(db.tables.google_consumos[0].order,'CW_100');assert.equal(db.tables.google_consumos[1].date,'2026-10-30');assert.equal(db.tables.google_consumos[1]._sheet_row,3)});
check('Recepciones estilo hoja: extracción desde encabezado en fila 9',()=>assert.equal(db.tables.receipts[0]?.quantity,1));
const original=JSON.stringify(db.tables.google_consumos);
await engine.sync({forceFull:true});check('Dos lecturas completas no duplican consumos',()=>{assert.equal(db.tables.google_consumos.length,2);assert.equal(JSON.stringify(db.tables.google_consumos),original)});
failAt='Cobros';const before=db;await assert.rejects(engine.sync({forceFull:true}),/API falla simulada/);check('Falla intermedia conserva el snapshot y el commit previo',()=>{assert.equal(db,before);assert.equal(committed,2);assert.equal(engine.busy,false)});failAt=null;
raw['Consumos'].push(['4018238','BUNDLE ZTE','','','VALORADO','A000','R859','2','JORGE','CW_102','GGRE058','Instalación','','','2026','','30/10/2026','30/10/2026','Instalación','GGRE058']);
engine.metadata=async()=>({spreadsheetId:DEFAULT_SHEET_ID,properties:{title:'GreenCall'},sheets:SOURCE_TABS.map(x=>({properties:{title:x.tab,gridProperties:{rowCount:raw[x.tab].length}}}))});
const result=await engine.sync({forceFull:false});check('Se añaden filas nuevas mediante sincronización de cola',()=>{assert.equal(result.full,false);assert.equal(db.tables.google_consumos.length,3);assert.equal(db.tables.google_consumos[2].order,'CW_102')});
raw['Consumos'][1][7]='3';await engine.sync({forceFull:false});check('Cambio en una fila existente corrige cantidad sin duplicarla',()=>{assert.equal(db.tables.google_consumos.length,3);assert.equal(db.tables.google_consumos[0].quantity,3)});
// Adversarial: inserción en el histórico de Consumos desplaza las filas físicas;
// la reconciliación debe detectar el cambio de identidad y hacer una lectura completa.
raw['Consumos'].splice(1,0,['4018238','BUNDLE ZTE','','','VALORADO','A000','R859','1','JORGE','CW_INSERTED','GGRE058','Instalación','','','2026','','27/10/2026','27/10/2026','Instalación','GGRE058']);
await engine.sync({forceFull:false});
check('Inserción intermedia detecta desplazamiento de fila y reconstruye el histórico',()=>{assert.equal(db.tables.google_consumos.length,4);assert.equal(new Set(db.tables.google_consumos.map(x=>x.order)).size,4);assert.equal(db.tables.google_consumos[0].order,'CW_INSERTED')});
// Una eliminación remota involuntaria nunca borra el histórico precargado.
raw['Consumos'].splice(1,1);const saved=db;
await assert.rejects(engine.sync({forceFull:true}),/Consumos: el origen tiene menos líneas/);
check('La eliminación inesperada de Consumos no sobrescribe el snapshot',()=>{assert.equal(db,saved);assert.equal(db.tables.google_consumos.length,4)});
const codeText=await fs.readFile(new URL('../src/sheets-sync.mjs',import.meta.url),'utf8');check('El scope OAuth es solo lectura',()=>assert.ok(codeText.includes('https://www.googleapis.com/auth/spreadsheets.readonly')));
check('Los datos de cliente quedan fuera del rango de Consumos',()=>{const text=engine.fetchBlock.toString();assert.ok(!text.includes('Cliente'))});
await fs.rm(tmp,{recursive:true,force:true});console.log(`QA Google Sheets: ${passed}/${passed} pruebas correctas`);
