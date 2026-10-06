import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fetchAllOrderedTableRows } from '../src/modules/paginated-read.js';
import {
  buildSmsTargets,
  deriveSmsQueue,
  groupSmsLogsByCustomerWindow,
} from '../src/modules/sms.js';

function activeInstallationDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const zeroBased = (year * 12) + (month - 1) - 11;
  const installYear = Math.floor(zeroBased / 12);
  const installMonth = (zeroBased % 12) + 1;
  return `${installYear}-${String(installMonth).padStart(2, '0')}-01`;
}

const installationDate = activeInstallationDate();
const sharedPhone = '48500111222';

// SMS-02 frontend counterexample: two different contractors with one shared phone remain separate.
const differentContractors = [
  {
    id: 'job-a',
    contractor_id: 'contractor-a',
    client: 'Klient A',
    phone: sharedPhone,
    sms_recipient_phone: sharedPhone,
    installation_date: installationDate,
    service_reminder_years: 1,
    sms_consent: true,
    sms_reminder_enabled: true,
  },
  {
    id: 'job-b',
    contractor_id: 'contractor-b',
    client: 'Klient B',
    phone: sharedPhone,
    sms_recipient_phone: sharedPhone,
    installation_date: installationDate,
    service_reminder_years: 1,
    sms_consent: true,
    sms_reminder_enabled: true,
  },
];

let queue = deriveSmsQueue(buildSmsTargets({ jobs: differentContractors, devices: [] }), []);
assert.equal(queue.length, 2, 'Different contractor_id values sharing one phone must stay as two SMS customers.');

const sameContractor = differentContractors.map((job, index) => ({
  ...job,
  id: `same-${index + 1}`,
  contractor_id: 'contractor-same',
  client: `Ten sam klient ${index + 1}`,
}));
queue = deriveSmsQueue(buildSmsTargets({ jobs: sameContractor, devices: [] }), []);
assert.equal(queue.length, 1, 'Two jobs of one contractor in the same window must remain one SMS customer.');
assert.equal(queue[0].grouped_job_ids.length, 2);

// Stable customer key from the durable backend group must beat a shared phone in log grouping.
const groupedLogs = groupSmsLogsByCustomerWindow([
  {
    id: 'log-a',
    client: 'Klient A',
    phone: sharedPhone,
    reminder_group_customer_key: 'contractor:contractor-a',
    status: 'error',
    reminder_due_date: '2026-10-06',
    created_at: '2026-10-06T05:00:00Z',
  },
  {
    id: 'log-b',
    client: 'Klient B',
    phone: sharedPhone,
    reminder_group_customer_key: 'contractor:contractor-b',
    status: 'error',
    reminder_due_date: '2026-10-06',
    created_at: '2026-10-06T05:01:00Z',
  },
]);
assert.equal(groupedLogs.length, 2, 'Stable backend identities must prevent same-phone frontend merging.');

// SMS-03: fetch >1000 jobs and prove the last page reaches the SMS queue.
const rows = Array.from({ length: 1201 }, (_, index) => ({
  id: `job-${String(index + 1).padStart(4, '0')}`,
  contractor_id: `contractor-${String(index + 1).padStart(4, '0')}`,
  client: `Klient ${index + 1}`,
  phone: index === 1200 ? '48500999888' : '',
  sms_recipient_phone: index === 1200 ? '48500999888' : '',
  installation_date: installationDate,
  service_reminder_years: 1,
  sms_consent: index === 1200,
  sms_reminder_enabled: index === 1200,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index % 60)).toISOString(),
}));

const ranges = [];
const fakeSupabase = {
  from(table) {
    assert.equal(table, 'jobs');
    return {
      select() { return this; },
      order() { return this; },
      async range(from, to) {
        ranges.push([from, to]);
        return { data: rows.slice(from, to + 1), error: null };
      },
    };
  },
};

const paged = await fetchAllOrderedTableRows({
  supabase: fakeSupabase,
  table: 'jobs',
  fields: 'id, contractor_id, phone',
  pageSize: 500,
  orderBy: 'created_at',
  ascending: false,
});
assert.equal(paged.error, null);
assert.equal(paged.data.length, 1201);
assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);

queue = deriveSmsQueue(buildSmsTargets({ jobs: paged.data, devices: [] }), []);
assert.equal(queue.length, 1);
assert.equal(queue[0].id, 'job-1201', 'Job beyond the first 1000 rows must reach the SMS queue.');

// Backend SMS-02: dashboard count uses stable customer identity, not distinct phone.
const migration = fs.readFileSync(
  new URL('../supabase/migrations/20261006074500_sms_stable_identity_counter_v1257.sql', import.meta.url),
  'utf8',
);
const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema private;

  create function auth.jwt() returns jsonb
  language sql stable set search_path to ''
  as $$ select '{"role":"service_role"}'::jsonb $$;

  create function public.current_user_is_admin() returns boolean
  language sql stable set search_path to ''
  as $$ select true $$;

  create function private.normalize_sms_phone(p_phone text) returns text
  language sql immutable set search_path to ''
  as $$ select nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'') $$;

  create function private.sms_source_job_uuid(p_value text) returns uuid
  language plpgsql immutable set search_path to ''
  as $$
  declare v text := split_part(btrim(coalesce(p_value,'')),'::',1);
  begin
    if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return v::uuid;
    end if;
    return null;
  end $$;

  create function private.service_sms_due_date(p_date date,p_cycle integer) returns date
  language sql immutable set search_path to ''
  as $$ select (p_date + ((11 + ((greatest(1,p_cycle)-1)*12))::text || ' months')::interval)::date $$;

  create function private.sms_log_is_retryable_failure(text,text,timestamptz,timestamptz)
  returns boolean language sql immutable set search_path to ''
  as $$ select false $$;

  create function private.sms_log_blocks_retry(text,text,timestamptz,timestamptz)
  returns boolean language sql immutable set search_path to ''
  as $$ select false $$;

  create table public.contractors(
    id uuid primary key,
    phone text
  );

  create table public.jobs(
    id uuid primary key,
    contractor_id uuid,
    phone text,
    sms_recipient_phone text,
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
    id uuid primary key,
    customer_key text not null,
    normalized_phone text not null,
    anchor_due_date date not null,
    window_end_date date not null
  );

  create table public.sms_log(
    id uuid primary key,
    job_id uuid,
    device_id uuid,
    client text,
    phone text,
    sms_type text not null default 'service_reminder',
    provider text,
    provider_message_id text,
    status text not null,
    planned_for timestamptz,
    approved_at timestamptz,
    sent_at timestamptz,
    delivered_at timestamptz,
    error_message text,
    reminder_cycle integer,
    reminder_due_date date,
    reminder_group_id uuid,
    reminder_group_primary boolean not null default false,
    retry_of_log_id uuid,
    created_at timestamptz not null default now()
  );

  create table public.sms_settings(
    id uuid primary key,
    is_enabled boolean,
    sending_mode text,
    sender_name text,
    service_phone text,
    company_name text,
    template_service_reminder text,
    created_at timestamptz not null default now(),
    updated_at timestamptz
  );

  create table private.sms_delivery_claims(
    retry_of_log_id uuid
  );
`);

await db.exec(migration);

const contractorA = '71000000-0000-4000-8000-000000000001';
const contractorB = '71000000-0000-4000-8000-000000000002';
const jobA = '72000000-0000-4000-8000-000000000001';
const jobA2 = '72000000-0000-4000-8000-000000000002';
const jobB = '72000000-0000-4000-8000-000000000003';
const groupA = '73000000-0000-4000-8000-000000000001';

await db.exec(`
  insert into public.contractors(id,phone) values
    ('${contractorA}','48500111222'),
    ('${contractorB}','48500111222');

  insert into public.jobs(
    id,contractor_id,phone,sms_recipient_phone,installation_date,
    service_reminder_years,sms_consent,sms_reminder_enabled
  ) values
    ('${jobA}','${contractorA}','48500111222','48500111222','2025-11-06',1,true,true),
    ('${jobA2}','${contractorA}','48500111222','48500111222','2025-11-06',1,true,true),
    ('${jobB}','${contractorB}','48500111222','48500111222','2025-11-06',1,true,true);
`);

let count = await db.query("select private.sms_actionable_queue_count_at(date '2026-10-06')::int as n");
assert.equal(count.rows[0].n, 2, 'Backend counter must count two contractors sharing one phone.');

await db.exec(`
  insert into private.sms_reminder_groups(
    id,customer_key,normalized_phone,anchor_due_date,window_end_date
  ) values(
    '${groupA}','contractor:${contractorA}','48500111222','2026-10-06','2026-12-07'
  );

  insert into public.sms_log(
    id,job_id,client,phone,status,sent_at,reminder_cycle,reminder_due_date,
    reminder_group_id,reminder_group_primary
  ) values(
    '74000000-0000-4000-8000-000000000001',
    '${jobA}','Klient A','48500111222','delivered','2026-10-06T05:00:00Z',
    1,'2026-10-06','${groupA}',true
  );
`);

count = await db.query("select private.sms_actionable_queue_count_at(date '2026-10-06')::int as n");
assert.equal(count.rows[0].n, 1, 'Delivered contractor A must not hide contractor B sharing the phone.');

const snapshot = await db.query('select public.admin_get_sms_module_snapshot() as result');
const queueLogs = snapshot.rows[0].result.queue_logs;
const logA = queueLogs.find((row) => row.id === '74000000-0000-4000-8000-000000000001');
assert.equal(
  logA?.reminder_group_customer_key,
  `contractor:${contractorA}`,
  'Snapshot must expose durable customer identity to the frontend.',
);

await db.close();

console.log('PASS: SMS-02 stable identity and SMS-03 >1000 jobs pagination');
