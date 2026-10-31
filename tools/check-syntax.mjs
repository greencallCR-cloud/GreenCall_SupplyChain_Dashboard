import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function sources(directory){
 const files=[];
 for(const entry of await readdir(path.join(root,directory),{withFileTypes:true})){
  const relative=path.join(directory,entry.name);
  if(entry.isDirectory())files.push(...await sources(relative));
  else if(/\.(?:mjs|js)$/.test(entry.name)&&entry.name!=='plotly.min.js')files.push(relative);
 }
 return files;
}
const files=['local-server.mjs',...(await Promise.all(['src','lib','api','tools','public/assets'].map(sources))).flat()];
for(const file of files){
 const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
 if(result.status!==0){process.stderr.write(result.stderr||'Syntax check failed: '+file);process.exit(result.status||1)}
}
console.log(`Syntax checked: ${files.length} source files.`);
