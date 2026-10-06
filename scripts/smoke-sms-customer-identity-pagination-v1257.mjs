import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fetchAllOrderedTableRows } from '../src/modules/paginated-read.js';
import { getSmsCustomerBaseKey } from '../src/modules/sms.js';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20261006054752_sms_customer_identity_count_v1257.sql', import.meta.url),
  'utf8',
);
const desktopJobsFetch = fs.readFileSync(new URL('../src/modules/jobs-fetch.js', import.meta.url), 'utf8');
const mobileJobsFetch = fs.readFileSync(new URL('../src/mobile791/modules/jobs-fetch.js', import.meta.url), 'utf8');

// SMS-02 frontend: wspólny numer telefonu nie może definiować tożsamości dwóch różnych kontrahentów.
const sharedPhone = '48699999899';
assert.equal(
  getSmsCustomerBaseKey({ contractor_id: 'contractor-a', sms_recipient_phone: sharedPhone, target_type: 'job', id: 'job-a' }),
  'contractor:contractor-a',
);
assert.equal(
  getSmsCustomerBaseKey({ contractor_id: 'contractor-b', sms_recipient_phone: sharedPhone, target_type: 'job', id: 'job-b' }),
  'contractor:contractor-b',
);
assert.notEqual(
  getSmsCustomerBaseKey({ contractor_id: 'contractor-a', sms_recipient_phone: sharedPhone, target_type: 'job', id: 'job-a' }),
  getSmsCustomerBaseKey({ contractor_id: 'contractor-b', sms_recipient_phone: sharedPhone, target_type: 'job', id: 'job-b' }),
);

// Legacy bez trwałej tożsamości nadal może użyć telefonu wyłącznie jako fallback.
assert.equal(
  getSmsCustomerBaseKey({ status: 'delivered', phone: sharedPhone, created_at: '2026-10-06T00:00:00Z' }),
  `phone:${sharedPhone}`,
);

// SMS-03: rzeczywista paginacja >1000 rekordów.
const rows = Array.from({ length: 1201 }, (_, index) => ({
  id: `job-${String(index + 1).padStart(4, '0')}`,
  created_at: `2026-10-06T00:${String(index % 60).padStart(2, '0')}:00Z`,
}));
const ranges = [];
const orderCalls = [];
const fakeSupabase = {
  from(table) {
    assert.equal(table, 'jobs');
    const builder = {
      select() { return builder; },
      order(field, options) {
        orderCalls.push([field, options]);
        return builder;
      },
      async range(from, to) {
        ranges.push([from, to]);
        return { data: rows.slice(from, to + 1), error: null };
      },
    };
    return builder;
  },
};

const pageResult = await fetchAllOrderedTableRows({
  supabase: fakeSupabase,
  table: 'jobs',
  fields: 'id, created_at',
  pageSize: 500,
  orderBy: 'created_at',
  ascending: false,
});
assert.equal(pageResult.error, null);
assert.equal(pageResult.data.length, 1201);
assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
assert.deepEqual(orderCalls.slice(0, 2).map(([field]) => field), ['created_at', 'id']);
assert.match(desktopJobsFetch, /fetchAllOrderedTableRows\(\{[\s\S]*?table:\s*'jobs'[\s\S]*?pageSize:\s*500/);
assert.match(mobileJobsFetch, /fetchAllOrderedTableRows\(\{[\s\S]*?table:\s*'jobs'[\s\S]*?pageSize:\s*500/);

// SMS-02 SQL: licznik musi rozdzielać klientów po contractor/job/device, nie po telefonie.
const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema private;

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

  create table public.contractors(
    id uuid primary key,
    company_name text,
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
    id uuid primary key default gen_random_uuid(),
    job_id uuid,
    device_id uuid,
    phone text not null,
    message text not null default '',
    sms_type text not null default 'service_reminder',
    status text not null default 'queued',
    provider_message_id text,
    sent_at timestamptz,
    delivered_at timestamptz,
    reminder_cycle integer,
    reminder_due_date date,
    reminder_group_id uuid,
    reminder_group_primary boolean not null default false
  );
`);

await db.exec(migration);

const contractorA = 'f1570000-0000-4000-8000-000000000401';
const contractorB = 'f1570000-0000-4000-8000-000000000402';
const jobA = 'f1570000-0000-4000-8000-000000000411';
const jobB = 'f1570000-0000-4000-8000-000000000412';
const groupA = 'f1570000-0000-4000-8000-000000000421';

await db.exec(`
  insert into public.contractors(id,company_name,phone) values
    ('${contractorA}','A','48699999891'),
    ('${contractorB}','B','48699999892');

  insert into public.jobs(
    id,contractor_id,phone,sms_recipient_phone,installation_date,
    service_reminder_years,sms_consent,sms_reminder_enabled
  ) values
    ('${jobA}','${contractorA}','48699999891','${sharedPhone}','2025-11-06',5,true,true),
    ('${jobB}','${contractorB}','48699999892','${sharedPhone}','2025-11-06',5,true,true);
`);

let count = await db.query("select private.sms_actionable_queue_count_at(date '2026-10-06')::int as n");
assert.equal(count.rows[0].n,2,'two contractors sharing one SMS recipient number must count as two customers');

await db.exec(`
  insert into private.sms_reminder_groups(id,customer_key,normalized_phone,anchor_due_date,window_end_date)
  values('${groupA}','contractor:${contractorA}','${sharedPhone}','2026-10-06','2026-12-07');

  insert into public.sms_log(
    job_id,phone,message,status,provider_message_id,sent_at,
    reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary
  ) values(
    '${jobA}','${sharedPhone}','sent A','provider_sent','provider-a',now(),
    1,'2026-10-06','${groupA}',true
  );
`);

count = await db.query("select private.sms_actionable_queue_count_at(date '2026-10-06')::int as n");
assert.equal(count.rows[0].n,1,'sent contractor A must not hide contractor B sharing the same phone');

console.log('PASS: SMS-02 durable customer identity + SMS-03 jobs pagination >1000');
await db.close();
