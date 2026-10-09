import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

const raw = fs.readFileSync(new URL('../supabase/functions/fakturownia-client/index.ts',import.meta.url),'utf8');
const src = raw
 .replace(/^import \{ createClient \} from "npm:\@supabase\/supabase-js\@[^"]+";?\s*$/m,'')
 .replace(/^import \{ buildJobInvoiceOid, findIssuedVatInvoiceForJob, inspectManualInvoiceMatch, findInvoiceCandidatesForManualConfirmation, isIssuedVatInvoiceRecord \} from "\.\/invoice-match\.js";?\s*$/m,'');
assert(!src.includes('import {'),'Edge imports must be mocked to execute exact current handler');
const compiled = (await transform(src,{loader:'ts',target:'es2022',format:'iife'})).code;
const jobId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const contractorId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function scenario(label, resolver, expected) {
  let handler;
  const calls=[];
  const job={id:jobId,contractor_id:contractorId,client:'Nowa Spółka',title:'Nowa Spółka',email:'shared@example.test',city:'Zawiercie',street:'Testowa 1',device_model:'Rotenso',payment_method:'cash',status:'Zakończone',vat_invoice_fakturownia_confirmed:false};
  const contractor={id:contractorId,company_name:'Nowa Spółka',nip:'1234567890',email:'shared@example.test',city:'Zawiercie',street:'Testowa 1'};
  const db={
    from(table){
      return {
        select(){return this;},eq(){return this;},
        async upsert(value){return {data:value,error:null};},
        async maybeSingle(){return {data:table==='profiles'?{role:'Administrator'}:table==='jobs'?job:table==='contractors'?contractor:null,error:null};}
      };
    }
  };
  const sandbox={
    createClient(_url,key){
      if(key==='anon')return {auth:{async getUser(){return {data:{user:{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}},error:null};}}};
      return db;
    },
    buildJobInvoiceOid:id=>'WAWIS-JOB-'+id,
    findIssuedVatInvoiceForJob:()=>null,
    inspectManualInvoiceMatch:()=>({ok:false}),
    findInvoiceCandidatesForManualConfirmation:()=>[],
    isIssuedVatInvoiceRecord:()=>true,
    Deno:{serve(fn){handler=fn;},env:{get(name){return ({
      SUPABASE_URL:'https://fake.supabase.test',SUPABASE_ANON_KEY:'anon',
      SUPABASE_SERVICE_ROLE_KEY:'service',FAKTUROWNIA_API_TOKEN:'test-token',
    })[name]||'';}}},
    async fetch(input,opts){
      const url=new URL(String(input));
      calls.push({path:url.pathname,method:opts?.method||'GET',search:url.searchParams.toString(),body:opts?.body});
      const value=resolver(url,opts?.method||'GET');
      return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
    },
    URL,URLSearchParams,Request,Response,Headers,AbortController,DOMException,
    setTimeout,clearTimeout,console,JSON,Array,String,Boolean,Object,Number,Intl,Date,encodeURIComponent,
  };
  vm.runInNewContext(compiled,sandbox,{timeout:3000,filename:'fakturownia-client.ts'});
  assert.equal(typeof handler,'function','Deno.serve must register Edge handler');
  const result=await handler(new Request('https://edge.test/functions/v1/fakturownia-client',{
    method:'POST',headers:{Authorization:'Bearer token','Content-Type':'application/json'},
    body:JSON.stringify({action:'prepare',jobId})
  }));
  const body=await result.json();
  const writes=calls.filter(x=>x.method==='PUT'||x.method==='POST');
  assert.equal(result.status,expected.status,label+': HTTP status');
  assert.equal(writes.length,expected.writes,label+': no unintended Fakturownia PUT/POST');
  if(expected.error)assert.match(String(body.error||''),expected.error,label+': error explanation');
  if(expected.ok)assert.equal(body.ok,true,label+': positive path still works');
  console.log('PASS P0-01',label,'HTTP',result.status,'writes',writes.length);
}
await scenario('shared email belongs to other NIP', (url)=>{
 if(url.searchParams.has('email'))return [{id:17,email:'shared@example.test',tax_no:'9999999999',external_id:'other-client'}];
 return [];
},{status:500,writes:0,error:/e-mail/i});
await scenario('malformed client list',()=>({unexpected:true}),{status:500,writes:0,error:/Nieprawidłowa odpowiedź listy klientów/i});
await scenario('exact external_id approved', (url,method)=>{
 if(method==='PUT')return {id:19};
 if(url.searchParams.has('external_id'))return [{id:19,external_id:contractorId,tax_no:'1234567890'}];
 return [];
},{status:200,writes:1,ok:true});
console.log('PASS CODEX P0-01 — executable Edge Function against mocked provider, no external changes');
