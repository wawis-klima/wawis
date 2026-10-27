// WAWIS 13.84 — wyłączanie martwych subskrypcji PUSH: prawdziwy SQL migracji wykonany w PGlite.
// Sprawdza regułę (7 dni + nowsze aktywne urządzenie tej samej osoby), brak usuwania, uprawnienia,
// zaplanowane zadanie i to, że klient odtwarza wyłączoną subskrypcję przy otwarciu aplikacji.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Treść błędu jako adnotacja GitHub — przyczyna widoczna bez pobierania logów CI.
const report = (error) => {
  console.log(`::error::smoke-push-stale-cleanup-v1384: ${String(error?.message || error).replace(/\s+/g, ' ').slice(0, 400)}`);
  process.exit(1);
};
process.on('uncaughtException', report);
process.on('unhandledRejection', report);

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const file = 'supabase/migrations/20261027091451_push_stale_subscription_cleanup_v1384.sql';
const migration = read(file);
const client = read('src/mobile791/modules/push-subscriptions.js');
assert.match(client, /existingServerRow\.is_active === false[\s\S]{0,400}replaceExpiredPushSubscription/,
  'klient musi odtworzyć subskrypcję, gdy serwer ma ją jako nieaktywną (samonaprawa po pomyłce)');
assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.push_subscriptions/i, 'reguła nie może usuwać subskrypcji');

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema private; create schema cron;
  create table cron.job(jobid serial primary key, jobname text, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values(n,s,c) returning jobid $$;
  create function cron.unschedule(id integer) returns boolean language sql as $$ delete from cron.job where jobid=id returning true $$;
  create table public.push_subscriptions(id serial primary key, user_id int, endpoint text unique, is_active boolean,
    created_at timestamptz, updated_at timestamptz, last_seen_at timestamptz, label text);
`);
const rows = [
  [1, 'A', true, 2, 0.1, 0.1], [1, 'B', true, 5, 4, 4], [1, 'C', true, 10, 9, 9],
  [2, 'D', true, 1, 0.05, 0.05], [2, 'E', true, 17, 8, 8],
  [3, 'F', true, 200, 46, 46],
  [4, 'G', true, 60, 30, 30], [4, 'H', true, 60, 20, 20],
  [5, 'I', false, 1, 0.05, 0.05], [5, 'J', true, 40, 20, 20],
  [6, 'K', true, 40, 30, null], [6, 'L', true, 2, 0.1, 0.1],
];
for (const [user, label, active, created, updated, seen] of rows) {
  await db.query(`insert into public.push_subscriptions(user_id,endpoint,is_active,created_at,updated_at,last_seen_at,label)
    values($1,$2,$3, now()-make_interval(secs=>$4::float8*86400), now()-make_interval(secs=>$5::float8*86400), ${seen === null ? 'null' : 'now()-make_interval(secs=>$6::float8*86400)'}, $2)`,
  seen === null ? [user, label, active, created, updated] : [user, label, active, created, updated, seen]);
}
await db.exec(migration);

const before = await db.query('select count(*)::int n from public.push_subscriptions where is_active');
assert.equal(before.rows[0].n, 11, 'sama migracja niczego nie wyłącza');
const first = await db.query('select private.deactivate_stale_push_subscriptions(7) n');
assert.equal(first.rows[0].n, 3);
const state = Object.fromEntries((await db.query('select label, is_active from public.push_subscriptions')).rows.map((r) => [r.label, r.is_active]));
assert.deepEqual(
  Object.keys(state).filter((k) => state[k] === false).sort(),
  ['C', 'E', 'I', 'K'],
  'wyłączone tylko: stare urządzenia osób z nowszym aktywnym urządzeniem (+ wcześniej nieaktywne I)'
);
for (const keep of ['A', 'B', 'D', 'F', 'G', 'H', 'J', 'L']) assert.equal(state[keep], true, `${keep} musi zostać aktywne`);
assert.equal((await db.query('select count(*)::int n from public.push_subscriptions')).rows[0].n, 12, 'nic nie usunięto');
assert.equal((await db.query('select private.deactivate_stale_push_subscriptions(7) n')).rows[0].n, 0, 'drugie uruchomienie bez zmian');
assert.equal((await db.query('select private.deactivate_stale_push_subscriptions(1) n')).rows[0].n, 1, 'minimum 3 dni (B ma 4 dni)');

const job = await db.query(`select schedule, command from cron.job where jobname='wawis-push-stale-cleanup-v1384'`);
assert.equal(job.rows.length, 1);
assert.match(job.rows[0].command, /deactivate_stale_push_subscriptions\(7\)/);
await db.exec(migration); // ponowne wykonanie: jedno zadanie, bez duplikatu
assert.equal((await db.query(`select count(*)::int n from cron.job where jobname='wawis-push-stale-cleanup-v1384'`)).rows[0].n, 1);
const priv = await db.query(`select has_function_privilege('authenticated','private.deactivate_stale_push_subscriptions(integer)','execute') a,
  has_function_privilege('anon','private.deactivate_stale_push_subscriptions(integer)','execute') b,
  has_function_privilege('service_role','private.deactivate_stale_push_subscriptions(integer)','execute') c`);
assert.deepEqual(priv.rows[0], { a: false, b: false, c: true });
await db.close();
console.log('PASS WAWIS 13.84 — martwe subskrypcje PUSH: reguła 7 dni + nowsze urządzenie, bez usuwania, jedna osoba = jedno urządzenie zostaje, zadanie dzienne, uprawnienia.');
