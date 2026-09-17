import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const funcs=JSON.parse(fs.readFileSync(new URL('./fixtures/roles-functions.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const catalog={policies:JSON.parse(fs.readFileSync(new URL('./fixtures/roles-policies.json',import.meta.url),'utf8').replace(/^\uFEFF/,''))};
const db=new PGlite();
await db.exec(`create schema auth; create schema private; create role authenticated; create role anon;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;`);
await db.exec(fs.readFileSync(new URL('../../supabase/rebuild/legacy_schema_bootstrap_v1089.sql',import.meta.url),'utf8').replace('create extension if not exists pgcrypto;',''));
for(const name of ['current_user_is_admin','current_user_is_staff','current_user_can_view_job','current_user_can_edit_job','admin_delete_contractor','guard_profile_role','guard_job_fields']) await db.exec(funcs.find(f=>f.proname===name).definition);
await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20260917065004_n7_v1089_worker_contractor_contact_update.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20260917101824_audit_invariants.sql',import.meta.url),'utf8'));
await db.exec(`create trigger protect_profile_role before insert or update on profiles for each row execute function private.guard_profile_role();
create trigger protect_job_fields before insert or update on jobs for each row execute function private.guard_job_fields();
grant usage on schema public,auth to authenticated,anon; grant select,insert,update,delete on contractors,profiles,jobs to authenticated;
insert into profiles(id,role) values ('00000000-0000-4000-8000-000000000001','Administrator'),('00000000-0000-4000-8000-000000000002','Pracownik'),('00000000-0000-4000-8000-000000000003','pending');
insert into contractors(id,company_name) values ('00000000-0000-4000-8000-000000000010','fixture');
insert into jobs(id,client,status) values ('00000000-0000-4000-8000-000000000020','fixture','W trakcie');`);
for(const table of ['contractors','profiles','jobs']){
 await db.exec(`alter table public.${table} enable row level security`);
 for(const p of catalog.policies.filter(p=>p.tablename===table&&p.schemaname==='public')) await db.exec(`create policy "${p.policyname}" on public.${table} as ${p.permissive} for ${p.cmd} to ${p.roles.join(',')} ${p.qual?'using ('+p.qual+')':''} ${p.with_check?'with check ('+p.with_check+')':''}`);
}
for(const [role,n,expected] of [['admin',1,1],['worker',2,1],['pending',3,0],['no-profile',4,0]]){
 await db.exec(`begin; set local role authenticated; set local request.jwt.claim.role='authenticated'; set local request.jwt.claim.sub='00000000-0000-4000-8000-00000000000${n}';`);
 const rows=(await db.query('select count(*)::int n from contractors')).rows[0].n;assert.equal(rows,expected);
 const jobs=(await db.query('select count(*)::int n from jobs')).rows[0].n;assert.equal(jobs,expected);
 const update=await db.query("update contractors set phone='123' returning id");assert.equal(update.rows.length,role==='admin'?1:0);
 if(role!=='admin'){
  await db.exec('savepoint check_rpc');await assert.rejects(db.query("select public.admin_delete_contractor('00000000-0000-4000-8000-000000000010')"),/administrator/);await db.exec('rollback to check_rpc');
  await db.exec('savepoint check_insert');await assert.rejects(db.query("insert into contractors(company_name) values ('denied')"));await db.exec('rollback to check_insert');
 }
 await db.exec('rollback');console.log('LOCAL PROD-DEFINITION RLS PASS',role,'read=',rows,'direct update=',update.rows.length);
}
await db.exec(`begin; set local role anon;`);await assert.rejects(db.query('select * from contractors'),/permission denied/);await db.exec('rollback');
console.log('LOCAL ANON direct contractor access denied. Scope: selected exact production policies/functions, not entire Supabase.');
await db.close();

