import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const p0 = fs.readFileSync(
  new URL('../supabase/migrations/20261005094500_sms_p0_race_safety_v1242.sql', import.meta.url),
  'utf8',
);
const n01 = fs.readFileSync(
  new URL('../supabase/migrations/20261005150842_sms_callback_snapshot_integrity_v1250.sql', import.meta.url),
  'utf8',
);

assert.match(n01, /claim_not_staged/i);
assert.match(n01, /message=coalesce\(nullif\(c\.message,''\),message\)/i);
assert.match(n01, /phone=coalesce\(c\.recipient_phone,phone\)/i);
assert.match(n01, /client=coalesce\(c\.client,client\)/i);
assert.match(n01, /status='provider_sent'/i);

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

await db.exec(p0);
await db.exec(n01);
await db.exec(
  'create trigger trg_protect_sms_log_history before update or delete on public.sms_log for each row execute function public.protect_sms_log_history();',
);

for (const status of ['provider_sent', 'error', 'delivered']) {
  const jobId = randomUUID();
  const logId = randomUUID();
  const claimId = randomUUID();
  const groupId = randomUUID();
  const deviceId = randomUUID();
  const actorId = randomUUID();
  const providerId = `n01-${status}-${randomUUID()}`;

  await db.query(
    'insert into public.jobs(id,last_sms_status) values($1,$2)',
    [jobId, 'pending_approval'],
  );
  await db.query(
    `insert into public.sms_log(
      id,job_id,client,phone,message,status,reminder_group_id,reminder_group_primary,reminder_cycle,reminder_due_date
    ) values($1,$2,$3,$4,$5,$6,$7,true,1,$8)`,
    [logId, jobId, 'QUEUE CLIENT', '48501999999', 'QUEUE CONTENT', 'pending_approval', groupId, '2026-10-05'],
  );
  await db.query(
    `insert into private.sms_delivery_claims(
      delivery_key,claim_id,reminder_group_id,source_log_id,job_id,device_id,recipient_phone,
      reminder_cycle,reminder_due_date,client,message,approved_by,staged_at
    ) values($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,now())`,
    [
      `n01:${claimId}`,
      claimId,
      groupId,
      logId,
      jobId,
      deviceId,
      '48501111111',
      '2026-10-05',
      'ACTUAL CLIENT',
      'ACTUAL SENT CONTENT',
      actorId,
    ],
  );

  // Dokładny N-01: po stage generator może zmienić jeszcze pending log,
  // a callback przychodzi przed HTTP acceptance.
  await db.query(
    'update public.sms_log set client=$2,phone=$3,message=$4 where id=$1',
    [logId, 'Changed', '48501999999', 'NEW GENERATOR TEXT'],
  );

  let result = await db.query(
    'select public.apply_sms_delivery_atomic_v2($1,$2,$3,$4) as result',
    [providerId, claimId, status, status === 'error' ? 'N01 TEST ERROR' : null],
  );
  assert.equal(result.rows[0].result.ok, true);

  let rows = await db.query(
    `select job_id,device_id,client,phone,message,status,provider_message_id,
            reminder_cycle,reminder_due_date,reminder_group_id
       from public.sms_log where id=$1`,
    [logId],
  );
  const row = rows.rows[0];
  assert.equal(row.job_id, jobId);
  assert.equal(row.device_id, deviceId);
  assert.equal(row.client, 'ACTUAL CLIENT');
  assert.equal(row.phone, '48501111111');
  assert.equal(row.message, 'ACTUAL SENT CONTENT');
  assert.equal(row.status, status);
  assert.equal(row.provider_message_id, providerId);
  assert.equal(row.reminder_cycle, 1);
  assert.equal(String(row.reminder_due_date).slice(0, 10), '2026-10-05');
  assert.equal(row.reminder_group_id, groupId);

  result = await db.query(
    'select public.record_service_sms_acceptance($1,$2,$3::jsonb) as result',
    [claimId, providerId, '{"accepted":true}'],
  );
  assert.equal(result.rows[0].result.ok, true);
  assert.equal(result.rows[0].result.status, status);

  rows = await db.query(
    'select client,phone,message,status from public.sms_log where id=$1',
    [logId],
  );
  assert.equal(rows.rows[0].client, 'ACTUAL CLIENT');
  assert.equal(rows.rows[0].phone, '48501111111');
  assert.equal(rows.rows[0].message, 'ACTUAL SENT CONTENT');
  assert.equal(rows.rows[0].status, status);

  result = await db.query(
    'select public.apply_sms_delivery_atomic_v2($1,$2,$3,$4) as result',
    [providerId, claimId, status, status === 'error' ? 'N01 TEST ERROR' : null],
  );
  assert.equal(result.rows[0].result.ok, true);

  rows = await db.query(
    'select count(*)::int as n from public.sms_log where provider_message_id=$1',
    [providerId],
  );
  assert.equal(rows.rows[0].n, 1);
}

// Callback nie może nadać provider proof claimowi, którego sender nie zdążył staged.
{
  const logId = randomUUID();
  const claimId = randomUUID();
  const groupId = randomUUID();
  const providerId = `n01-unstaged-${randomUUID()}`;

  await db.query(
    `insert into public.sms_log(
      id,client,phone,message,status,reminder_group_id,reminder_group_primary,reminder_cycle,reminder_due_date
    ) values($1,$2,$3,$4,'pending_approval',$5,true,1,$6)`,
    [logId, 'QUEUE CLIENT', '48501999999', 'QUEUE CONTENT', groupId, '2026-10-05'],
  );
  await db.query(
    `insert into private.sms_delivery_claims(
      delivery_key,claim_id,reminder_group_id,source_log_id,recipient_phone,
      reminder_cycle,reminder_due_date,client
    ) values($1,$2,$3,$4,$5,1,$6,$7)`,
    [`n01-unstaged:${claimId}`, claimId, groupId, logId, '48501111111', '2026-10-05', 'ACTUAL CLIENT'],
  );

  const result = await db.query(
    "select public.apply_sms_delivery_atomic_v2($1,$2,'delivered',null) as result",
    [providerId, claimId],
  );
  assert.equal(result.rows[0].result.ok, false);
  assert.equal(result.rows[0].result.error, 'claim_not_staged');

  const rows = await db.query(
    `select l.provider_message_id,l.sent_at,c.provider_message_id as claim_provider_message_id,c.confirmed_at
       from public.sms_log l
       join private.sms_delivery_claims c on c.source_log_id=l.id
      where l.id=$1`,
    [logId],
  );
  assert.equal(rows.rows[0].provider_message_id, null);
  assert.equal(rows.rows[0].sent_at, null);
  assert.equal(rows.rows[0].claim_provider_message_id, null);
  assert.equal(rows.rows[0].confirmed_at, null);
}

console.log('PASS: SMS N-01 callback-first staged snapshot integrity');
await db.close();
