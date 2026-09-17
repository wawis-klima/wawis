import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const finding = process.argv[2];
const baseline = process.argv.includes('--baseline');
assert.ok(['A01','A02','A09'].includes(finding));
const db = new PGlite();
try {
await db.exec(`create schema private; create schema auth; create role anon; create role authenticated;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
create function public.current_user_is_staff() returns boolean language sql as $$select true$$;
create function public.current_user_is_admin() returns boolean language sql as $$select false$$;`);
await db.exec(read('supabase/rebuild/legacy_schema_bootstrap_v1089.sql').replace('create extension if not exists pgcrypto;', ''));
await db.exec(read('supabase/migrations/current/job-completion-tracking-v9.14.sql'));
await db.exec(read('supabase/migrations/20260917065004_n7_v1089_worker_contractor_contact_update.sql'));
await db.exec(read('supabase/migrations/20260916201000_job_completion_nameplate_guard_v1088.sql'));
const fixDir = new URL('supabase/migrations/', root);
for (const name of fs.readdirSync(fixDir).filter(n => !baseline && n.endsWith('_audit_invariants.sql')).sort()) await db.exec(fs.readFileSync(new URL(name,fixDir),'utf8'));
await db.exec(`insert into contractors(id,company_name,phone,city,street,addresses) values
('00000000-0000-4000-8000-000000000002','Client','222','HQ','Main','[{"id":"primary","city":"HQ","street":"Main","is_primary":true},{"id":"secondary","city":"Branch","street":"Other","is_primary":false}]');
insert into jobs(id,contractor_id,client,phone,city,street,contractor_address_id,status,device_model) values
('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','Client','111','Branch','Other','secondary','W trakcie','Split');`);
if (finding === 'A01') {
 await db.exec(`update jobs set client='Corrected'`);
 const contact=(await db.query('select * from contractors')).rows[0];
 assert.equal(contact.phone,'222','name-only must preserve newer phone');
 assert.equal(contact.city,'HQ','name-only must preserve HQ');
 assert.equal(contact.addresses[1].city,'Branch');
 await db.exec(`update jobs set phone='333'`);
 assert.equal((await db.query('select phone from contractors')).rows[0].phone,'333');
 await db.exec(`update jobs set street='Branch changed'`);
 const patched=(await db.query('select * from contractors')).rows[0];
 assert.equal(patched.street,'Main'); assert.equal(patched.addresses[1].street,'Branch changed');
 assert.equal(patched.phone,'333');
} else {
 await db.exec(`create or replace function public.current_user_is_admin() returns boolean language sql as $$select true$$;
 insert into photos(job_id,photo_kind,device_index,unit_ref,storage_path) values
 ('00000000-0000-4000-8000-000000000003','nameplate',1,'jz','fixture/jz'),
 ('00000000-0000-4000-8000-000000000003','nameplate',1,'jw-1','fixture/jw');
 update jobs set status='Zakończone';`);
 if(finding === 'A02') {
  await assert.rejects(db.exec(`update jobs set device_model=E'Split\nSecond split'`),/job_nameplates_incomplete/);
  await assert.rejects(db.exec(`update jobs set device_serial_number='JW2: additional'`),/job_nameplates_incomplete/);
  await assert.rejects(db.exec(`delete from photos where unit_ref='jz'`),/job_nameplates_incomplete/);
 } else {
  await db.exec(`create table if not exists private.job_recycle_bin(archive_id uuid primary key,job_id uuid,snapshot jsonb,deleted_at timestamptz default now(),restored_at timestamptz);
   create table if not exists public.job_protocols(id uuid,job_id uuid); create table if not exists public.job_protocol_email_log(id uuid,job_id uuid);
   update jobs set completed_at='2025-01-02T03:04:05Z';
   insert into private.job_recycle_bin(archive_id,job_id,snapshot) select '00000000-0000-4000-8000-000000000099',j.id,jsonb_build_object('jobs',to_jsonb(j),'photos',(select jsonb_agg(to_jsonb(p)) from photos p)) from jobs j;
   delete from jobs; delete from photos;`);
  const patched=!baseline && fs.readdirSync(fixDir).some(n=>n.endsWith('_audit_restore.sql'));
  if(patched) for(const n of fs.readdirSync(fixDir).filter(n=>n.endsWith('_audit_restore.sql'))) await db.exec(fs.readFileSync(new URL(n,fixDir),'utf8'));
  else await db.exec(read('scripts/audit-v1089/fixtures/baseline-restore.sql'));
  await db.query(`select public.admin_restore_deleted_job('00000000-0000-4000-8000-000000000099')`);
  assert.equal((await db.query('select count(*)::int n from photos')).rows[0].n,2);
  assert.equal((await db.query('select status from jobs')).rows[0].status,'Zakończone');
  assert.equal(new Date((await db.query('select completed_at from jobs')).rows[0].completed_at).toISOString(),'2025-01-02T03:04:05.000Z');
  await assert.rejects(db.query(`select public.admin_restore_deleted_job('00000000-0000-4000-8000-000000000099')`),/już przywrócona/);
 }
}
console.log(`${finding} PASS behavioral SQL`);
} catch (error) { console.error(finding, error.name, error.message); process.exitCode = 1; } finally { await db.close(); }


