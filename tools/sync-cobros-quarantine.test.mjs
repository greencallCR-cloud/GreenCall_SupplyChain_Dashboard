// Regression for current Sheets data with fewer Cobros rows.
// Never silently discard verified historical financial records. Synthetic fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SheetsSync, SOURCE_TABS, SheetsSyncError } from '../src/sheets-sync.mjs';

async function exercise(currentCount) {
  const previous = Array.from({length:130}, (_,i) => ({date:'2026-10-01',serial:'SER'+i,sku:'SKU',value:100}));
  const previousSource = {
    source_type:'GOOGLE_SHEETS_API_READ_ONLY',source_tab:'Cobros',
    original_data_rows:130,retrieved_at:'2026-11-05T00:55:17Z',sanitized:true
  };
  const old={tables:{charges:previous},sources:{charges:previousSource}};
  let committed=null;
  const worker=new SheetsSync({getDb:()=>old,commit:async next=>{committed=next},clock:()=>new Date('2026-11-09T22:00:00Z')});
  worker.config.enabled=true;
  worker.save=async()=>{};
  worker.metadata=async()=>({sheets:SOURCE_TABS.map(s=>({properties:{title:s.tab,gridProperties:{rowCount:201}}}))});
  worker.readTab=async source=>({rows:source.type==='charges'?previous.slice(0,currentCount):[],last_actual_row:currentCount+1});
  const result=await worker.sync({forceFull:true});
  return {result,committed,previousSource,previous};
}
test('Cobros smaller by 7.7% quarantines only that source; old financial history is retained',async()=>{
  const {result,committed,previous,previousSource}=await exercise(120);
  assert.equal(result.ok,true);
  assert.equal(result.sources.charges.mode,'HISTORICAL_REDUCTION_QUARANTINED');
  assert.equal(committed.tables.charges.length,previous.length);
  assert.deepEqual(committed.tables.charges,previous);
  assert.deepEqual(committed.sources.charges,previousSource);
  assert.ok(committed.sources.rotation_tech,'unrelated sources are still updated');
  assert.equal(committed.sources.rotation_tech.original_data_rows,0);
});
test('a Cobros reduction above 10% still blocks the entire publication',async()=>{
  await assert.rejects(exercise(110),error=>error instanceof SheetsSyncError && error.code==='SOURCE_REDUCTION');
});
