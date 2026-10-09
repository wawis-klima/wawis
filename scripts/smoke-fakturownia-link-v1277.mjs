import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { buildJobInvoiceOid, findIssuedVatInvoiceForJob, inspectManualInvoiceMatch, findInvoiceCandidatesForManualConfirmation } from '../supabase/functions/fakturownia-client/invoice-match.js';
const jobId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherJobId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const contractorId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const clientId=55, number='FV/10/2026/17';
const sample={id:991,number,client_id:clientId,kind:'vat',status:'issued',oid:''};
const inspect=(invoice)=>inspectManualInvoiceMatch(invoice,{jobId,clientId:String(clientId),invoiceNumber:number});
assert.equal(inspect(sample).ok,true);
assert.equal(inspect({...sample,oid:buildJobInvoiceOid(jobId)}).ok,true);
assert.equal(inspect({...sample,oid:buildJobInvoiceOid(otherJobId)}).code,'OTHER_JOB');
assert.equal(inspect({...sample,client_id:99}).code,'WRONG_CLIENT');
assert.equal(inspect({...sample,number:'WRONG'}).code,'NUMBER_MISMATCH');
assert.equal(inspect({...sample,kind:'proforma'}).code,'NOT_ISSUED_VAT');
assert.equal(inspect({...sample,status:'draft'}).code,'NOT_ISSUED_VAT');
assert.equal(inspect(null).code,'NOT_FOUND');
const src=fs.readFileSync(new URL('../supabase/functions/fakturownia-client/index.ts',import.meta.url),'utf8')
  .replace(/^import \{ createClient \} from "npm:\@supabase\/supabase-js\@[^"]+";?\s*$/m,'')
  .replace(/^import \{ buildJobInvoiceOid, findIssuedVatInvoiceForJob, inspectManualInvoiceMatch, findInvoiceCandidatesForManualConfirmation \} from "\.\/invoice-match\.js";?\s*$/m,'');
assert(!src.includes('import {'),'Test executes actual Edge source with mocked imports');
const compiled=(await transform(src,{loader:'ts',target:'es2022',format:'iife'})).code;
async function run(label, opts={}, expected={}) {
 const {action='link_by_number',invoices=[sample],clients=[{id:clientId,external_id:contractorId}],status='Zakończone',role='Administrator',alreadyLinked=[],suppliedClientId=String(clientId)}=opts;
 let handler;const calls=[];
 const adminDb={from(table){return {select(){return this;},eq(){return this;},async in(){return {data:alreadyLinked.map(id=>({vat_invoice_fakturownia_invoice_id:id})),error:null};},async maybeSingle(){
    return {data:table==='profiles'?{role}:table==='jobs'?{id:jobId,contractor_id:contractorId,status,vat_invoice_fakturownia_confirmed:false}:null,error:null};
 }};}};
 const env={SUPABASE_URL:'https://fake.supabase.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',FAKTUROWNIA_API_TOKEN:'placeholder'};
 const sandbox={
   buildJobInvoiceOid,findIssuedVatInvoiceForJob,inspectManualInvoiceMatch,findInvoiceCandidatesForManualConfirmation,
   createClient(_url,key){return key==='anon'?{auth:{async getUser(){return {data:{user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}},error:null};}}}:adminDb;},
   Deno:{serve(f){handler=f;},env:{get(k){return env[k]||'';}}},
   async fetch(value,options){
      const u=new URL(String(value)),method=options?.method||'GET';
      calls.push({path:u.pathname,method,params:u.searchParams});
      if(u.pathname==='/clients.json')return new Response(JSON.stringify(clients),{status:200});
      if(u.pathname==='/invoices.json')return new Response(JSON.stringify(invoices),{status:200});
      throw Error('Unexpected API call '+u.pathname);
   },
   URL,URLSearchParams,Request,Response,Headers,AbortController,DOMException,setTimeout,clearTimeout,console,JSON,Array,String,Boolean,Object,Number,Intl,Date,encodeURIComponent,
 };
 vm.runInNewContext(compiled,sandbox,{timeout:3000,filename:'fakturownia-client.ts'});
 const res=await handler(new Request('https://edge.test/functions/v1/fakturownia-client',{method:'POST',
   headers:{Authorization:'Bearer token','Content-Type':'application/json'},
   body:JSON.stringify({action,jobId,clientId:suppliedClientId,invoiceNumber:number})}));
 const out=await res.json();
 assert.equal(res.status,expected.http||200,label+' HTTP');
 if(expected.found!==undefined)assert.equal(out.found,expected.found,label+' found');
 if(expected.code)assert.equal(out.reasonCode,expected.code,label+' refusal');
 if(expected.candidates!==undefined)assert.equal(out.candidates?.length,expected.candidates,label+' candidate count');
 if(expected.error)assert.match(String(out.error||''),expected.error,label+' error');
 assert.equal(calls.filter(x=>x.method!=='GET').length,0,label+' no Fakturownia writes');
 if(action==='link_by_number'&&role==='Administrator'&&status==='Zakończone'&&clients.length===1&&clients[0].external_id===contractorId){
   assert(calls.some(x=>x.path==='/invoices.json'&&x.params.get('number')===number),'Search by exact invoice number');
 }
 console.log('PASS V12.77 '+label);
}
await run('linked by number',{}, {found:true});
await run('correct OID',{invoices:[{...sample,oid:buildJobInvoiceOid(jobId)}]}, {found:true});
await run('other job blocked',{invoices:[{...sample,oid:buildJobInvoiceOid(otherJobId)}]}, {found:false,code:'OTHER_JOB'});
await run('different client blocked',{invoices:[{...sample,client_id:89}]}, {found:false,code:'WRONG_CLIENT'});
await run('draft blocked',{invoices:[{...sample,status:'draft'}]}, {found:false,code:'NOT_ISSUED_VAT'});
await run('proforma blocked',{invoices:[{...sample,kind:'proforma'}]}, {found:false,code:'NOT_ISSUED_VAT'});
await run('no invoice',{invoices:[]}, {found:false,code:'NOT_FOUND'});
await run('duplicate number',{invoices:[sample,{...sample,id:992}]}, {found:false,code:'DUPLICATE_NUMBER'});
await run('ambiguous client',{clients:[{id:55,external_id:contractorId},{id:56,external_id:contractorId}]}, {found:false,code:'CLIENT_NOT_LINKED'});
await run('foreign external customer',{clients:[{id:55,external_id:'other'}]}, {found:false,code:'CLIENT_NOT_LINKED'});
await run('unfinished job',{status:'W trakcie'}, {http:400,error:/zakończonym/});
await run('worker forbidden',{role:'Pracownik'}, {http:403,error:/administrator/});
await run('auto OID absent',{action:'verify',invoices:[]}, {found:false,code:'OID_NOT_FOUND'});
await run('auto OID accepted',{action:'verify',invoices:[{...sample,oid:buildJobInvoiceOid(jobId)}]}, {found:true,code:'VERIFIED',candidates:0});
await run('auto missing OID suggests one invoice',{action:'verify',invoices:[sample]}, {found:false,code:'OID_MISSING_CANDIDATES',candidates:1});
await run('on-demand verification works without browser client id',{action:'verify',invoices:[sample],suppliedClientId:''}, {found:false,code:'OID_MISSING_CANDIDATES',candidates:1});
await run('forged browser client id blocked',{action:'verify',invoices:[sample],suppliedClientId:'999'}, {found:false,code:'CLIENT_MISMATCH',candidates:0});
await run('auto missing OID suggests choices but does not assign',{action:'verify',invoices:[sample,{...sample,id:992,number:'FV/10/2026/18'}]}, {found:false,code:'OID_MISSING_CANDIDATES',candidates:2});
await run('auto excludes invoice linked to different installation',{action:'verify',invoices:[sample],alreadyLinked:['991']}, {found:false,code:'OID_NOT_FOUND',candidates:0});
await run('auto excludes wrong customer',{action:'verify',invoices:[{...sample,client_id:77}]}, {found:false,code:'OID_NOT_FOUND',candidates:0});
await run('auto excludes unrelated OID',{action:'verify',invoices:[{...sample,oid:buildJobInvoiceOid(otherJobId)}]}, {found:false,code:'OID_NOT_FOUND',candidates:0});
await run('auto excludes draft and proforma',{action:'verify',invoices:[{...sample,kind:'proforma'}, {...sample,id:992,kind:'vat',status:'draft'}]}, {found:false,code:'OID_NOT_FOUND',candidates:0});
await run('auto fails closed on ambiguous client',{action:'verify',invoices:[sample],clients:[{id:55,external_id:contractorId},{id:56,external_id:contractorId}]}, {found:false,code:'OID_NOT_FOUND',candidates:0});
const ui=fs.readFileSync(new URL('../src/components/JobDetailsPanel.jsx',import.meta.url),'utf8');
assert.match(ui,/setInvoiceVerificationMessage\(result\?\.reason/);
assert.match(ui,/onSubmit=\{linkInvoiceByNumber\}/);
assert.match(ui,/!selectedJob\.vat_invoice_fakturownia_confirmed/);
assert.match(ui,/invoiceVerificationCandidates\.map/);
assert.match(ui,/verifyPendingFakturowniaInvoice\(true\)/,'Existing job can be checked without creating new invoice');
assert.match(ui,/onClick=\{\(\) => void confirmInvoiceNumber\(candidate\.invoiceNumber\)\}/);
assert.match(ui,/setInvoiceVerificationCandidates\(Array\.isArray\(result\?\.candidates\)/);
console.log('PASS V12.77 mocked provider integration & UI wiring (no real invoices created)');
