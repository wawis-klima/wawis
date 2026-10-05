import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261005094500_sms_p0_race_safety_v1242.sql', import.meta.url), 'utf8');
const generator = fs.readFileSync(new URL('../supabase/functions/generate-service-sms-queue/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

assert.match(migration, /uq_sms_delivery_claims_active_group/i);
assert.match(migration, /uq_sms_log_provider_message_id/i);
assert.match(migration, /Snapshot wysłanego SMS nie może zostać zmieniony/i);
const guards = generator.match(/\.in\("status", \["pending_approval", "not_sent", "error"\]\)[\s\S]{0,500}?\.is\("provider_message_id", null\)[\s\S]{0,250}?\.is\("sent_at", null\)[\s\S]{0,250}?\.is\("delivered_at", null\)[\s\S]{0,180}?\.select\("id"\)/g) || [];
assert.ok(guards.length >= 3);

const db = new PGlite();
await db.exec(
  "create schema private; create schema auth; create role anon; create role authenticated; create role service_role;" +
  "create sequence private.test_uuid_seq;" +
  "create function private.test_uuid() returns uuid language sql volatile set search_path to '' as $$ select ('00000000-0000-4000-8000-' || lpad(nextval('private.test_uuid_seq')::text,12,'0'))::uuid $$;" +
  "create function auth.jwt() returns jsonb language sql stable set search_path to '' as $$ select '{\"role\":\"service_role\"}'::jsonb $$;" +
  "create function private.sms_delivery_rank(p_status text) returns integer language sql immutable set search_path to '' as $$ select case lower(coalesce(p_status,'')) when 'provider_sent' then 1 when 'sent' then 1 when 'error' then 2 when 'delivered' then 3 when 'deleted' then 4 else 0 end $$;" +
  "create table public.jobs(id uuid primary key,last_sms_log_id uuid,last_sms_sent_at timestamptz,last_sms_status text,last_sms_error text,sms_recipient_phone text);" +
  "create table public.sms_log(id uuid primary key default private.test_uuid(),job_id uuid,device_id uuid,client text,phone text not null default '',message text not null default '',sms_type text not null default 'service_reminder',provider text not null default 'smsapi',provider_message_id text,provider_response jsonb,status text not null default 'pending_approval',planned_for timestamptz,approved_at timestamptz,approved_by uuid,sent_at timestamptz,delivered_at timestamptz,created_by uuid,reminder_cycle integer,reminder_due_date date,reminder_group_id uuid,reminder_group_primary boolean not null default false,retry_of_log_id uuid,error_message text,created_at timestamptz not null default now());" +
  "create table private.sms_delivery_claims(delivery_key text primary key,claim_id uuid not null unique,claimed_at timestamptz not null default now(),provider_message_id text,confirmed_at timestamptz,reminder_group_id uuid,source_log_id uuid,job_id uuid,device_id uuid,recipient_phone text,reminder_cycle integer,reminder_due_date date,client text,message text,approved_by uuid,staged_at timestamptz,last_error text,uncertain_at timestamptz,retry_of_log_id uuid);"
);

await db.exec(migration);
await db.exec("create trigger trg_protect_sms_log_history before update or delete on public.sms_log for each row execute function public.protect_sms_log_history();");

const group = '10000000-0000-4000-8000-000000000001';
const claimA = '20000000-0000-4000-8000-000000000001';
const claimB = '20000000-0000-4000-8000-000000000002';
await db.exec("insert into private.sms_delivery_claims(delivery_key,claim_id,reminder_group_id) values('group:a','" + claimA + "','" + group + "')");
await assert.rejects(
  db.exec("insert into private.sms_delivery_claims(delivery_key,claim_id,reminder_group_id) values('retry:b','" + claimB + "','" + group + "')"),
  /duplicate|unique/i
);
await db.exec("update private.sms_delivery_claims set confirmed_at=now() where claim_id='" + claimA + "'");
await db.exec("insert into private.sms_delivery_claims(delivery_key,claim_id,reminder_group_id) values('retry:b','" + claimB + "','" + group + "')");

const job = '30000000-0000-4000-8000-000000000001';
const original = '40000000-0000-4000-8000-000000000001';
const retryClaim = '50000000-0000-4000-8000-000000000001';
const retryGroup = '60000000-0000-4000-8000-000000000001';
const provider = 'provider-p0-1';

await db.exec("insert into public.jobs(id,last_sms_status) values('" + job + "','provider_sent')");
await db.exec("insert into public.sms_log(id,job_id,client,phone,message,status,reminder_group_id,reminder_group_primary,reminder_cycle,reminder_due_date) values('" + original + "','" + job + "','Klient','48600100100','stara','error','" + retryGroup + "',true,1,'2026-10-01')");
await db.exec("insert into private.sms_delivery_claims(delivery_key,claim_id,reminder_group_id,retry_of_log_id,job_id,recipient_phone,reminder_cycle,reminder_due_date,client,message,approved_by,staged_at) values('retry:p0','" + retryClaim + "','" + retryGroup + "','" + original + "','" + job + "','48600100100',1,'2026-10-01','Klient','wiadomosc','70000000-0000-4000-8000-000000000001',now())");

let result = await db.query("select public.apply_sms_delivery_atomic_v2($1,$2,'delivered',null) as result",[provider,retryClaim]);
assert.equal(result.rows[0].result.ok,true);
result = await db.query("select public.record_service_sms_acceptance($1,$2,$3::jsonb) as result",[retryClaim,provider,'{"accepted":true}']);
assert.equal(result.rows[0].result.ok,true);
assert.equal(result.rows[0].result.status,'delivered');

let rows = await db.query("select id,status from public.sms_log where provider_message_id=$1",[provider]);
assert.equal(rows.rows.length,1);
assert.equal(rows.rows[0].status,'delivered');
const deliveredLog = rows.rows[0].id;

result = await db.query("select public.record_service_sms_acceptance($1,$2,$3::jsonb) as result",[retryClaim,provider,'{"accepted_again":true}']);
assert.equal(result.rows[0].result.status,'delivered');
result = await db.query("select public.apply_sms_delivery_atomic_v2($1,$2,'delivered',null) as result",[provider,retryClaim]);
assert.equal(result.rows[0].result.ok,true);
rows = await db.query("select count(*)::int as n,min(status) as status from public.sms_log where provider_message_id=$1",[provider]);
assert.equal(rows.rows[0].n,1);
assert.equal(rows.rows[0].status,'delivered');

await assert.rejects(
  db.exec("insert into public.sms_log(phone,message,status,provider_message_id) values('48111111111','dup','provider_sent','" + provider + "')"),
  /duplicate|unique/i
);
await assert.rejects(
  db.exec("update public.sms_log set phone='48999999999' where id='" + deliveredLog + "'"),
  /Snapshot wysłanego SMS/i
);
await assert.rejects(
  db.exec("update public.sms_log set status='pending_approval' where id='" + deliveredLog + "'"),
  /nie może wrócić do kolejki|Status doręczenia SMS nie może zostać cofnięty/i
);
await db.exec("update public.sms_log set provider_response='{\"late\":true}'::jsonb where id='" + deliveredLog + "'");

const jobStatus = await db.query("select last_sms_status from public.jobs where id=$1",[job]);
assert.equal(jobStatus.rows[0].last_sms_status,'delivered');

// Callback UNDELIVERED/error przed acceptance również musi pozostać końcowym błędem
// i nie może utworzyć drugiego wpisu historii.
const originalError = '40000000-0000-4000-8000-000000000002';
const errorClaim = '50000000-0000-4000-8000-000000000002';
const errorGroup = '60000000-0000-4000-8000-000000000002';
const errorProvider = 'provider-p0-error';

await db.exec("insert into public.sms_log(id,job_id,client,phone,message,status,reminder_group_id,reminder_group_primary,reminder_cycle,reminder_due_date) values('" + originalError + "','" + job + "','Klient 2','48600100101','stara','error','" + errorGroup + "',true,1,'2026-10-01')");
await db.exec("insert into private.sms_delivery_claims(delivery_key,claim_id,reminder_group_id,retry_of_log_id,job_id,recipient_phone,reminder_cycle,reminder_due_date,client,message,approved_by,staged_at) values('retry:p0:error','" + errorClaim + "','" + errorGroup + "','" + originalError + "','" + job + "','48600100101',1,'2026-10-01','Klient 2','wiadomosc 2','70000000-0000-4000-8000-000000000001',now())");

result = await db.query("select public.apply_sms_delivery_atomic_v2($1,$2,'error',$3) as result",[errorProvider,errorClaim,'SMSAPI: wiadomość niedostarczona (kod 405).']);
assert.equal(result.rows[0].result.ok,true);
result = await db.query("select public.record_service_sms_acceptance($1,$2,$3::jsonb) as result",[errorClaim,errorProvider,'{"accepted":true}']);
assert.equal(result.rows[0].result.ok,true);
assert.equal(result.rows[0].result.status,'error');

rows = await db.query("select count(*)::int as n,min(status) as status from public.sms_log where provider_message_id=$1",[errorProvider]);
assert.equal(rows.rows[0].n,1);
assert.equal(rows.rows[0].status,'error');

console.log('PASS: SMS P0 race safety');
await db.close();
