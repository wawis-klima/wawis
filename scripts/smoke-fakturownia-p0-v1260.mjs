import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  buildJobInvoiceOid,
  findIssuedVatInvoiceForJob,
} from '../supabase/functions/fakturownia-client/invoice-match.js';

const root = path.resolve(import.meta.dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/current/20261007044000_fakturownia_p0_v1260.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

const jobA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const jobB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clientId = '7';

assert.equal(buildJobInvoiceOid(jobA), `WAWIS-JOB-${jobA}`);
const invoiceB = { id: 900, oid: buildJobInvoiceOid(jobB), client_id: 7, kind: 'vat', status: 'issued' };
const invoiceA = { id: 901, oid: buildJobInvoiceOid(jobA), client_id: 7, kind: 'vat', status: 'paid' };
assert.equal(findIssuedVatInvoiceForJob([invoiceB], { jobId: jobA, clientId }), null, 'Faktura B nie może potwierdzić montażu A.');
assert.equal(findIssuedVatInvoiceForJob([invoiceB, invoiceA], { jobId: jobA, clientId })?.id, 901, 'Montaż A ma znaleźć wyłącznie fakturę ze swoim OID.');
assert.equal(findIssuedVatInvoiceForJob([invoiceA], { jobId: jobA, clientId: '8' }), null, 'OID nie wystarcza przy innym kliencie.');

const db = new PGlite();
await db.exec(`
  create schema auth;
  create schema private;
  create role authenticated;

  create table public.profiles(id uuid primary key, role text not null);

  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
  $$;

  create or replace function public.current_user_is_admin()
  returns boolean language sql security definer set search_path=public,pg_temp as $$
    select exists(select 1 from public.profiles where id=auth.uid() and role='Administrator')
  $$;

  create table public.jobs(
    id uuid primary key,
    created_by uuid,
    main_technician_id uuid,
    admin_note text default '',
    status text default 'Nowe',
    sms_consent boolean,
    sms_reminder_enabled boolean,
    completed_at timestamptz,
    completed_by uuid,
    payment_confirmation_enabled boolean,
    payment_amount numeric,
    payment_kind text,
    payment_method text,
    payment_paid_at timestamptz,
    payment_recorded_by uuid,
    payment_updated_at timestamptz,
    vat_invoice_issued boolean not null default false,
    vat_invoice_fakturownia_confirmed boolean not null default false,
    vat_invoice_fakturownia_invoice_id text,
    vat_invoice_fakturownia_invoice_number text,
    vat_invoice_fakturownia_confirmed_at timestamptz
  );

  grant select, insert, update on public.jobs to authenticated;
  grant execute on function public.current_user_is_admin() to authenticated;

  insert into public.profiles(id, role) values
    ('11111111-1111-4111-8111-111111111111', 'Pracownik'),
    ('22222222-2222-4222-8222-222222222222', 'Administrator');
`);
await db.exec(migration);
await db.exec(`
  create trigger protect_job_fields
  before insert or update on public.jobs
  for each row execute function private.guard_job_fields();
`);

await db.exec("set role authenticated");
await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
await db.query("select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");
await db.exec(`insert into public.jobs(id,status) values ('${jobA}','Nowe'), ('${jobB}','Nowe')`);

async function expectSqlState(sql, code, label) {
  let caught = null;
  try { await db.exec(sql); } catch (error) { caught = error; }
  assert.ok(caught, label);
  assert.equal(caught.code, code, `${label}: oczekiwano SQLSTATE ${code}, otrzymano ${caught?.code}`);
}

await expectSqlState(
  `update public.jobs set vat_invoice_issued=true where id='${jobA}'`,
  '42501',
  'Pracownik nie może bezpośrednio oznaczyć faktury jako wystawionej.',
);
await expectSqlState(
  `update public.jobs set vat_invoice_fakturownia_confirmed=true, vat_invoice_fakturownia_invoice_id='FORGED' where id='${jobA}'`,
  '42501',
  'Pracownik nie może sfałszować potwierdzenia Fakturowni.',
);

await db.query("select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)");
const confirmed = await db.query(`select public.admin_confirm_job_vat_invoice_fakturownia('${jobA}','900','FV/900') as result`);
assert.equal(confirmed.rows[0].result.vat_invoice_fakturownia_invoice_id, '900');

await expectSqlState(
  `select public.admin_confirm_job_vat_invoice_fakturownia('${jobB}','900','FV/900')`,
  '23505',
  'Jedna faktura Fakturowni nie może zostać przypisana do dwóch montaży.',
);

console.log('OK: v12.60 P0 — worker nie zmienia pól faktury, a Fakturownia wiąże fakturę z konkretnym jobId.');
