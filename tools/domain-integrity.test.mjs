import test from 'node:test';
import assert from 'node:assert/strict';
import {date,ingestRows} from '../src/core.mjs';

test('impossible ISO dates cannot enter dated order indicators',()=>{
 for(const value of ['2026-02-30','2026-13-01','2026-00-10','2026-04-31','2026-01-01garbage'])assert.equal(date(value),null,value);
 assert.equal(date('2024-02-29'),'2024-02-29');
 assert.equal(date('2026-10-31T13:25:00Z'),'2026-10-31');
 const [row]=ingestRows([['Material SKU','Número de Orden','Codigo Tecnico','Cantidad','Fecha instalacion'],['TEST-SKU','TEST-ORDER','TEST-TECH','1','2026-02-30']],'google_consumos',0);
 assert.equal(row.date,null);
});
test('source activity takes priority over the historical fallback column',()=>{
 const [row]=ingestRows([['Material SKU','Número de Orden','Codigo Tecnico','Cantidad','Tipo de Actividad','Tipo Actividad Fuente'],['TEST-SKU','TEST-ORDER','TEST-TECH','1','ANTERIOR','VIGENTE']],'google_consumos',0);
 assert.equal(row.activity,'VIGENTE');
});
