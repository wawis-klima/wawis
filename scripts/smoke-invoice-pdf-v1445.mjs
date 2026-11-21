// WAWIS 14.45: podgląd PDF potwierdzonej faktury z Fakturowni — tylko administrator, tylko potwierdzona faktura.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { decodeInvoicePdfBase64 } from '../src/modules/fakturownia.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const raw = read('supabase/functions/fakturownia-client/index.ts');
assert.equal((raw.match(/^import /gm) || []).length, 2, 'bez nowych importów w funkcji');
const src = raw
  .replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@[^"]+";?\s*$/m, '')
  .replace(/^import \{[^}]+\} from "\.\/invoice-match\.js";?\s*$/m, '');
const compiled = (await transform(src, { loader: 'ts', target: 'es2022', format: 'iife' })).code;

const JOB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PDF = new TextEncoder().encode('%PDF-1.4\nfaktura\n%%EOF\n');

async function run({ role = 'Administrator', job, pdfBody = PDF, pdfStatus = 200 }) {
  let handler;
  const fetched = [];
  const sandbox = {
    createClient(_url, key) {
      if (key === 'anon') return { auth: { async getUser() { return { data: { user: { id: 'u1' } }, error: null }; } },async rpc(name){return {data:name==='current_user_mfa_ok',error:null};} /* 14.75 MFA */ };
      return { from(table) { return { select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: table === 'profiles' ? { role } : table === 'jobs' ? job : null, error: null }; } }; } };
    },
    buildJobInvoiceOid: (id) => 'WAWIS-JOB-' + id, findIssuedVatInvoiceForJob: () => null,
    inspectManualInvoiceMatch: () => ({ ok: false }), findInvoiceCandidatesForManualConfirmation: () => [],
    isIssuedVatInvoiceRecord: () => true,
    Deno: { serve(fn) { handler = fn; }, env: { get(name) { return ({ SUPABASE_URL: 'https://x.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', FAKTUROWNIA_API_TOKEN: 'tok' })[name]; } } },
    async fetch(url, options) {
      fetched.push({ url: String(url), method: options?.method });
      return new Response(pdfBody, { status: pdfStatus, headers: { 'content-type': 'application/pdf' } });
    },
    Response, URL, URLSearchParams, AbortController, DOMException, setTimeout, clearTimeout, btoa, atob, TextEncoder, Uint8Array, String, JSON, Date, Number, Array, Object, Promise, Error, Set, Math, RegExp, Boolean, console,
  };
  vm.runInNewContext(compiled, sandbox);
  const response = await handler(new Request('https://f.test', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ action: 'invoice_pdf', jobId: JOB }) }));
  return { status: response.status, body: await response.json(), fetched };
}

const confirmed = { id: JOB, vat_invoice_fakturownia_confirmed: true, vat_invoice_fakturownia_invoice_id: '584755572', vat_invoice_fakturownia_invoice_number: '22/11/2026' };

let r = await run({ job: confirmed });
assert.equal(r.status, 200);
assert.equal(r.body.fileName, 'faktura-22-11-2026.pdf');
assert.equal(r.body.invoiceNumber, '22/11/2026');
assert.equal(Buffer.from(r.body.pdfBase64, 'base64').toString('latin1').slice(0, 5), '%PDF-');
assert.equal(r.fetched.length, 1);
assert.match(r.fetched[0].url, /^https:\/\/wawis\.fakturownia\.pl\/invoices\/584755572\.pdf\?api_token=tok$/);
assert.equal(r.fetched[0].method, 'GET', 'tylko odczyt z Fakturowni');

r = await run({ role: 'Pracownik', job: confirmed });
assert.equal(r.status, 403, 'pracownik nie pobiera faktury');
assert.equal(r.fetched.length, 0);

r = await run({ job: { ...confirmed, vat_invoice_fakturownia_confirmed: false } });
assert.equal(r.status, 409, 'niepotwierdzona faktura');
assert.equal(r.fetched.length, 0);

r = await run({ job: { ...confirmed, vat_invoice_fakturownia_invoice_id: '../clients/1' } });
assert.equal(r.status, 409, 'tylko liczbowe ID faktury');
assert.equal(r.fetched.length, 0);

r = await run({ job: confirmed, pdfBody: new TextEncoder().encode('<html>login</html>') });
assert.equal(r.status, 500);
assert.match(r.body.error, /nie zwróciła pliku PDF/);

r = await run({ job: confirmed, pdfStatus: 404, pdfBody: 'x' });
assert.match(r.body.error, /nie znalazła tej faktury/);

// Frontend: dekodowanie i karta tylko dla administratora z potwierdzoną fakturą.
const blob = decodeInvoicePdfBase64(Buffer.from(PDF).toString('base64'));
assert.equal(blob.type, 'application/pdf');
assert.equal(blob.size, PDF.length);
assert.throws(() => decodeInvoicePdfBase64(Buffer.from('<html>').toString('base64')), /PDF/);
assert.throws(() => decodeInvoicePdfBase64(''), /PDF/);

const panel = read('src/components/JobDetailsPanel.jsx');
assert.match(panel, /\{isAdmin && isCompletedJob && selectedJob\.vat_invoice_fakturownia_confirmed && selectedJob\.vat_invoice_fakturownia_invoice_id \? <DesktopJobInvoiceCard/);
console.log('PASS WAWIS 14.45 — podgląd faktury PDF z Fakturowni tylko dla administratora.');
