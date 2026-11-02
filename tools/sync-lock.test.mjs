import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const {acquireWorkerLock}=await import('../lib/worker-lock.mjs').catch(()=>({}));
import {SheetsSync} from '../src/sheets-sync.mjs';

test('one private staging directory permits only one worker until release',async()=>{
 assert.equal(typeof acquireWorkerLock,'function');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'greencall-worker-lock-'));
 try{
  const release=await acquireWorkerLock(directory);
  await assert.rejects(acquireWorkerLock(directory),{code:'SYNC_IN_PROGRESS'});
  await release();await release();
  const again=await acquireWorkerLock(directory);await again();
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
test('an existing stale lock is not automatically removed by another worker',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'greencall-worker-lock-'));
 try{
  await fs.mkdir(path.join(directory,'.sync.lock'),{mode:0o700});
  await fs.writeFile(path.join(directory,'.sync.lock','owner.json'),'{"pid":999999999}');
  await assert.rejects(acquireWorkerLock(directory),{code:'SYNC_IN_PROGRESS'});
  assert.ok(await fs.stat(path.join(directory,'.sync.lock')));
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});

// Orchestration fixtures only. Sheets HTTP/header/readonly behavior has its own
// qa_sheets_sync suite; these tests exercise the real worker/filesystem boundary.
function syntheticSnapshot(){
 const tables={google_consumos:[{sku:'SYNTHETIC-SKU',order:'SYNTHETIC-ORDER',date:'2026-09-01',quantity:1}],sku_catalog:[{sku:'SYNTHETIC-SKU',unit:'PZA',cost:null}]};
 return {tables,sources:Object.fromEntries(Object.entries(tables).map(([type,rows])=>[type,{source_type:'GOOGLE_SHEETS_API_READ_ONLY',source_tab:type==='google_consumos'?'Consumos':'Catálogo SKUs',original_data_rows:rows.length,retrieved_at:'2026-10-01T00:00:00.000Z',sanitized:true}]))};
}
async function withSourceWorker(sync,run){
 const originals=Object.fromEntries(['load','configure','sync'].map(key=>[key,SheetsSync.prototype[key]]));
 try{
  SheetsSync.prototype.load=async function(){};
  SheetsSync.prototype.configure=async function(){};
  SheetsSync.prototype.sync=sync;
  await run();
 }finally{Object.assign(SheetsSync.prototype,originals)}
}
test('source workers hold the staging lease across extraction and release it on failure',async()=>{
 const {runSyncCloud}=await import('./sync-cloud.mjs');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'greencall-worker-sync-'));
 const options={argv:['--from-sheets','--staging-dir',directory],env:{GREENCALL_GOOGLE_CREDENTIAL_FILE:'/synthetic-only/credential.json'}};
 let unblock,entered,reads=0;
 const gate=new Promise(resolve=>unblock=resolve),started=new Promise(resolve=>entered=resolve);
 try{
  await withSourceWorker(async function(){if(++reads>1)throw Object.assign(Error('Concurrent worker entered extraction'),{code:'MISSING_LOCK'});entered();await gate;await this.commit(syntheticSnapshot())},async()=>{
   const first=runSyncCloud(options);await started;
   const attempted=runSyncCloud(options);
   try{await assert.rejects(attempted,{code:'SYNC_IN_PROGRESS'})}
   finally{unblock();await attempted.catch(()=>{})}
   await first;
  });
  await withSourceWorker(async function(){throw Error('Synthetic extraction failed')},async()=>{
   await assert.rejects(runSyncCloud(options),/Synthetic extraction failed/);
   await assert.rejects(fs.stat(path.join(directory,'.sync.lock')),{code:'ENOENT'});
  });
 }finally{unblock?.();await fs.rm(directory,{recursive:true,force:true})}
});
test('fresh source staging preserves active physical history and passes the pre-extraction CAS id',async()=>{
 const {runSyncCloud}=await import('./sync-cloud.mjs');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'greencall-worker-sync-'));
 const active=syntheticSnapshot();active.tables.physical_counts=[{take:'SYNTHETIC-TAKE',tech:'SYNTHETIC-TECH',sku:'SYNTHETIC-SKU',date:'2026-09-10',count:2}];active.sources.physical_counts={source_type:'PRIVATE_PHYSICAL_COUNT_XLSX',original_data_rows:1,retrieved_at:'2026-10-01T00:00:00.000Z',sanitized:true};
 const activeId='00000000-0000-0000-0000-000000000001';let published=false;
 try{
  await withSourceWorker(async function(){
   const prior=this.getDb();assert.equal(prior.tables.physical_counts?.length,1);
   const fresh=syntheticSnapshot();await this.commit({tables:{...prior.tables,...fresh.tables},sources:{...prior.sources,...fresh.sources}});
  },async()=>{
   await runSyncCloud({argv:['--from-sheets','--staging-dir',directory,'--apply'],env:{GREENCALL_GOOGLE_CREDENTIAL_FILE:'/synthetic-only/credential.json',GREENCALL_ALLOW_SNAPSHOT_WRITE:'1',GREENCALL_SNAPSHOT_ENV:'development',DATABASE_URL:'postgres://synthetic-development.invalid/test'},
    loadActiveSnapshot:async()=>({id:activeId,data:active}),
    publish:async(data,options)=>{assert.equal(options.expectedSnapshotId,activeId);assert.equal(data.tables.physical_counts[0].count,2);published=true;return {id:'SYNTHETIC-PUBLISHED'}}});
  });
  assert.equal(published,true);
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});
