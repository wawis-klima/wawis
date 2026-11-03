// WAWIS 14.18 — codzienna kolejka SMS o 6:30 czasu polskiego, tylko poniedziałek–piątek (decyzja właściciela 03.11.2026).
// Prawdziwy PostgreSQL (PGlite): migracje 14.17 + 14.18 z atrapami pg_cron i pg_net.
// RED na 14.17: zadanie o 06:17/07:17/08:17 GMT codziennie, także w sobotę i niedzielę.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (name) => fs.readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const m1417 = read('20261103140000_sms_queue_daily_v1417.sql')
  .replace(/create extension if not exists pg_net with schema extensions;/, '');
const m1418 = read('20261103150000_sms_queue_daily_0630_v1418.sql');

const db = new PGlite();
await db.exec(`
  create schema auth; create schema private; create schema extensions; create schema net; create schema cron;
  create role anon; create role authenticated; create role service_role;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql as $$
    select decode(string_agg(lpad(to_hex((random() * 255)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
  create table net.calls (id serial primary key, url text, body jsonb);
  create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint
    language plpgsql as $$ declare v bigint; begin insert into net.calls(url, body) values (url, body) returning id into v; return v; end $$;
  create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language plpgsql as $$
    declare v bigint; begin insert into cron.job(jobname, schedule, command) values (n, s, c) returning jobid into v; return v; end $$;
  create function cron.unschedule(n text) returns boolean language plpgsql as $$
    begin delete from cron.job where jobname = n; return found; end $$;
  create table public.sms_log (id uuid primary key default gen_random_uuid(), sms_type text, status text,
    reminder_group_id uuid, reminder_group_primary boolean);
`);
await db.exec(m1417);
const before = await db.query('select jobname, schedule from cron.job');
assert.deepEqual(before.rows, [{ jobname: 'wawis-sms-queue-daily-v1417', schedule: '17 6,7,8 * * *' }], '14.17: stary harmonogram');
await db.exec(m1418);
await db.exec(m1418); // ponowne uruchomienie bez błędu i bez duplikatu

// 1. Harmonogram: tylko nowe zadanie, dni robocze, co 15 min 04:00–06:45 GMT.
const jobs = await db.query('select jobname, schedule, command from cron.job');
assert.deepEqual(jobs.rows, [{ jobname: 'wawis-sms-queue-daily-v1418', schedule: '*/15 4-6 * * 1-5', command: 'select private.run_sms_queue_daily_v1417();' }]);

// 2. Okno czasowe w czasie polskim — zima (+1) i lato (+2), weekend.
const windowAt = async (iso) => (await db.query('select private.sms_queue_daily_window_v1418($1::timestamptz) as ok', [iso])).rows[0].ok;
const cases = [
  ['2026-11-09T05:15:00Z', false, 'pon. zima 6:15 — za wcześnie'],
  ['2026-11-09T05:30:00Z', true, 'pon. zima 6:30 — start'],
  ['2026-11-09T06:45:00Z', true, 'pon. zima 7:45 — ponowienie'],
  ['2026-11-09T07:00:00Z', false, 'pon. zima 8:00 — po oknie'],
  ['2026-11-13T05:30:00Z', true, 'pt. zima 6:30'],
  ['2026-11-14T05:30:00Z', false, 'sobota'],
  ['2026-11-15T05:30:00Z', false, 'niedziela'],
  ['2027-06-07T04:15:00Z', false, 'pon. lato 6:15'],
  ['2027-06-07T04:30:00Z', true, 'pon. lato 6:30 — start'],
  ['2027-06-07T05:30:00Z', true, 'pon. lato 7:30'],
  ['2027-06-07T06:00:00Z', false, 'pon. lato 8:00 — po oknie'],
  ['2027-06-12T04:30:00Z', false, 'sobota latem'],
];
for (const [iso, expected, label] of cases) assert.equal(await windowAt(iso), expected, label);

// 3. Każdy tik harmonogramu (GMT) trafia w okno dokładnie wtedy, gdy powinien: pierwsza próba zawsze o 6:30.
for (const day of ['2026-11-09', '2027-06-07']) {
  const ticks = [];
  for (let h = 4; h <= 6; h += 1) for (const m of [0, 15, 30, 45]) {
    const iso = `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
    if (await windowAt(iso)) ticks.push(iso);
  }
  const first = (await db.query(`select to_char(($1::timestamptz at time zone 'Europe/Warsaw'), 'HH24:MI') as t`, [ticks[0]])).rows[0].t;
  assert.equal(first, '06:30', `${day}: pierwsza próba o 6:30 czasu polskiego`);
  assert.ok(ticks.length >= 4, `${day}: są próby zapasowe`);
}

// 4. Uruchomienie zadania: poza oknem nic nie robi (bez wpisu i bez wywołania funkcji Edge).
const inWindowNow = await windowAt(new Date().toISOString());
const ran = (await db.query('select private.run_sms_queue_daily_v1417() as n')).rows[0].n;
const runs = (await db.query('select count(*)::int as n from private.sms_queue_daily_runs_v1417')).rows[0].n;
const calls = (await db.query('select count(*)::int as n from net.calls')).rows[0].n;
if (inWindowNow) {
  assert.equal(ran, 1); assert.equal(runs, 1); assert.equal(calls, 1);
  assert.equal((await db.query('select private.run_sms_queue_daily_v1417() as n')).rows[0].n, 0, 'jedno wywołanie, ponowienie dopiero po 30 min');
} else {
  assert.equal(ran, 0, 'poza oknem: zadanie nic nie robi');
  assert.equal(runs, 0); assert.equal(calls, 0);
}

// 5. Migracja nie zmienia danych.
assert.doesNotMatch(m1418.replace(/--[^\n]*/g, ''), /\b(delete from|drop table|truncate|update public\.)/i);
const manifest = JSON.parse(fs.readFileSync(new URL('../supabase/rebuild/manifest-v1089.json', import.meta.url), 'utf8'));
assert.ok(manifest.files.includes('supabase/migrations/20261103150000_sms_queue_daily_0630_v1418.sql'), 'migracja w manifeście odtworzenia bazy');

await db.close();
console.log('PASS WAWIS 14.18 — kolejka SMS o 6:30 czasu polskiego, pon.–pt. (zima i lato), weekend bez zadania.');
