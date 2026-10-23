import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { inspectManualInvoiceMatch, buildJobInvoiceOid, isIssuedVatInvoiceRecord } from '../supabase/functions/fakturownia-client/invoice-match.js';

const raw = fs.readFileSync(new URL('../supabase/functions/fakturownia-client/index.ts', import.meta.url), 'utf8');
const source = raw.replace(/^import .*?;\s*$/gm, '');
assert(!source.includes('import {'), 'Test must execute current actual handler');
const code = (await transform(source, { loader: 'ts', target: 'es2022', format: 'iife' })).code;
const jobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const contractorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const invoiceId = '584755572', clientId = '244158245';
const normalInvoice = {
  id: invoiceId, number: '31/10/2026', status: 'issued', kind: 'vat',
  client_id: clientId, oid: '', buyer_name: 'MADEX D&E SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
  buyer_tax_no: '6492304280', buyer_city: 'Zawiercie', buyer_post_code: '42-400',
  buyer_street: 'Obrońców Poczty Gdańskiej 95',
};
async function scenario(label, body, overrides, expected) {
  let handler;
  const calls = [];
  const job = { id: jobId, contractor_id: contractorId,
    client: normalInvoice.buyer_name, status: 'Zakończone', city: '42-400 Zawiercie',
    street: normalInvoice.buyer_street, vat_invoice_fakturownia_confirmed: false };
  const contractor = { id: contractorId, company_name: normalInvoice.buyer_name, nip: normalInvoice.buyer_tax_no,
    city: '42-400 Zawiercie', street: normalInvoice.buyer_street };
  const db = { from(table) {
    return { select() { return this; }, eq() { return this; }, limit() { return this; },
      async maybeSingle() {return { data: table === 'profiles' ? { role: 'Administrator' }
        : table === 'jobs' ? job : table === 'contractors' ? contractor
        : table === 'fakturownia_invoice_attempts' ? { client_id: clientId }
        : null, error: null };} };
  } };
  const sandbox = { createClient(_url,key) {
    return key==='anon' ? {auth:{async getUser(){return {data:{user:{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}},error:null};}}} : db;
  },
  buildJobInvoiceOid, findIssuedVatInvoiceForJob:()=>null, inspectManualInvoiceMatch,
  findInvoiceCandidatesForManualConfirmation:()=>[], isIssuedVatInvoiceRecord,
  Deno:{serve(fn){handler=fn;},env:{get(n){return ({
    SUPABASE_URL:'https://fake.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',FAKTUROWNIA_API_TOKEN:'secret'
  })[n]||'';}}},
  async fetch(input,opts){const url=new URL(String(input));calls.push({path:url.pathname,method:opts.method,params:url.searchParams.toString()});
    if(url.pathname.includes('/invoices/')&&url.pathname.endsWith('.json')) {
      return new Response(JSON.stringify({...normalInvoice,...overrides}),{status:200});
    }
    return new Response(JSON.stringify([]),{status:200});
  },URL, URLSearchParams,Request,Response,Headers,AbortController,DOMException,
  setTimeout,clearTimeout,console,JSON,Array,String,Boolean,Object,Number,Intl,Date,encodeURIComponent };
  vm.runInNewContext(code,sandbox,{timeout:3000,filename:'fakturownia-client.ts'});
  const request=new Request('https://edge.example.test',{method:'POST',headers:{Authorization:'Bearer mock'},
    body:JSON.stringify({jobId, action:'link_by_number', ...body})});
  const resp=await handler(request);const data=await resp.json();
  assert.equal(Boolean(data.found),expected,label+': unexpected acceptance: '+JSON.stringify(data));
  if(expected){assert.equal(data.invoiceId,invoiceId);assert.equal(data.invoiceNumber,'31/10/2026');}
  assert.equal(calls.filter(x=>x.method!=='GET').length,0,label+': no writes in lookup');
  return {data,calls};
}
const positive=await scenario('Exact ID succeeds',{invoiceNumber:'ID:584755572'},{},true);
assert.deepEqual(positive.calls.map(x=>x.path),['/invoices/584755572.json']);
const wrongNip=await scenario('Wrong NIP rejected',{invoiceNumber:'ID:584755572'},{buyer_tax_no:'1234567890'},false);
assert.equal(wrongNip.data.reasonCode,'BUYER_TAX_MISMATCH');
const wrongClient=await scenario('Wrong client rejected',{invoiceNumber:'ID:584755572'},{client_id:'888'},false);
assert.equal(wrongClient.data.reasonCode,'WRONG_CLIENT');
const foreignOid=await scenario('Other job OID rejected',{invoiceNumber:'ID:584755572'},{oid:'WAWIS-JOB-ffffffff-ffff-4fff-8fff-ffffffffffff'},false);
assert.equal(foreignOid.data.reasonCode,'OTHER_JOB');
const wrongStatus=await scenario('Draft rejected',{invoiceNumber:'ID:584755572'},{status:'draft'},false);
assert.equal(wrongStatus.data.reasonCode,'NOT_ISSUED_VAT');
const byNumber=await scenario('Unrelated printed invoice number not accepted',{invoiceNumber:'31/10/2026'},{},false);
assert.equal(byNumber.data.reasonCode,'NOT_FOUND');
console.log('OK: v13.53 direct Fakturownia ID GET, strict NIP/client/OID/status and unchanged existing number search.');
