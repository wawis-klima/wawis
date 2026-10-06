import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20261006054129_sms_retry_chain_attempt_pointer_v1257.sql', import.meta.url),
  'utf8',
);

const db = new PGlite();

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema private;

  create sequence private.test_uuid_seq start with 1000;
  create function private.test_uuid()
  returns uuid
  language sql
  volatile
  set search_path to ''
  as $$ select ('f1570000-0000-4000-8000-' || lpad(nextval('private.test_uuid_seq')::text,12,'0'))::uuid $$;

  create function auth.jwt()
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $$ select '{"role":"service_role"}'::jsonb $$;

  create function private.normalize_sms_phone(p_phone text)
  returns text
  language sql
  immutable
  set search_path to ''
  as $$ select nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'') $$;

  create function private.sms_source_job_uuid(p_value text)
  returns uuid
  language plpgsql
  immutable
  set search_path to ''
  as $$
  declare v text := split_part(trim(coalesce(p_value,'')),'::',1);
  begin
    if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return v::uuid;
    end if;
    return null;
  end
  $$;

  create function private.service_sms_due_date(p_date date,p_cycle integer)
  returns date
  language sql
  immutable
  set search_path to ''
  as $$ select (p_date + ((11 + ((p_cycle - 1) * 12))::text || ' months')::interval)::date $$;

  create function private.sms_delivery_rank(p_status text)
  returns integer
  language sql
  immutable
  set search_path to ''
  as $$
    select case lower(coalesce(p_status,''))
      when 'provider_sent' then 1
      when 'sent' then 1
      when 'error' then 2
      when 'delivered' then 3
      when 'deleted' then 4
      else 0
    end
  $$;

  create function private.sms_log_is_retryable_failure(
    p_status text,
    p_provider_message_id text,
    p_sent_at timestamptz,
    p_delivered_at timestamptz
  )
  returns boolean
  language sql
  immutable
  set search_path to ''
  as $$
    select case lower(btrim(coalesce(p_status,'')))
      when 'not_sent' then
        p_provider_message_id is null and p_sent_at is null and p_delivered_at is null
      when 'error' then
        p_delivered_at is null
        and (
          nullif(btrim(coalesce(p_provider_message_id,'')),'') is not null
          or p_sent_at is null
        )
      else false
    end
  $$;

  create table public.contractors(
    id uuid primary key,
    company_name text,
    contact_person text,
    phone text
  );

  create table public.jobs(
    id uuid primary key,
    title text,
    client text,
    phone text,
    sms_recipient_phone text,
    installation_date date,
    sms_consent boolean not null default true,
    sms_reminder_enabled boolean not null default true,
    service_reminder_years integer not null default 5,
    contractor_id uuid,
    last_sms_log_id uuid,
    last_sms_sent_at timestamptz,
    last_sms_status text,
    last_sms_error text
  );

  create table public.devices(
    id uuid primary key,
    contractor_id uuid,
    source_job_id text,
    installation_date date,
    service_reminder_years integer not null default 5,
    sms_consent boolean not null default true,
    sms_reminder_enabled boolean not null default true
  );

  create table public.sms_log(
    id uuid primary key default private.test_uuid(),
    job_id uuid,
    device_id uuid,
    client text,
    phone text not null,
    message text not null,
    sms_type text not null default 'service_reminder',
    provider text not null default 'smsapi',
    provider_message_id text,
    provider_response jsonb,
    status text not null default 'queued',
    planned_for timestamptz,
    approved_at timestamptz,
    approved_by uuid,
    sent_at timestamptz,
    delivered_at timestamptz,
    created_by uuid,
    reminder_cycle integer,
    reminder_due_date date,
    reminder_group_id uuid,
    reminder_group_primary boolean not null default false,
    retry_of_log_id uuid,
    error_message text,
    created_at timestamptz not null default now()
  );

  create table private.sms_delivery_claims(
    delivery_key text primary key,
    claim_id uuid not null unique default private.test_uuid(),
    claimed_at timestamptz not null default now(),
    provider_message_id text,
    confirmed_at timestamptz,
    reminder_group_id uuid,
    source_log_id uuid,
    job_id uuid,
    device_id uuid,
    recipient_phone text,
    reminder_cycle integer,
    reminder_due_date date,
    client text,
    message text,
    approved_by uuid,
    staged_at timestamptz,
    last_error text,
    uncertain_at timestamptz,
    retry_of_log_id uuid
  );

  create unique index uq_sms_delivery_claims_active_group
    on private.sms_delivery_claims(reminder_group_id)
    where reminder_group_id is not null and confirmed_at is null;

  create or replace function private.ensure_sms_reminder_group_for_member(
    p_phone text,p_due_date date,p_device_id uuid,p_job_id uuid
  )
  returns uuid
  language sql
  stable
  security definer
  set search_path to ''
  as $$ select 'f1570000-0000-4000-8000-000000000099'::uuid $$;
`);

await db.exec(migration);

const job = 'f1570000-0000-4000-8000-000000000001';
const a = 'f1570000-0000-4000-8000-000000000002';
const group = 'f1570000-0000-4000-8000-000000000099';

await db.exec(`
  insert into public.jobs(
    id,title,client,phone,sms_recipient_phone,installation_date,
    sms_consent,sms_reminder_enabled,service_reminder_years
  ) values(
    '${job}','CLOSURE TEST','CLOSURE TEST','48600157157','48600157157','2025-10-06',
    true,true,5
  );

  insert into public.sms_log(
    id,job_id,client,phone,message,status,provider_message_id,sent_at,
    reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary,error_message
  ) values(
    '${a}','${job}','CLOSURE TEST','48600157157','attempt A','error','closure-provider-a',
    now()-interval '2 minutes',1,'2026-09-06','${group}',true,'A failed'
  );
`);

let result = await db.query(
  'select public.claim_service_sms_not_sent_retry($1) as result',
  [a],
);
assert.equal(result.rows[0].result.ok,true,'A error must allow retry B');
const claimB = result.rows[0].result.claim_id;

await db.query(
  "update private.sms_delivery_claims set message='attempt B',staged_at=now()-interval '1 minute' where claim_id=$1",
  [claimB],
);

result = await db.query(
  "select public.record_service_sms_acceptance($1,'closure-provider-b','{\"accepted\":true}'::jsonb) as result",
  [claimB],
);
assert.equal(result.rows[0].result.ok,true);
const b = result.rows[0].result.log_id;

let jobState = await db.query(
  'select last_sms_log_id::text as log_id,last_sms_status from public.jobs where id=$1',
  [job],
);
assert.equal(jobState.rows[0].log_id,b);
assert.equal(jobState.rows[0].last_sms_status,'provider_sent');

result = await db.query(
  "select public.apply_sms_delivery_atomic_v2('closure-provider-b',$1,'error','B failed') as result",
  [claimB],
);
assert.equal(result.rows[0].result.ok,true);

jobState = await db.query(
  'select last_sms_log_id::text as log_id,last_sms_status from public.jobs where id=$1',
  [job],
);
assert.equal(jobState.rows[0].log_id,b);
assert.equal(jobState.rows[0].last_sms_status,'error');

result = await db.query(
  'select public.claim_service_sms_not_sent_retry($1) as result',
  [b],
);
assert.equal(result.rows[0].result.ok,true,'B error must allow retry C even when A is also an error with provider proof');
const claimC = result.rows[0].result.claim_id;

await db.query(
  "update private.sms_delivery_claims set message='attempt C',staged_at=now() where claim_id=$1",
  [claimC],
);

result = await db.query(
  "select public.record_service_sms_acceptance($1,'closure-provider-c','{\"accepted\":true}'::jsonb) as result",
  [claimC],
);
assert.equal(result.rows[0].result.ok,true);
const c = result.rows[0].result.log_id;

jobState = await db.query(
  'select last_sms_log_id::text as log_id,last_sms_status from public.jobs where id=$1',
  [job],
);
assert.equal(jobState.rows[0].log_id,c);
assert.equal(jobState.rows[0].last_sms_status,'provider_sent','new attempt must replace old error');

result = await db.query(
  "select public.apply_sms_delivery_atomic_v2('closure-provider-b',$1,'delivered',null) as result",
  [claimB],
);
assert.equal(result.rows[0].result.ok,true);

jobState = await db.query(
  'select last_sms_log_id::text as log_id,last_sms_status from public.jobs where id=$1',
  [job],
);
assert.equal(jobState.rows[0].log_id,c,'stale callback B cannot steal pointer from C');
assert.equal(jobState.rows[0].last_sms_status,'provider_sent','stale callback B cannot overwrite current C status');

result = await db.query(
  "select public.apply_sms_delivery_atomic_v2('closure-provider-c',$1,'delivered',null) as result",
  [claimC],
);
assert.equal(result.rows[0].result.ok,true);

jobState = await db.query(
  'select last_sms_log_id::text as log_id,last_sms_status from public.jobs where id=$1',
  [job],
);
assert.equal(jobState.rows[0].log_id,c);
assert.equal(jobState.rows[0].last_sms_status,'delivered');

const attempts = await db.query(
  'select status,retry_of_log_id::text as retry_of from public.sms_log where reminder_group_id=$1 order by created_at,id',
  [group],
);
assert.equal(attempts.rows.length,3,'history must preserve A, B and C as separate attempts');
assert.equal(attempts.rows[0].status,'error');
assert.equal(attempts.rows[1].retry_of,a);
assert.equal(attempts.rows[2].retry_of,b);

console.log('PASS: SMS-01/SMS-06 retry chain A(error) -> B(error) -> C and stale callback isolation');
await db.close();
