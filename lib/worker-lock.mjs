import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

/** Atomic filesystem lease held throughout extraction, staging and publication.
 * Never steal an existing lease: a PID may belong to another host or be reused.
 */
export async function acquireWorkerLock(directory){
 const lock=path.join(directory,'.sync.lock'),owner=randomUUID();
 try{await fs.mkdir(lock,{mode:0o700})}
 catch(error){
  if(error.code==='EEXIST')throw Object.assign(new Error('Ya existe una sincronización o un bloqueo pendiente en esta carpeta privada.'),{code:'SYNC_IN_PROGRESS'});
  throw error;
 }
 try{await fs.writeFile(path.join(lock,'owner.json'),JSON.stringify({owner,pid:process.pid,created_at:new Date().toISOString()}),{mode:0o600,flag:'wx'})}
 catch(error){await fs.rm(lock,{recursive:true,force:true});throw error}
 let released=false;
 return async()=>{
  if(released)return;
  const current=JSON.parse(await fs.readFile(path.join(lock,'owner.json'),'utf8'));
  if(current.owner!==owner)throw Object.assign(new Error('El bloqueo de sincronización cambió de propietario.'),{code:'SYNC_LOCK_CHANGED'});
  await fs.rm(lock,{recursive:true});released=true;
 };
}
