import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20261006070000_sms_retry_attempt_lifecycle_v1257.sql', import.meta.url),
  'utf8',
);

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema private;

  create sequence private.test_uuid_seq;
  create function private.test_uuid()
  returns uuid language sql volatile set search_path to ''
  as $$ select ('10000000-0000-4000-8000-' || lpad(nextval('private.test_uuid_seq')::text,12,'0'))::uuid $$;

  create function auth.jwt()
  returns jsonb language sql stable set search_path to ''
  as $$ select '{"role":"service_role"}'::jsonb $$;

  create function public.current_user_is_admin()
  returns boolean language sql stable set search_path to ''
  as $$ select true $$;

  create function private.normalize_sms_phone(p_phone text)
  returns text language sql immutable set search_path to ''
  as $$ select nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'') $$;

  create function private.sms_source_job_uuid(p_value text)
  returns uuid language plpgsql immutable set search_path to ''
  as $$
  declare v text := split_part(btrim(coalesce(p_value,'')),'::',1);
  begin
    if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return v::uuid;
    end if;
    return null;
  end $$;

  create function private.service_sms_due_date(p_date date,p_cycle integer)
  returns date language sql immutable set search_path to ''
  as $$ select (p_date + ((11 + ((greatest(1,p_cycle)-1)*12))::text || ' months')::interval)::date $$;

  create function private.sms_log_is_retryable_failure(
    p_status text,p_provider_message_id text,p_sent_at timestamptz,p_delivered_at timestamptz
  )
  returns boolean language sql immutable set search_path to ''
  as $$
    select case lower(btrim(coalesce(p_status,'')))
      when 'not_sent' then p_provider_message_id is null and p_sent_at is null and p_delivered_at is null
      when 'error' then p_delivered_at is null
        and (nullif(btrim(coalesce(p_provider_message_id,'')),'') is not null or p_sent_at is null)
      else false
    end
  $$;

  create table public.contractors(
    id uuid primary key,
    phone text,
    company_name text,
    contact_person text
  );

  create table public.jobs(
    id uuid primary key,
    client text,
    title text,
    phone text,
    sms_recipient_phone text,
    installation_date date,
    sms_consent boolean not null default true,
    sms_reminder_enabled boolean not null default true,
    last_sms_log_id uuid,
    last_sms_sent_at timestamptz,
    last_sms_status text,
    last_sms_error text
  );

  create table public.devices(
    id uuid primary key,
    source_job_id text,
    contractor_id uuid,
    installation_date date,
    sms_consent boolean not null default true,
    sms_reminder_enabled boolean not null default true
  );

  create table private.sms_reminder_groups(
    id uuid primary key default private.test_uuid(),
    normalized_phone text not null,
    anchor_due_date date not null,
    window_end_date date not null
  );

  create function private.ensure_sms_reminder_group_for_member(
    p_phone text,p_due_date date,p_device_id uuid,p_job_id uuid
  )
  returns uuid language plpgsql security definer set search_path to ''
  as $$
  declare v uuid;
  begin
    select id into v
    from private.sms_reminder_groups
    where normalized_phone=private.normalize_sms_phone(p_phone)
      and p_due_date between anchor_due_date and window_end_date
    order by anchor_due_date
    limit 1;
    if v is not null then return v; end if;
    insert into private.sms_reminder_groups(normalized_phone,anchor_due_date,window_end_date)
    values(private.normalize_sms_phone(p_phone),p_due_date,p_due_date+62)
    returning id into v;
    return v;
  end $$;

  create table public.sms_settings(
    id uuid primary key default private.test_uuid(),
    is_enabled boolean,
    sending_mode text,
    sender_name text,
    service_phone text,
    company_name text,
    template_service_reminder text,
    created_at timestamptz not null default now(),
    updated_at timestamptz
  );

  create table public.sms_log(
    id uuid primary key default private.test_uuid(),
    job_id uuid,
    device_id uuid,
    client text,
    phone text,
    message text,
    sms_type text not null default 'service_reminder',
    provider text,
    provider_message_id text,
    provider_response jsonb,
    status text not null,
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
    retry_of_log_id uuid,
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
    uncertain_at timestamptz
  );

  create unique index uq_sms_delivery_claims_active_group_test
    on private.sms_delivery_claims(reminder_group_id)
    where reminder_group_id is not null and confirmed_at is null;
`);

await db.exec(migration);

const job='20000000-0000-4000-8000-000000000001';
const group='30000000-0000-4000-8000-000000000001';
const a='40000000-0000-4000-8000-000000000001';
const b='40000000-0000-4000-8000-000000000002';
const c='40000000-0000-4000-8000-000000000003';

await db.exec(`
  insert into public.jobs(
    id,client,phone,sms_recipient_phone,installation_date,
    sms_consent,sms_reminder_enabled
  ) values(
    '${job}','Klient retry','48500111222','48500111222','2025-11-06',true,true
  );

  insert into private.sms_reminder_groups(
    id,normalized_phone,anchor_due_date,window_end_date
  ) values(
    '${group}','48500111222','2026-10-06','2026-12-07'
  );

  insert into public.sms_log(
    id,job_id,client,phone,message,status,provider_message_id,sent_at,
    reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary,error_message
  ) values(
    '${a}','${job}','Klient retry','48500111222','A','error','provider-A',
    '2026-10-06T05:00:00Z',1,'2026-10-06','${group}',true,'undelivered A'
  );

  insert into private.sms_delivery_claims(
    delivery_key,claim_id,confirmed_at,reminder_group_id,source_log_id,retry_of_log_id,
    job_id,recipient_phone,reminder_cycle,reminder_due_date,client
  ) values(
    'retry:A','50000000-0000-4000-8000-000000000001','2026-10-06T05:01:00Z',
    '${group}','${b}','${a}','${job}','48500111222',1,'2026-10-06','Klient retry'
  );

  insert into public.sms_log(
    id,job_id,client,phone,message,status,provider_message_id,sent_at,
    reminder_cycle,reminder_due_date,reminder_group_id,retry_of_log_id,error_message
  ) values(
    '${b}','${job}','Klient retry','48500111222','B','error','provider-B',
    '2026-10-06T05:02:00Z',1,'2026-10-06','${group}','${a}','undelivered B'
  );
`);

let state=await db.query(
  'select last_sms_log_id::text as id,last_sms_status,last_sms_error from public.jobs where id=$1',
  [job],
);
assert.equal(state.rows[0].id,b);
assert.equal(state.rows[0].last_sms_status,'error');

// The newest failed attempt must be visible in Niewysłane despite older failed attempts.
let snapshot=await db.query('select public.admin_get_sms_module_snapshot() as result');
let unsent=snapshot.rows[0].result.unsent_logs;
assert.ok(
  unsent.some((row)=>row.id===b),
  'latest retryable failure must remain visible in Niewysłane even with older failed attempts'
);

// SMS-01: A and B are both historical retryable failures. B must be retryable again.
let result=await db.query(
  'select public.claim_service_sms_not_sent_retry($1) as result',
  [b],
);
assert.equal(result.rows[0].result.ok,true);
assert.equal(result.rows[0].result.retry_of_log_id,b);
const claimC=result.rows[0].result.claim_id;

await db.exec(`
  update private.sms_delivery_claims
  set confirmed_at=now()
  where claim_id='${claimC}';
`);

// SMS-06: a newer provider attempt must replace the old error as current job state.
await db.exec(`
  insert into public.sms_log(
    id,job_id,client,phone,message,status,provider_message_id,sent_at,
    reminder_cycle,reminder_due_date,reminder_group_id,retry_of_log_id
  ) values(
    '${c}','${job}','Klient retry','48500111222','C','provider_sent','provider-C',
    '2026-10-06T05:03:00Z',1,'2026-10-06','${group}','${b}'
  );
`);

state=await db.query(
  'select last_sms_log_id::text as id,last_sms_status,last_sms_error from public.jobs where id=$1',
  [job],
);
assert.equal(state.rows[0].id,c);
assert.equal(state.rows[0].last_sms_status,'provider_sent');
assert.equal(state.rows[0].last_sms_error,null);

// A stale update from B cannot steal the pointer back from C.
await db.exec(`
  update public.sms_log
  set status='delivered',delivered_at='2026-10-06T05:04:00Z',error_message=null
  where id='${b}';
`);

state=await db.query(
  'select last_sms_log_id::text as id,last_sms_status from public.jobs where id=$1',
  [job],
);
assert.equal(state.rows[0].id,c);
assert.equal(state.rows[0].last_sms_status,'provider_sent');

// The current C attempt still advances monotonically inside the same attempt.
await db.exec(`
  update public.sms_log
  set status='delivered',delivered_at='2026-10-06T05:05:00Z'
  where id='${c}';
`);
state=await db.query(
  'select last_sms_log_id::text as id,last_sms_status from public.jobs where id=$1',
  [job],
);
assert.equal(state.rows[0].id,c);
assert.equal(state.rows[0].last_sms_status,'delivered');

console.log('PASS: SMS-01 repeated retry and SMS-06 current-attempt job status lifecycle');
await db.close();
