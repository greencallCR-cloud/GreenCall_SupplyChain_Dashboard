// Local HTTP harness for the actual Vercel Web handlers, never a data mock.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicDir=path.join(root,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpeg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/')){
   const {createCloudApi}=await import('../lib/cloud-api.mjs');
   const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
   const opts={method:req.method,headers};if(!['GET','HEAD'].includes(req.method)){opts.body=req;opts.duplex='half'}
   const response=await createCloudApi()(new Request(`http://${req.headers.host}${req.url}`,opts));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  const target=path.resolve(publicDir,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!target.startsWith(publicDir+path.sep)){res.writeHead(404);res.end();return}
  const data=await fs.readFile(target);
  res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404,{'content-type':'application/json'});res.end('{"ok":false,"error":"No disponible"}')}
});
server.listen(process.env.PORT===undefined?8789:Number(process.env.PORT),'127.0.0.1',()=>console.log(`GreenCall cloud QA: http://127.0.0.1:${server.address().port}`));
