import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
import {
  buildJobInvoiceOid, findIssuedVatInvoiceForJob, inspectManualInvoiceMatch,
  findInvoiceCandidatesForManualConfirmation, inspectInvoiceBuyer, isIssuedVatInvoiceRecord,
} from '../supabase/functions/fakturownia-client/invoice-match.js';

const jobId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const contractorId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const clientId='55';
const now=Date.now();
const invoice=(id,delta=5000,extra={})=>({
  id,number:id+'/10/2026',client_id:55,oid:'',kind:'vat',status:'issued',
  created_at:new Date(now+delta).toISOString(),issue_date:new Date(now).toISOString().slice(0,10),
  buyer_name:'Tadeusz Rudy',buyer_street:'Częstochowska 12/99',buyer_city:'Łazy',
  buyer_post_code:'42-450',buyer_tax_no:'', ...extra,
});
const baseline=invoice(900,-86400000);
const newInvoice=invoice(991,5000);
const source=fs.readFileSync(new URL('../supabase/functions/fakturownia-client/index.ts',import.meta.url),'utf8')
  .replace(/^import \{ createClient \} from "npm:\@supabase\/supabase-js\@[^"]+";?\s*$/m,'')
  .replace(/^import \{ buildJobInvoiceOid, findIssuedVatInvoiceForJob, inspectManualInvoiceMatch, findInvoiceCandidatesForManualConfirmation, isIssuedVatInvoiceRecord \} from "\.\/invoice-match\.js";?\s*$/m,'');
assert(!source.includes('import {'),'Execute exact current Edge source');
const compiled=(await transform(source,{loader:'ts',target:'es2022',format:'iife'})).code;
async function run(label,{after=[newInvoice],competing=false,otherJob=false,wrongBuyer=false,
  expired=false,changedBuyer=false,existingAlready=false,noSavedBaseline=false,withoutOid=true,
  providerMutations=false,companyGus=false,companyWrongNip=false,companyMissingNip=false}={},expected) {
  let handler;
  const recorded=[];
  let manualCandidateDbReads=0;
  let tableAttempt=null;
  let activeInvoices=[baseline];
  const job={id:jobId,contractor_id:contractorId,client:'Tadeusz Rudy',title:'Tadeusz Rudy',
    status:'Zakończone',city:'42-450 Łazy',street:'Częstochowska 12/99 Lazy',
    device_model:'Rotenso',payment_method:'cash',vat_invoice_fakturownia_confirmed:false};
  const contractor={id:contractorId,company_name:'Tadeusz Rudy',city:'42-450 Łazy',
    street:'Częstochowska 12/99 Lazy',nip:null,addresses:[]};
  if (companyGus) {
    job.client='Diamond Sp Z.O.O';
    job.title='Diamond Sp Z.O.O';
    job.city='Krakow';
    job.street='Półanki 62B';
    contractor.company_name='Diamond Sp Z.O.O';
    contractor.city='Krakow';
    contractor.street='Półanki 62B';
    contractor.nip='6762129480';
  }
  function from(table) {
    const q={eqs:{},negs:{}};
    const builder={
      select(){return this;},
      eq(k,v){q.eqs[k]=v;return this;},
      neq(k,v){q.negs[k]=v;return this;},
      gt(){return this;},
      async upsert(value){assert.equal(table,'fakturownia_invoice_attempts');tableAttempt={...value};return {data:value,error:null};},
      async maybeSingle(){
        if(table==='profiles')return {data:{role:'Administrator'},error:null};
        if(table==='contractors')return {data:contractor,error:null};
        if(table==='jobs')return {data:changedBuyer?{...job,street:'Inna 5'}:job,error:null};
        if(table==='fakturownia_invoice_attempts')return {data:tableAttempt,error:null};
        return {data:null,error:null};
      },
      async in(){manualCandidateDbReads++;return {data:existingAlready?[{vat_invoice_fakturownia_invoice_id:'991'}]:[],error:null};},
      async limit(){
        if(table==='fakturownia_invoice_attempts')return {data:competing?[{job_id:'other-job'}]:[],error:null};
        if(table==='jobs'&&q.eqs.vat_invoice_issued===false)return {data:otherJob?[{id:'other-job'}]:[],error:null};
        if(table==='jobs'&&q.eqs.vat_invoice_fakturownia_invoice_id)return {data:existingAlready?[{id:'other-job'}]:[],error:null};
        return {data:[],error:null};
      },
    };
    return builder;
  }
  const env={SUPABASE_URL:'https://supabase.example.test',SUPABASE_ANON_KEY:'anon',
    SUPABASE_SERVICE_ROLE_KEY:'service',FAKTUROWNIA_API_TOKEN:'placeholder'};
  const context={
    buildJobInvoiceOid,findIssuedVatInvoiceForJob,inspectManualInvoiceMatch,
    findInvoiceCandidatesForManualConfirmation,inspectInvoiceBuyer,isIssuedVatInvoiceRecord,
    createClient(_url,key){return key==='anon'?{
      auth:{async getUser(){return {data:{user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}},error:null};}}
    }:{from};},
    Deno:{serve(cb){handler=cb;},env:{get(k){return env[k]||'';}}},
    async fetch(value,opts){
      const u=new URL(String(value));
      const method=opts?.method||'GET';
      recorded.push({path:u.pathname,method});
      if(u.pathname==='/clients.json')return new Response(JSON.stringify([{id:55,external_id:contractorId}]),{status:200});
      if(u.pathname==='/clients/55.json'&&method==='PUT')return new Response(JSON.stringify({id:55}),{status:200});
      if(u.pathname==='/invoices.json'){
        const subset=u.searchParams.has('oid')?activeInvoices.filter(row=>row.oid===u.searchParams.get('oid')):activeInvoices;
        return new Response(JSON.stringify(subset),{status:200});
      }
      if(/^\/invoices\/\d+\.json$/.test(u.pathname)){
        const id=u.pathname.match(/\d+/)[0];
        return new Response(JSON.stringify(activeInvoices.find(row=>String(row.id)===id)),{status:200});
      }
      throw new Error('Unexpected provider path '+u.pathname+' '+method);
    },
    URL,URLSearchParams,Request,Response,Headers,AbortController,DOMException,
    setTimeout,clearTimeout,console,JSON,Array,String,Boolean,Object,Number,Intl,Date,encodeURIComponent,
  };
  vm.runInNewContext(compiled,context,{timeout:3000,filename:'fakturownia-client.ts'});
  async function call(action){
    const res=await handler(new Request('https://edge.example.test/functions/v1/fakturownia-client',{
      method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},
      body:JSON.stringify({action,jobId}),
    }));
    return {status:res.status,...await res.json()};
  }
  if(!noSavedBaseline) {
    const prepare=await call('prepare');
    assert.equal(prepare.status,200,label+': prepare successful');
    assert(prepare.invoiceUrl,label+': Fakturownia URL');
    assert.equal(tableAttempt.client_id,clientId,label+': baseline client');
    assert.deepEqual(Array.from(tableAttempt.baseline_invoice_ids),['900'],label+': persisted pre-invoice snapshot');
    assert.equal((await call('pending')).pending,true,label+': can recover attempt after reload');
    if(expired)tableAttempt.expires_at=new Date(now-1000).toISOString();
  }
  if(changedBuyer) contractor.street='Inna 5';
  activeInvoices=[baseline,...after.map(x=>{
    if(companyGus){
      return {...x,buyer_name:'PRZEDSIĘBIORSTWO PRODUKCYJNO HANDLOWO USŁUGOWE DIAMOND SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
        buyer_street:'Półanki 62B',buyer_city:'Kraków',buyer_post_code:'30-858',
        buyer_tax_no:companyMissingNip?'':companyWrongNip?'6762129472':'6762129480'};
    }
    return wrongBuyer?{...x,buyer_street:'Częstochowska 12/98'}:x;
  })];
  const apiCallsBeforeVerify=recorded.length;
  const result=await call('verify');
  assert.equal(result.status,200,label+': verify endpoint');
  const verifyingCalls=recorded.slice(apiCallsBeforeVerify);
  if(!noSavedBaseline){
    assert.equal(verifyingCalls.filter(r=>r.path==='/clients.json').length,0,
      label+': no redundant external client lookup after prepare snapshot');
  }
  if(expected.found){
    assert.equal(manualCandidateDbReads,0,
      label+': no manual-candidates database scan after automatic match');
    assert.equal(result.candidates.length,0,
      label+': verified invoice does not return manual candidate list');
  }
  assert.equal(result.found,expected.found,label+': found');
  if(expected.code)assert.equal(result.reasonCode,expected.code,label+': reason');
  if(expected.invoiceId)assert.equal(result.invoiceId,expected.invoiceId,label+': invoice id');
  if(expected.candidates!==undefined)assert.equal(result.candidates?.length,expected.candidates,label+': candidates');
  assert.equal(recorded.filter(r=>r.path.startsWith('/invoices')&&r.method!=='GET').length,0,label+': no invoice creation');
  console.log('PASS V12.80 '+label);
}
await run('single newly issued VAT with no OID auto-confirmed',{}, {found:true,code:'VERIFIED',invoiceId:'991'});
await run('GUS company full legal name and postal change => auto-confirm by NIP',{companyGus:true},
  {found:true,code:'VERIFIED',invoiceId:'991',candidates:0});
await run('GUS company changed NIP => fail closed',{companyGus:true,companyWrongNip:true},
  {found:false,code:'NO_MATCHING_BUYER',candidates:0});
await run('GUS company missing invoice NIP => fail closed',{companyGus:true,companyMissingNip:true},
  {found:false,code:'NO_MATCHING_BUYER',candidates:0});
await run('new OID also automatically verified',{after:[invoice(991,5000,{oid:buildJobInvoiceOid(jobId)})]}, {found:true,code:'VERIFIED',invoiceId:'991'});
await run('two new issued invoices => no auto',{after:[newInvoice,invoice(992,6000)]},{found:false,code:'OID_MISSING_CANDIDATES',candidates:3});
await run('other job same client prepared => no auto',{competing:true},{found:false,code:'OID_MISSING_CANDIDATES'});
await run('other incomplete invoice job => no auto',{otherJob:true},{found:false,code:'OID_MISSING_CANDIDATES'});
await run('changed buyer address => no auto',{changedBuyer:true},{found:false,code:'NO_MATCHING_BUYER'});
await run('wrong invoice address => no auto',{wrongBuyer:true},{found:false,code:'OID_MISSING_CANDIDATES'});
await run('expired server attempt => no auto',{expired:true},{found:false,code:'OID_MISSING_CANDIDATES'});
await run('no persisted baseline => no auto',{noSavedBaseline:true},{found:false,code:'OID_MISSING_CANDIDATES'});
await run('invoice existed BEFORE prepare => no auto',{after:[]},{found:false,code:'OID_MISSING_CANDIDATES'});
await run('already linked ID => no auto',{existingAlready:true},{found:false,code:'OID_MISSING_CANDIDATES'});
await run('draft issued later not auto linked',{after:[invoice(992,5000,{status:'draft'})]},{found:false,code:'OID_MISSING_CANDIDATES'});
await run('another job OID not auto linked',{after:[invoice(992,5000,{oid:buildJobInvoiceOid('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')})]},{found:false,code:'OID_MISSING_CANDIDATES'});
await run('missing provider creation timestamp => no auto',{after:[invoice(991,5000,{created_at:''})]},{found:false,code:'OID_MISSING_CANDIDATES'});
const ui=fs.readFileSync(new URL('../src/components/JobDetailsPanel.jsx',import.meta.url),'utf8');
assert.match(ui,/hasPendingFakturowniaInvoice/,'Auto-check persists across reload');
assert.match(ui,/void verifyPendingFakturowniaInvoice\(true\)/,'Focus automatically verifies');
console.log('PASS V12.81: 12.80 safety preserved, zero redundant customer lookup, manual candidate scan skipped on auto success');
