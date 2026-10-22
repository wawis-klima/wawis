// Local-only equivalent of the Supabase gateway. Forwards REAL bodies to
// Storage/PostgREST, adding CORS normally supplied by Kong. No fake success.
import { createServer } from 'node:http';
const server=createServer(async(req,res)=>{
 const cors={'access-control-allow-origin':'*','access-control-allow-headers':req.headers['access-control-request-headers']||'*','access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD','access-control-expose-headers':'content-range'};
 if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return;}
 const storage=req.url.startsWith('/storage/v1/'),rest=req.url.startsWith('/rest/v1/');
 if(!storage&&!rest){res.writeHead(404,cors);res.end();return;}
 try{
  const parts=[];for await(const part of req)parts.push(part);
  const body=Buffer.concat(parts),headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];delete headers['accept-encoding'];
  const target=(storage?'http://127.0.0.1:54329':'http://127.0.0.1:54328')+req.url.replace(storage?'/storage/v1':'/rest/v1','');
  const result=await fetch(target,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});
  const output=Buffer.from(await result.arrayBuffer());const responseHeaders=Object.fromEntries(result.headers);delete responseHeaders['content-encoding'];delete responseHeaders['transfer-encoding'];
  res.writeHead(result.status,{...responseHeaders,...cors,'content-length':output.length});res.end(output);
 }catch(error){res.writeHead(502,cors);res.end(JSON.stringify({error:error.message}));}
});
server.listen(54327,'127.0.0.1',()=>console.log('Isolated provider gateway listening on 127.0.0.1:54327'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
