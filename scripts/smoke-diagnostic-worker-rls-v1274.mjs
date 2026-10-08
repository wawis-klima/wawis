import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = fs.readFileSync(new URL('../supabase/migrations/20261008215000_diagnostic_worker_upsert_rls_v1274.sql', import.meta.url), 'utf8');
const base = fs.readFileSync(new URL('../supabase/rebuild/20260917050109_n7_v1089_rls_policies_baseline.sql', import.meta.url), 'utf8');
assert.match(base, /create policy app_diagnostic_events_select_own .*for select to authenticated/i);
const db = new PGlite();
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
await db.exec([
 'create schema auth;',
 'create role anon;',
 'create role authenticated;',
 'create role service_role;',
 "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
 "create function public.current_user_is_admin() returns boolean language sql stable as $$ select current_setting('app.test_admin',true)='yes' $$;",
 'create table public.app_diagnostic_events (id uuid primary key default gen_random_uuid(), user_id uuid not null, client_event_id text not null, event_type text not null default \'console.error\', unique(user_id,client_event_id));',
 'alter table public.app_diagnostic_events enable row level security;',
 'grant usage on schema auth to authenticated;',
 'grant select,insert on public.app_diagnostic_events to authenticated;',
 'create policy app_diagnostic_events_admin_read on public.app_diagnostic_events for select to authenticated using ((select public.current_user_is_admin()));',
 'create policy app_diagnostic_events_insert_own on public.app_diagnostic_events for insert to authenticated with check ((select auth.uid()) = user_id);',
].join('\n'));
await db.exec('set role authenticated');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
await db.query("select set_config('app.test_admin','no',false)");
// RED: old RLS contract rejects INSERT ON CONFLICT even for a new event.
await assert.rejects(() => db.query(
  "insert into public.app_diagnostic_events(user_id,client_event_id) values($1,'diag-00000001') on conflict (user_id,client_event_id) do nothing",
  [A]
), err => err.code === '42501', 'Codex D8 original worker upsert must fail before policy');
await db.exec('reset role');
await db.exec(sql);
await db.exec('set role authenticated');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
await db.query("select set_config('app.test_admin','no',false)");
// GREEN: original upsert works for an ordinary worker and repeat is idempotent.
for (let i=0;i<2;i++) await db.query(
  "insert into public.app_diagnostic_events(user_id,client_event_id) values($1,'diag-00000001') on conflict (user_id,client_event_id) do nothing",
  [A]
);
let own = await db.query("select client_event_id from public.app_diagnostic_events");
assert.equal(own.rows.length,1);
assert.equal(own.rows[0].client_event_id,'diag-00000001');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[B]);
own = await db.query("select * from public.app_diagnostic_events");
assert.equal(own.rows.length,0,'worker B cannot read A');
await assert.rejects(()=>db.query(
  "insert into public.app_diagnostic_events(user_id,client_event_id) values($1,'diag-00000002') on conflict (user_id,client_event_id) do nothing",
  [A]
),e=>e.code==='42501','B cannot forge A identity');
await assert.rejects(()=>db.query("update public.app_diagnostic_events set event_type='fake' where user_id=$1",[A]),
 e=>e.code==='42501','employees must not UPDATE event');
await db.query("select set_config('app.test_admin','yes',false)");
const asAdmin=await db.query("select * from public.app_diagnostic_events");
assert.equal(asAdmin.rows.length,1,'admin retains team visibility');
await db.exec('reset role');
await db.exec('set role anon');
await assert.rejects(()=>db.query("select * from public.app_diagnostic_events"),e=>e.code==='42501','anon denied');
await db.exec('reset role');
await db.close();
console.log('PASS Codex D8: original upsert RED=42501; worker own insert+retry GREEN; cross-user/anon denied; admin reads.');
