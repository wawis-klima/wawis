import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20261005160818_sms_history_membership_integrity_v1252.sql', import.meta.url),
  'utf8',
);
const stableIdentityMigration = fs.readFileSync(
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
  as $$select '{"role":"service_role"}'::jsonb$$;

  create function public.current_user_is_admin()
  returns boolean
  language sql
  stable
  as $$select true$$;

  create function private.sms_source_job_uuid(p_value text)
  returns uuid
  language plpgsql
  immutable
  as $$
  declare
    v text := split_part(trim(coalesce(p_value,'')), '::', 1);
  begin
    if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return v::uuid;
    end if;
    return null;
  end;
  $$;

  create function private.normalize_sms_phone(p_phone text)
  returns text
  language sql
  immutable
  as $
    select case
      when regexp_replace(coalesce(p_phone,''), '\\D', '', 'g') ~ '^48[0-9]{9}
  returns date
  language sql
  immutable
  as $$
    select (p_date + ((11 + ((p_cycle - 1) * 12))::text || ' months')::interval)::date
  $$;

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
    service_reminder_years integer not null default 5
  );

  create table public.devices(
    id uuid primary key,
    contractor_id uuid,
    source_job_id text,
    installation_date date,
    service_reminder_years integer not null default 5
  );

  create table private.sms_reminder_groups(
    id uuid primary key,
    customer_key text not null,
    normalized_phone text not null,
    anchor_due_date date not null,
    window_end_date date not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create unique index sms_reminder_groups_customer_anchor_uidx
    on private.sms_reminder_groups(customer_key,anchor_due_date);

  create sequence private.group_seq;

  create function private.ensure_sms_reminder_group(p_phone text, p_due_date date)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $$
  declare
    v_id uuid;
  begin
    select id into v_id
    from private.sms_reminder_groups
    where normalized_phone=p_phone
      and p_due_date between anchor_due_date and window_end_date
    order by anchor_due_date
    limit 1;

    if v_id is not null then
      return v_id;
    end if;

    v_id := (
      '94000000-0000-4000-8000-' ||
      lpad(nextval('private.group_seq')::text, 12, '0')
    )::uuid;

    insert into private.sms_reminder_groups(
      id,customer_key,normalized_phone,anchor_due_date,window_end_date
    )
    values(v_id,'phone:'||p_phone,p_phone,p_due_date,p_due_date+62);

    return v_id;
  end;
  $$;

  create table public.sms_log(
    id uuid primary key,
    job_id uuid,
    device_id uuid,
    client text,
    phone text not null,
    message text not null,
    status text not null,
    error_message text,
    created_at timestamptz not null default now(),
    planned_for timestamptz,
    approved_at timestamptz,
    sent_at timestamptz,
    delivered_at timestamptz,
    reminder_cycle integer,
    reminder_due_date date,
    reminder_group_id uuid,
    reminder_group_primary boolean not null default false
  );

  create table private.sms_delivery_claims(
    delivery_key text not null,
    claim_id uuid primary key,
    reminder_group_id uuid,
    job_id uuid,
    device_id uuid,
    reminder_due_date date
  );

  insert into public.contractors(id,company_name,phone)
  values ('93000000-0000-4000-8000-000000000001','Klient A','501111111');

  insert into public.jobs(
    id,client,phone,sms_recipient_phone,contractor_id,installation_date,service_reminder_years
  )
  values
    ('93100000-0000-4000-8000-000000000001','A1','501111111','501111111','93000000-0000-4000-8000-000000000001','2025-11-05',5),
    ('93100000-0000-4000-8000-000000000002','A2','501111111','501111111','93000000-0000-4000-8000-000000000001','2025-11-10',5);

  insert into public.devices(
    id,contractor_id,source_job_id,installation_date,service_reminder_years
  )
  values
    ('93200000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','93100000-0000-4000-8000-000000000001::device-1','2025-11-05',5),
    ('93200000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001','93100000-0000-4000-8000-000000000002::device-1','2025-11-10',5);

  insert into private.sms_reminder_groups(
    id,customer_key,normalized_phone,anchor_due_date,window_end_date
  )
  values (
    '93300000-0000-4000-8000-000000000001',
    'phone:48501111111',
    '48501111111',
    '2026-10-05',
    '2026-12-06'
  );

  insert into public.sms_log(
    id,job_id,device_id,client,phone,message,status,sent_at,
    reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary
  )
  values (
    '93400000-0000-4000-8000-000000000001',
    '93100000-0000-4000-8000-000000000001',
    '93200000-0000-4000-8000-000000000001',
    'A1','48501111111','history A','delivered',now(),
    1,'2026-10-05','93300000-0000-4000-8000-000000000001',true
  );
`);

await db.exec(migration);
await db.exec(stableIdentityMigration);

const initialMembers = await db.query(
  `select device_id::text as device_id, membership_source
   from private.sms_reminder_group_members
   where reminder_group_id='93300000-0000-4000-8000-000000000001'
   order by device_id`
);
assert.deepEqual(
  initialMembers.rows.map((row) => row.device_id),
  [
    '93200000-0000-4000-8000-000000000001',
    '93200000-0000-4000-8000-000000000002',
  ],
  'Backfill musi utrwalić reprezentanta i drugie urządzenie tego samego kontrahenta.',
);

await db.exec(`
  update public.contractors
  set phone='502222222'
  where id='93000000-0000-4000-8000-000000000001';

  update public.jobs
  set phone='502222222',sms_recipient_phone='502222222'
  where contractor_id='93000000-0000-4000-8000-000000000001';

  insert into public.contractors(id,company_name,phone)
  values ('93000000-0000-4000-8000-000000000002','Klient B','501111111');

  insert into public.jobs(
    id,client,phone,sms_recipient_phone,contractor_id,installation_date,service_reminder_years
  )
  values (
    '93100000-0000-4000-8000-000000000003','B','501111111','501111111',
    '93000000-0000-4000-8000-000000000002','2025-11-07',5
  );

  insert into public.devices(
    id,contractor_id,source_job_id,installation_date,service_reminder_years
  )
  values (
    '93200000-0000-4000-8000-000000000003',
    '93000000-0000-4000-8000-000000000002',
    '93100000-0000-4000-8000-000000000003::device-1',
    '2025-11-07',
    5
  );
`);

const sameCustomerHistory = await db.query(
  `select id::text as id
   from public.admin_get_device_sms_history($1,$2)`,
  [
    '93200000-0000-4000-8000-000000000002',
    '93100000-0000-4000-8000-000000000002',
  ],
);
assert.deepEqual(
  sameCustomerHistory.rows.map((row) => row.id),
  ['93400000-0000-4000-8000-000000000001'],
  'Zmiana telefonu nie może odciąć drugiego urządzenia tego samego klienta od starej grupy.',
);

const reassignedPhoneHistory = await db.query(
  `select id::text as id
   from public.admin_get_device_sms_history($1,$2)`,
  [
    '93200000-0000-4000-8000-000000000003',
    '93100000-0000-4000-8000-000000000003',
  ],
);
assert.deepEqual(
  reassignedPhoneHistory.rows,
  [],
  'Nowy kontrahent z przejętym numerem nie może zobaczyć historii poprzedniego klienta.',
);

const ensured = await db.query(
  `select public.ensure_service_sms_group_v2($1,$2,$3,$4) as group_id`,
  [
    '48501111111',
    '2026-10-07',
    '93200000-0000-4000-8000-000000000003',
    '93100000-0000-4000-8000-000000000003',
  ],
);
const runtimeGroupId = ensured.rows[0].group_id;
assert.notEqual(
  runtimeGroupId,
  '93300000-0000-4000-8000-000000000001',
  'Przejęty numer telefonu nie może ponownie użyć grupy poprzedniego kontrahenta.',
);

const runtimeGroup = await db.query(
  `select customer_key from private.sms_reminder_groups where id=$1`,
  [runtimeGroupId],
);
assert.equal(
  runtimeGroup.rows[0].customer_key,
  'contractor:93000000-0000-4000-8000-000000000002',
);

const reassignedAfterEnsure = await db.query(
  `select id::text as id
   from public.admin_get_device_sms_history($1,$2)`,
  [
    '93200000-0000-4000-8000-000000000003',
    '93100000-0000-4000-8000-000000000003',
  ],
);
assert.deepEqual(
  reassignedAfterEnsure.rows,
  [],
  'Nowy kontrahent nie może odziedziczyć starej historii nawet po utworzeniu własnej grupy.',
);

const sameCustomerAfterPhoneChange = await db.query(
  `select public.ensure_service_sms_group_v2($1,$2,$3,$4) as group_id`,
  [
    '48502222222',
    '2026-10-10',
    '93200000-0000-4000-8000-000000000002',
    '93100000-0000-4000-8000-000000000002',
  ],
);
assert.equal(
  sameCustomerAfterPhoneChange.rows[0].group_id,
  '93300000-0000-4000-8000-000000000001',
  'Zmiana numeru tego samego kontrahenta nie może rozdzielić jego grupy.',
);

const runtimeMember = await db.query(
  `select device_id::text as device_id,job_id::text as job_id
   from private.sms_reminder_group_members
   where reminder_group_id=$1 and device_id=$2`,
  [runtimeGroupId,'93200000-0000-4000-8000-000000000003'],
);
assert.equal(runtimeMember.rows.length, 1);
assert.equal(runtimeMember.rows[0].job_id, '93100000-0000-4000-8000-000000000003');

await db.exec(`
  insert into private.sms_reminder_groups(
    id,customer_key,normalized_phone,anchor_due_date,window_end_date
  )
  values (
    '93300000-0000-4000-8000-000000000002',
    'phone:48503333333',
    '48503333333',
    '2026-10-07',
    '2026-12-08'
  );

  insert into private.sms_delivery_claims(
    delivery_key,claim_id,reminder_group_id,job_id,device_id,reminder_due_date
  )
  values (
    'group:claim-test',
    '93500000-0000-4000-8000-000000000001',
    '93300000-0000-4000-8000-000000000002',
    '93100000-0000-4000-8000-000000000003',
    '93200000-0000-4000-8000-000000000003',
    '2026-10-07'
  );
`);

const claimMember = await db.query(
  `select membership_source
   from private.sms_reminder_group_members
   where reminder_group_id='93300000-0000-4000-8000-000000000002'
     and device_id='93200000-0000-4000-8000-000000000003'`
);
assert.equal(claimMember.rows.length, 1);
assert.equal(claimMember.rows[0].membership_source, 'claim');

const historyFunction = migration.slice(
  migration.indexOf('create or replace function public.admin_get_device_sms_history'),
);
assert.match(historyFunction, /private\.sms_reminder_group_members/);
assert.doesNotMatch(historyFunction, /normalize_sms_phone/);
assert.doesNotMatch(historyFunction, /g\.normalized_phone/);

assert.match(stableIdentityMigration, /contractor:/);
assert.match(stableIdentityMigration, /ensure_sms_reminder_group_for_member/);
assert.match(
  stableIdentityMigration,
  /v_group_id := private\.ensure_sms_reminder_group_for_member\(v_current_phone, v_due_date, v_device_id, v_linked_job\)/,
);
assert.match(generator, /ensure_service_sms_group_v2/);
assert.match(generator, /p_device_id:\s*deviceId/);
assert.match(generator, /p_job_id:\s*jobId/);

assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table private\.sms_reminder_group_members from public, anon, authenticated/i);
assert.match(migration, /trg_capture_sms_claim_group_membership/);

await db.close();

console.log('PASS: SMS N-03 uses durable membership and stable customer identity, not phone ownership');
