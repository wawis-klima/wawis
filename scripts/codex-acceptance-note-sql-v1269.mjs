import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260928120000_job_installers_concurrency_v1168.sql',import.meta.url),'utf8');
const db=new PGlite();
const job='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
await db.exec(`
 create schema auth;
 create role anon;
 create role authenticated;
 create role service_role;
 grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
 $$;
 create table public.jobs(id uuid primary key,admin_note text,status text,main_technician_id uuid);
 create table public.profiles(id uuid primary key,role text);
 create table public.job_access(job_id uuid,user_id uuid);
 grant select,insert,update on public.jobs to authenticated;
 grant select on public.profiles to authenticated;
 grant select,insert on public.job_access to authenticated;
`);
await db.exec(migration);
await db.query('insert into public.jobs(id,admin_note,status) values($1,$2,$3)',[job,'old','W trakcie']);
await db.exec('set role authenticated');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
async function save(value){
 const q=await db.query('select public.save_job_concurrent_v1168($1,$2::jsonb,$3::jsonb,null,null,false) as record',[job,JSON.stringify({admin_note:value}),JSON.stringify({admin_note:'old'})]);
 return q.rows[0].record;
}
const done=await save('A');
assert.equal(done.id,job);
await assert.rejects(()=>save('B'),e=>e?.code==='P0001'&&String(e.message).includes('JOB_EDIT_CONFLICT:admin_note'));
const final=await db.query('select admin_note from public.jobs where id=$1',[job]);
assert.equal(final.rows[0].admin_note,'A','P1-02 conflict: no stale overwrite');
await db.exec('reset role');
await db.close();
console.log('PASS CODEX P1-02 — real PostgreSQL RPC, A/B stale edit conflict and persisted winner A');
