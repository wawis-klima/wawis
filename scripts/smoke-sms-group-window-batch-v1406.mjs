// WAWIS 14.06 — zgłoszenie 02.11.2026: „Nie mogę wysłać SMS-ów do klienta ani pojedynczo, ani grupowo …
// SMS dla tej grupy klienta został już wysłany.”
// Odtworzenie przypadku z produkcji (odczyt SELECT): klient z dwoma urządzeniami, termin 1. urządzenia 30.08
// (SMS wysłany 31.08, grupa 30.08–31.10), termin 2. urządzenia 02.10 (w tej samej grupie).
// Od 01.11 snapshot nie zwracał wpisu z 30.08 (filtr „termin z ostatnich 62 dni”), więc lista pokazywała
// klienta jako „do wysłania”, serwer słusznie odmawiał, a pierwsza odmowa przerywała wysyłkę pozostałych.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { buildSmsTargets, calculateServiceDueDate, deriveSmsQueue } from '../src/modules/sms.js';
import { formatSmsBatchResult, runSmsBatch } from '../src/modules/sms-batch-send.js';

// ---------- 1. Wysyłka zaznaczonych: odmowa jednego klienta nie zatrzymuje pozostałych ----------
const calls = [];
const steps = ['DROB - STEEL', 'BOGUSŁAWA MERTA', 'SKLEP HAMERLIK'].map((label, index) => ({
  label,
  run: async () => {
    calls.push(label);
    if (index === 0) throw new Error('SMS dla tej grupy klienta został już wysłany.');
    return 1;
  },
}));
let batch = await runSmsBatch(steps);
assert.deepEqual(calls, ['DROB - STEEL', 'BOGUSŁAWA MERTA', 'SKLEP HAMERLIK'], 'Wszyscy zaznaczeni klienci są próbowani, kolejno.');
assert.equal(batch.sentCount, 2);
assert.deepEqual(batch.failures, [{ label: 'DROB - STEEL', message: 'SMS dla tej grupy klienta został już wysłany.' }]);
let text = formatSmsBatchResult(batch);
assert.equal(text.info, 'Wysłano 2 wiadomości SMS.');
assert.equal(text.error, 'Nie wysłano (1): DROB - STEEL — SMS dla tej grupy klienta został już wysłany.');
batch = await runSmsBatch([{ label: 'A', run: async () => { throw new Error('x'); } }]);
assert.equal(batch.sentCount, 0);
assert.equal(formatSmsBatchResult(batch).info, '', 'Bez fałszywego „Wysłano 0”, gdy wszystko odrzucone.');
assert.equal(formatSmsBatchResult({ sentCount: 1, failures: [] }).info, 'Wysłano 1 wiadomość SMS.');

const panel = fs.readFileSync(new URL('../src/components/sms/SmsPanel.jsx', import.meta.url), 'utf8');
const sendSelected = panel.slice(panel.indexOf('async function handleSendSelected()'), panel.indexOf('async function handleSendNow(job)'));
assert.match(sendSelected, /await runSmsBatch\(steps, \{ describeError: normalizeDatabaseErrorMessage \}\)/);
assert.match(sendSelected, /window\.confirm\(/, 'Potwierdzenie przed wysyłką bez zmian.');
assert.match(sendSelected, /afterRefresh: \(\) => \{ if \(batchError\) setErrorMessage\(batchError\); \}/, 'Lista nieudanych po odświeżeniu (reload czyści błąd).');
// Każde wywołanie wysyłki jest wewnątrz kroku (run), nie w pętli przerywanej pierwszym błędem.
assert.doesNotMatch(sendSelected.replace(/run: async \(\) => [\s\S]*?\n        \}\)\),|run: async \(\) => \(await [^\n]*\n/g, ''), /await sendManualServiceSms|await sendUnsentSmsLog|await approveAndSendSmsLogs/);

// ---------- 2. Snapshot zwraca wpis grupy, której okno nadal obejmuje aktywne przypomnienie ----------
const isoDay = (date) => date.toISOString().slice(0, 10);
const warsawToday = new Date(`${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date())}T00:00:00Z`);
const shift = (days) => { const d = new Date(warsawToday); d.setUTCDate(d.getUTCDate() + days); return d; };
const minusMonths = (date, months) => { const d = new Date(date); d.setUTCMonth(d.getUTCMonth() - months); return d; };
const install1 = isoDay(minusMonths(shift(-64), 11));
const install2 = isoDay(minusMonths(shift(-31), 11));
const due1 = calculateServiceDueDate(install1);
const due2 = calculateServiceDueDate(install2);
const dayDiff = (a, b) => Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);
const today = isoDay(warsawToday);
assert.ok(dayDiff(today, due1) > 62, `Termin 1 poza starym filtrem: ${due1}`);
assert.ok(dayDiff(today, due2) <= 62 && dayDiff(today, due2) >= 0, `Termin 2 aktywny: ${due2}`);
assert.ok(dayDiff(due2, due1) <= 62, 'Termin 2 w oknie grupy terminu 1.');
const windowEnd = isoDay(new Date(new Date(`${due1}T00:00:00Z`).getTime() + 62 * 86400000));

const oldMigration = fs.readFileSync(new URL('../supabase/migrations/20261006055831_sms_snapshot_customer_identity_v1257.sql', import.meta.url), 'utf8');
const newMigration = fs.readFileSync(new URL('../supabase/migrations/20261102090000_sms_snapshot_group_window_v1406.sql', import.meta.url), 'utf8');

const contractor = '81000000-0000-4000-8000-000000000001';
const device1 = '82000000-0000-4000-8000-000000000001';
const device2 = '82000000-0000-4000-8000-000000000002';
const group = '83000000-0000-4000-8000-000000000001';
const sentLog = '84000000-0000-4000-8000-000000000001';
const oldLog = '84000000-0000-4000-8000-000000000002';

async function snapshotLogs(migration) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.jwt() returns jsonb language sql stable set search_path to '' as $$ select '{"role":"service_role"}'::jsonb $$;
    create function public.current_user_is_admin() returns boolean language sql stable set search_path to '' as $$ select true $$;
    create function private.normalize_sms_phone(p_phone text) returns text language sql immutable set search_path to ''
      as $$ select nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'') $$;
    create function private.sms_log_is_retryable_failure(text,text,timestamptz,timestamptz) returns boolean language sql immutable set search_path to '' as $$ select false $$;
    create function private.sms_log_blocks_retry(text,text,timestamptz,timestamptz) returns boolean language sql immutable set search_path to '' as $$ select false $$;
    create table private.sms_reminder_groups(id uuid primary key, customer_key text not null, normalized_phone text not null, anchor_due_date date not null, window_end_date date not null);
    create table public.sms_log(id uuid primary key, job_id uuid, device_id uuid, client text, phone text, sms_type text not null default 'service_reminder',
      provider text, provider_message_id text, status text not null, planned_for timestamptz, approved_at timestamptz, sent_at timestamptz,
      delivered_at timestamptz, error_message text, reminder_cycle integer, reminder_due_date date, reminder_group_id uuid,
      reminder_group_primary boolean not null default false, retry_of_log_id uuid, created_at timestamptz not null default now());
    create table public.sms_settings(id uuid primary key, is_enabled boolean, sending_mode text, sender_name text, service_phone text, company_name text,
      template_service_reminder text, created_at timestamptz not null default now(), updated_at timestamptz);
    create table private.sms_delivery_claims(retry_of_log_id uuid);
  `);
  await db.exec(migration);
  await db.exec(`
    insert into private.sms_reminder_groups values ('${group}','contractor:${contractor}','48512000111','${due1}','${windowEnd}');
    insert into public.sms_log(id,device_id,client,phone,status,provider_message_id,sent_at,reminder_cycle,reminder_due_date,reminder_group_id,reminder_group_primary)
      values ('${sentLog}','${device1}','Klient','48512000111','sent','prov-1',now(),1,'${due1}','${group}',true);
    -- Stary, zamknięty wpis (okno grupy dawno minęło) nie trafia do snapshotu ani przed, ani po zmianie.
    insert into public.sms_log(id,device_id,client,phone,status,reminder_cycle,reminder_due_date)
      values ('${oldLog}','${device1}','Klient','48512000111','deleted',1,'${isoDay(shift(-400))}');
  `);
  const { rows } = await db.query('select public.admin_get_sms_module_snapshot() as r');
  await db.close();
  return rows[0].r.queue_logs;
}

const oldLogs = await snapshotLogs(oldMigration);
const newLogs = await snapshotLogs(newMigration);
assert.equal(oldLogs.some((l) => l.id === sentLog), false, 'Odtworzenie: stary snapshot gubi wpis grupy.');
assert.equal(newLogs.some((l) => l.id === sentLog), true, '14.06: snapshot zwraca wpis grupy obejmującej aktywny termin.');
assert.equal(newLogs.some((l) => l.id === oldLog), false, 'Dawne wpisy nadal pomijane.');

// ---------- 3. Lista „do wysłania”: klient objęty wysłanym SMS-em grupy nie jest pokazywany ----------
const devices = [
  { id: device1, contractor_id: contractor, contractor_name: 'DROB - STEEL', contractor_phone: '512000111', installation_date: install1, sms_consent: true, sms_reminder_enabled: true },
  { id: device2, contractor_id: contractor, contractor_name: 'DROB - STEEL', contractor_phone: '512000111', installation_date: install2, sms_consent: true, sms_reminder_enabled: true },
  { id: '82000000-0000-4000-8000-000000000003', contractor_id: '81000000-0000-4000-8000-000000000002', contractor_name: 'BOGUSŁAWA MERTA', contractor_phone: '600000111', installation_date: install2, sms_consent: true, sms_reminder_enabled: true },
];
const names = (logs) => deriveSmsQueue(buildSmsTargets({ jobs: [], devices }), logs).map((row) => row.client).sort();
assert.deepEqual(names(oldLogs), ['BOGUSŁAWA MERTA', 'DROB - STEEL'], 'Odtworzenie: klient z wysłanym SMS-em widoczny jako „do wysłania”.');
assert.deepEqual(names(newLogs), ['BOGUSŁAWA MERTA'], '14.06: klient objęty SMS-em grupy ukryty, inni bez zmian.');

console.log('WAWIS 14.06 SMS group window + batch send: PASS');
