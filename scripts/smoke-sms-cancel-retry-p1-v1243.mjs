import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261005103000_sms_cancel_retry_claim_p1_v1243.sql', import.meta.url), 'utf8');
const retryMigration = fs.readFileSync(new URL('../supabase/migrations/20261003184000_sms_retry_after_undelivered_v1237.sql', import.meta.url), 'utf8');

const cancelLockPos = migration.indexOf('for update;');
const activeClaimPos = migration.indexOf('c.retry_of_log_id = v_log.id');
const errorBranchPos = migration.indexOf("if v_status = 'error' then");
assert.ok(cancelLockPos >= 0);
assert.ok(activeClaimPos > cancelLockPos);
assert.ok(errorBranchPos > activeClaimPos, 'active retry claim must be checked before error -> dismissed');
assert.match(retryMigration, /from public\.sms_log[\s\S]*?where id=p_log_id[\s\S]*?for update;/i);

const db = new PGlite();
await db.exec("create schema private; create schema auth; create role anon; create role authenticated; create role service_role;" +
  "create function auth.role() returns text language sql stable set search_path to '' as $$ select 'service_role'::text $$;" +
  "create table public.devices(id uuid primary key, source_job_id text);" +
  "create table public.sms_log(id uuid primary key, job_id uuid, device_id uuid, status text, reminder_cycle integer, reminder_group_id uuid, provider_message_id text, sent_at timestamptz, delivered_at timestamptz, approved_at timestamptz, approved_by uuid, error_message text);" +
  "create table private.sms_delivery_claims(delivery_key text primary key, claim_id uuid not null unique, claimed_at timestamptz not null default now(), confirmed_at timestamptz, retry_of_log_id uuid, source_log_id uuid, reminder_group_id uuid);");

await db.exec(migration);

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const errorLog = '11111111-1111-4111-8111-111111111111';
const errorGroup = '22222222-2222-4222-8222-222222222222';
const retryClaim = '33333333-3333-4333-8333-333333333333';

await db.exec("insert into public.sms_log(id,status,reminder_cycle,reminder_group_id,provider_message_id,sent_at) values('" + errorLog + "','error',1,'" + errorGroup + "','smsapi-old',now());" +
  "insert into private.sms_delivery_claims(delivery_key,claim_id,retry_of_log_id,reminder_group_id) values('retry-not-sent:" + errorLog + "','" + retryClaim + "','" + errorLog + "','" + errorGroup + "');");

let r = await db.query('select public.cancel_service_sms_log($1,$2) as result', [errorLog, actor]);
assert.equal(r.rows[0].result.ok, false);
assert.equal(r.rows[0].result.reason, 'send_claim_exists');
assert.equal(r.rows[0].result.retry_in_progress, true);
let row = await db.query('select status from public.sms_log where id=$1', [errorLog]);
assert.equal(row.rows[0].status, 'error');

await db.exec("update private.sms_delivery_claims set confirmed_at=now() where claim_id='" + retryClaim + "'");
r = await db.query('select public.cancel_service_sms_log($1,$2) as result', [errorLog, actor]);
assert.equal(r.rows[0].result.ok, true);
assert.equal(r.rows[0].result.dismissed, true);
row = await db.query('select status from public.sms_log where id=$1', [errorLog]);
assert.equal(row.rows[0].status, 'dismissed');

const pendingLog = '44444444-4444-4444-8444-444444444444';
const pendingGroup = '55555555-5555-4555-8555-555555555555';
const groupClaim = '66666666-6666-4666-8666-666666666666';
await db.exec("insert into public.sms_log(id,status,reminder_cycle,reminder_group_id) values('" + pendingLog + "','pending_approval',1,'" + pendingGroup + "');" +
  "insert into private.sms_delivery_claims(delivery_key,claim_id,source_log_id,reminder_group_id) values('group:" + pendingGroup + "','" + groupClaim + "','" + pendingLog + "','" + pendingGroup + "');");

r = await db.query('select public.cancel_service_sms_log($1,$2) as result', [pendingLog, actor]);
assert.equal(r.rows[0].result.ok, false);
assert.equal(r.rows[0].result.reason, 'send_claim_exists');

await db.exec("delete from private.sms_delivery_claims where claim_id='" + groupClaim + "'");
r = await db.query('select public.cancel_service_sms_log($1,$2) as result', [pendingLog, actor]);
assert.equal(r.rows[0].result.ok, true);
assert.equal(r.rows[0].result.cancelled, true);
row = await db.query('select status from public.sms_log where id=$1', [pendingLog]);
assert.equal(row.rows[0].status, 'deleted');

console.log('PASS: SMS P1-01 cancel sees active retry claim');
await db.close();