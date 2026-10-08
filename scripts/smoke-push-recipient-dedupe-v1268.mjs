import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const edge = read('supabase/functions/send-assignment-push/index.ts');
const migration = read('supabase/migrations/current/20261008133000_push_recipient_dedup_v1268.sql');

for (const snippet of [
  'authorizedInstallerIds',
  'Odbiorca PUSH nie jest aktualnie przypisanym monterem.',
  'Brak dostępu do przypisań tego montażu.',
  'job.push_assignment_epoch',
  'job.completed_by',
  'job_completed:',
  'job_comment:',
  'push_claim_delivery_v1268',
  'if (claimError)',
  'if (claimed !== true)',
]) assert(edge.includes(snippet), `Missing contract: ${snippet}`);
assert(!edge.includes('claimed !== true) {\n        // continue sending'), 'Claim failure must fail closed');
assert(edge.indexOf('push_claim_delivery_v1268') < edge.indexOf('await createDeliveryAttempt(adminClient, {'),
  'Reservation must happen before provider attempt');
assert(edge.includes('if (eventKey && !attempt?.id)'));

// Execute the real SQL guard with local PostgreSQL — not just static grep.
const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema private;
  create or replace function auth.role() returns text language sql stable as $$
    select current_setting('request.jwt.claim.role',true)
  $$;
  create table public.jobs (
    id uuid primary key,
    status text,
    installer_ids uuid[],
    main_technician_id uuid,
    push_assignment_epoch bigint
  );
  create table public.push_subscriptions (
    id uuid primary key,
    user_id uuid not null,
    is_active boolean not null default true
  );
  grant usage on schema public to authenticated, service_role;
  grant insert,select,update on public.jobs to authenticated,service_role;
  grant select,insert,update on public.push_subscriptions to service_role;
`);
await db.exec(migration);
const job='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sub='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
await db.query('insert into public.jobs (id,installer_ids) values ($1,$2)',[job,[user]]);
let ep=await db.query('select push_assignment_epoch from public.jobs where id=$1',[job]);
assert.equal(Number(ep.rows[0].push_assignment_epoch),1,'Assignment epoch starts at 1 for assigned job');
await db.query("update public.jobs set status='W trakcie' where id=$1",[job]);
ep=await db.query('select push_assignment_epoch from public.jobs where id=$1',[job]);
assert.equal(Number(ep.rows[0].push_assignment_epoch),1,'Status changes must not create a new assignment event');
await db.query('update public.jobs set installer_ids=$1 where id=$2',[[],job]);
ep=await db.query('select push_assignment_epoch from public.jobs where id=$1',[job]);
assert.equal(Number(ep.rows[0].push_assignment_epoch),2,'Removing installer increments epoch');
await db.query('update public.jobs set installer_ids=$1 where id=$2',[[user],job]);
ep=await db.query('select push_assignment_epoch from public.jobs where id=$1',[job]);
assert.equal(Number(ep.rows[0].push_assignment_epoch),3,'Reassigning installer creates a new event');
await db.query('insert into public.push_subscriptions(id,user_id,is_active) values($1,$2,true)',[sub,user]);
await db.exec('set role authenticated');
await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
await assert.rejects(
  () => db.query('select public.push_claim_delivery_v1268($1,$2,$3)',[sub,user,'job_assigned:1']),
  (err) => err?.code==='42501',
  'Employee must not claim provider delivery events directly',
);
await db.exec('reset role');
await db.exec('set role service_role');
await db.query("select set_config('request.jwt.claim.role','service_role',false)");
async function claim(key, recipient=user) {
  const r=await db.query('select public.push_claim_delivery_v1268($1,$2,$3) as claimed',[sub,recipient,key]);
  return r.rows[0].claimed;
}
assert.equal(await claim('job_assigned:job:1'),true);
assert.equal(await claim('job_assigned:job:1'),false,'Same event must not dispatch twice');
assert.equal(await claim('job_assigned:job:3'),true,'Reassignment must allow a later event');
assert.equal(await claim('job_assigned:job:4','dddddddd-dddd-4ddd-8ddd-dddddddddddd'),false,'Foreign recipient must not claim endpoint');
await db.query('update public.push_subscriptions set is_active=false where id=$1',[sub]);
assert.equal(await claim('job_assigned:job:5'),false,'Inactive endpoint cannot claim');
await db.exec('reset role');
const rows=await db.query('select count(*)::integer as c from private.push_dispatch_claims_v1268');
assert.equal(rows.rows[0].c,2);
await db.close();
console.log('PASS v12.68: authorized push event claim, dedupe, reassignment, inactive endpoint and SQL trigger');
