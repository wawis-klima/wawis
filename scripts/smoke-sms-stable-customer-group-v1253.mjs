import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const membershipMigration = fs.readFileSync(
  new URL('../supabase/migrations/20261005160818_sms_history_membership_integrity_v1252.sql', import.meta.url),
  'utf8',
);
const stableMigration = fs.readFileSync(
  new URL('../supabase/migrations/20261005162129_sms_stable_customer_group_identity_v1253.sql', import.meta.url),
  'utf8',
);
const generator = fs.readFileSync(
  new URL('../supabase/functions/generate-service-sms-queue/index.ts', import.meta.url),
  'utf8',
);

const db = new PGlite();

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema private;

  create function auth.jwt()
  returns jsonb
  language sql
  stable
  as 'select ''{"role":"service_role"}''::jsonb';

  create function public.current_user_is_admin()
  returns boolean
  language sql
  stable
  as 'select true';

  create function private.sms_source_job_uuid(p_value text)
  returns uuid
  language plpgsql
  immutable
  as 'declare v text := split_part(trim(coalesce(p_value, '''')), ''::'', 1);
      begin
        if v ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
          return v::uuid;
        end if;
        return null;
      end';

  create function private.service_sms_due_date(p_date date, p_cycle integer)
  returns date
  language sql
  immutable
  as 'select (p_date + ((11 + ((p_cycle - 1) * 12))::text || '' months'')::interval)::date';

  create function private.normalize_sms_phone(p_phone text)
  returns text
  language sql
  immutable
  as 'select nullif(trim(coalesce(p_phone, '''')), '''')';

  create table public.contractors(
    id uuid primary key,
    company_name text not null,
    contact_person text,
    phone text
  );

  create table public.jobs(
    id uuid primary key,
    client text,
    title text,
    phone text,
    sms_recipient_phone text,
    contractor_id uuid,
    installation_date date,
    service_reminder_years integer not null default 5,
    sms_consent boolean not null default true,
    sms_reminder_enabled boolean not null default true
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

  create table private.sms_reminder_groups(
    id uuid primary key default gen_random_uuid(),
    customer_key text not null,
    normalized_phone text not null,
    anchor_due_date date not null,
    window_end_date date not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create unique index sms_reminder_groups_customer_anchor_uidx
    on private.sms_reminder_groups(customer_key,anchor_due_date);

  create function private.ensure_sms_reminder_group(p_phone text,p_due_date date)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as 'declare
        v_id uuid;
        v_phone text := private.normalize_sms_phone(p_phone);
      begin
        select id into v_id
        from private.sms_reminder_groups
        where customer_key=''phone:''||v_phone
          and p_due_date between anchor_due_date and window_end_date
        order by anchor_due_date
        limit 1;
        if v_id is not null then return v_id; end if;
        insert into private.sms_reminder_groups(customer_key,normalized_phone,anchor_due_date,window_end_date)
        values(''phone:''||v_phone,v_phone,p_due_date,p_due_date+62)
        returning id into v_id;
        return v_id;
      end';

  create table public.sms_log(
    id uuid primary key default gen_random_uuid(),
    job_id uuid,
    device_id uuid,
    client text,
    phone text not null,
    message text not null,
    sms_type text not null default 'service_reminder',
    provider text not null default 'smsapi',
    provider_message_id text,
    status text not null,
    planned_for timestamptz,
    approved_at timestamptz,
    approved_by uuid,
    sent_at timestamptz,
    delivered_at timestamptz,
    error_message text,
    created_at timestamptz not null default now(),
    reminder_cycle integer,
    reminder_due_date date,
    reminder_group_id uuid,
    reminder_group_primary boolean not null default false,
    retry_of_log_id uuid
  );

  create table private.sms_delivery_claims(
    delivery_key text primary key,
    claim_id uuid not null default gen_random_uuid(),
    reminder_group_id uuid,
    source_log_id uuid,
    job_id uuid,
    device_id uuid,
    recipient_phone text,
    reminder_cycle integer,
    reminder_due_date date,
    client text
  );

  insert into public.contractors(id,company_name,phone)
  values ('93000000-0000-4000-8000-000000000001','Klient A','48501111111');

  insert into public.jobs(
    id,client,phone,sms_recipient_phone,contractor_id,installation_date,service_reminder_years
  )
  values
    ('93100000-0000-4000-8000-000000000001','A1','48501111111','48501111111','93000000-0000-4000-8000-000000000001','2025-11-05',5),
    ('93100000-0000-4000-8000-000000000002','A2','48501111111','48501111111','93000000-0000-4000-8000-000000000001','2025-11-10',5);

  insert into public.devices(
    id,contractor_id,source_job_id,installation_date,service_reminder_years
  )
  values
    ('93200000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','93100000-0000-4000-8000-000000000001::device-1','2025-11-05',5),
    ('93200000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001','93100000-0000-4000-8000-000000000002::device-1','2025-11-10',5);

  insert into private.sms_reminder_groups(
    id,customer_key,normalized_phone,anchor_due_date,window_end_date
  ) values(
    '93300000-0000-4000-8000-000000000001',
    'phone:48501111111','48501111111','2026-10-05','2026-12-06'
  );

  insert into public.sms_log(
    id,job_id,device_id,client,phone,message,status,sent_at,
    reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary
  ) values(
    '93400000-0000-4000-8000-000000000001',
    '93100000-0000-4000-8000-000000000001',
    '93200000-0000-4000-8000-000000000001',
    'A1','48501111111','history A','delivered',now(),
    1,'2026-10-05','93300000-0000-4000-8000-000000000001',true
  );
`);

await db.exec(membershipMigration);
await db.exec(stableMigration);

const migratedGroup = await db.query(
  "select customer_key from private.sms_reminder_groups where id='93300000-0000-4000-8000-000000000001'"
);
assert.equal(
  migratedGroup.rows[0].customer_key,
  'contractor:93000000-0000-4000-8000-000000000001',
);

const memberRows = await db.query(
  "select device_id::text as device_id from private.sms_reminder_group_members where reminder_group_id='93300000-0000-4000-8000-000000000001' order by device_id"
);
assert.deepEqual(
  memberRows.rows.map((row) => row.device_id),
  [
    '93200000-0000-4000-8000-000000000001',
    '93200000-0000-4000-8000-000000000002',
  ],
);

await db.exec(`
  update public.contractors
  set phone='48502222222'
  where id='93000000-0000-4000-8000-000000000001';

  update public.jobs
  set phone='48502222222',sms_recipient_phone='48502222222'
  where contractor_id='93000000-0000-4000-8000-000000000001';
`);

const sameCustomer = await db.query(
  'select public.ensure_service_sms_group_v2($1,$2,$3,$4) as group_id',
  [
    '48502222222',
    '2026-10-10',
    '93200000-0000-4000-8000-000000000002',
    '93100000-0000-4000-8000-000000000002',
  ],
);
assert.equal(
  sameCustomer.rows[0].group_id,
  '93300000-0000-4000-8000-000000000001',
  'Zmiana numeru tego samego kontrahenta nie może rozdzielić grupy.',
);

await db.exec(`
  insert into public.contractors(id,company_name,phone)
  values ('93000000-0000-4000-8000-000000000002','Klient B','48501111111');

  insert into public.jobs(
    id,client,phone,sms_recipient_phone,contractor_id,installation_date,service_reminder_years
  ) values(
    '93100000-0000-4000-8000-000000000003','B','48501111111','48501111111',
    '93000000-0000-4000-8000-000000000002','2025-11-07',5
  );

  insert into public.devices(
    id,contractor_id,source_job_id,installation_date,service_reminder_years
  ) values(
    '93200000-0000-4000-8000-000000000003',
    '93000000-0000-4000-8000-000000000002',
    '93100000-0000-4000-8000-000000000003::device-1',
    '2025-11-07',5
  );
`);

const reassigned = await db.query(
  'select public.ensure_service_sms_group_v2($1,$2,$3,$4) as group_id',
  [
    '48501111111',
    '2026-10-07',
    '93200000-0000-4000-8000-000000000003',
    '93100000-0000-4000-8000-000000000003',
  ],
);
assert.notEqual(
  reassigned.rows[0].group_id,
  '93300000-0000-4000-8000-000000000001',
  'Przejęty numer nie może użyć grupy poprzedniego kontrahenta.',
);

const newGroup = await db.query(
  'select customer_key from private.sms_reminder_groups where id=$1',
  [reassigned.rows[0].group_id],
);
assert.equal(
  newGroup.rows[0].customer_key,
  'contractor:93000000-0000-4000-8000-000000000002',
);

const historyA2 = await db.query(
  'select id::text as id from public.admin_get_device_sms_history($1,$2)',
  [
    '93200000-0000-4000-8000-000000000002',
    '93100000-0000-4000-8000-000000000002',
  ],
);
assert.deepEqual(
  historyA2.rows.map((row) => row.id),
  ['93400000-0000-4000-8000-000000000001'],
);

const historyB = await db.query(
  'select id::text as id from public.admin_get_device_sms_history($1,$2)',
  [
    '93200000-0000-4000-8000-000000000003',
    '93100000-0000-4000-8000-000000000003',
  ],
);
assert.deepEqual(
  historyB.rows,
  [],
  'Nowy kontrahent nie może odziedziczyć historii po przejętym numerze nawet po ensure.',
);

assert.match(stableMigration, /ensure_sms_reminder_group_for_member/);
assert.match(
  stableMigration,
  /v_group_id := private\.ensure_sms_reminder_group_for_member\(v_current_phone, v_due_date, v_device_id, v_linked_job\)/,
);
assert.match(generator, /ensure_service_sms_group_v2/);
assert.match(generator, /p_device_id:\s*deviceId/);
assert.match(generator, /p_job_id:\s*jobId/);

await db.close();
console.log('PASS: SMS N-03 stable customer identity survives phone change and blocks reassignment leaks');
