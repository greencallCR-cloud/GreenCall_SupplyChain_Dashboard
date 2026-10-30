import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {SheetsSync} from '../src/sheets-sync.mjs';
import {prepareImportBatch} from '../src/import-commit.mjs';
import {safeCsvCell} from '../src/security.mjs';
let passed=0;const test=(title,run)=>{run();passed++;console.log('✓ '+title)};
const date=Date.now();
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'gc-hardening-'));
try{
 const original={tables:{google_consumos:[{order:'A',sku:'100',quantity:1}],dispatch_nonserial:[]},sources:{},batches:[]};
 const stages=new Map([
  ['ok',{created:date,filename:'a.csv',sha:'A',records:[{type:'google_consumos',rows:[{order:'B',sku:'100',quantity:2}]}]}],
  ['bad',{created:date,filename:'b.csv',sha:'B',records:[{type:'dispatch_nonserial',rows:[{sku:'12',date:'2026-10-01'}]}, {error:'Encabezado incorrecto'}]}],
 ]);
 assert.throws(()=>prepareImportBatch(original,stages,['ok','bad']),/hojas inválidas/);
 test('Importación multifuente aborta completa y no altera snapshot ante error',()=>{assert.equal(original.tables.google_consumos.length,1);assert.equal(original.batches.length,0)});
 const r=prepareImportBatch(original,stages,['ok']);
 test('Importación devuelve nuevo objeto; original inalterado',()=>{assert.equal(r.next.tables.google_consumos.length,2);assert.equal(original.tables.google_consumos.length,1)});
 test('Reaplicar el lote idempotente no duplica registros',()=>{const twice=prepareImportBatch(r.next,stages,['ok']);assert.equal(twice.next.tables.google_consumos.length,2);assert.equal(twice.results[0].added,0)});
 test('Protección CSV contra fórmulas, tabuladores y saltos de línea',()=>{for(const value of ['=HYPERLINK("https://ejemplo")','\t@SUM(1,1)','+cmd','\n-1+2'])assert(safeCsvCell(value).includes("'"));assert.equal(safeCsvCell('12,5'),'"12,5"');assert.equal(safeCsvCell('Valor "A"'),'"Valor ""A"""')});
 const sync=new SheetsSync({configPath:path.join(tmp,'config.json'),getDb:()=>({tables:{},sources:{},batches:[]}),commit:async()=>{}});
 await sync.load();
 test('Estado inicial no afirma conexión exitosa sin credenciales',()=>{assert.equal(sync.status().state,'PRECARGADOS');assert.equal(sync.status().last_sync_at,null)});
 sync.config.enabled=true;
 test('Habilitar configuración sin primera lectura sigue con estado precargado',()=>assert.equal(sync.status().state,'PRECARGADOS'));
 sync.config.last_sync_at='2026-10-30T10:00:00Z';
 test('Última lectura real registrada habilita estado conectado',()=>assert.equal(sync.status().state,'CONECTADO'));
 sync.lastError='HTTP 429';
 test('Errores de sincronización prevalecen sobre estado conectado',()=>assert.equal(sync.status().state,'ERROR'));
 await assert.rejects(sync.readCredential(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','public','assets','secret.json')),/fuera de la carpeta/);
 test('Se rechaza ruta de credenciales dentro de la aplicación',()=>{});
 console.log(`QA HARDENING: ${passed}/${passed} verificaciones correctas`);
}finally{await fs.rm(tmp,{recursive:true,force:true})}
