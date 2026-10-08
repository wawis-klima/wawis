import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { getSmsReminderCycleLabel } from '../src/modules/sms-reminder-cycle-label.js';
import { getReminderSchedule } from '../src/modules/sms.js';
import { normalizeDatabaseErrorMessage } from '../src/modules/database-errors.js';
import { validateJobDevicesForCompletion } from '../src/modules/job-device-completion-validation.js';

for (let cycle = 1; cycle <= 5; cycle++) {
  const label = getSmsReminderCycleLabel({ reminder_cycle: cycle });
  assert.equal(label, `${cycle}. cykl przypomnienia`);
}
assert.equal(getSmsReminderCycleLabel({ reminder_cycle: null }), '');
assert.equal(getSmsReminderCycleLabel({ reminder_cycle: 0 }), '');
assert.equal(getSmsReminderCycleLabel({ reminder_cycle: -1 }), '');
assert.equal(getSmsReminderCycleLabel({ grouped_logs: [{ reminder_cycle: 1 }, { reminder_cycle: 3 }] }), 'Cykle przypomnień: 1., 3.');
assert.equal(getSmsReminderCycleLabel({ reminder_cycle: 'nieznany' }), '');
assert.equal(getSmsReminderCycleLabel({ grouped_sms_rows: [
  { reminder_cycle: 2 }, { reminder_cycle: 2 },
] }), '2. cykl przypomnienia');
assert.equal(getSmsReminderCycleLabel({ grouped_sms_rows: [
  { reminder_cycle: 1 }, { reminder_cycle: 3 },
] }), 'Cykle przypomnień: 1., 3.');
assert.equal(getSmsReminderCycleLabel({ reminder_cycle: 2, grouped_sms_rows: [
  { reminder_cycle: null }, { reminder_cycle: null },
] }), '');
const schedule = getReminderSchedule('2020-10-08', 5);
assert.deepEqual(schedule.map((x) => x.cycle), [1, 2, 3, 4, 5]);
// The label must come from the scheduled reminder cycle, not send attempt count.
assert.equal(getSmsReminderCycleLabel({ reminder_cycle: schedule[3].cycle, grouped_logs: [
  { status: 'not_sent', reminder_cycle: 4 }, { status: 'sent', reminder_cycle: 4 }
] }), '4. cykl przypomnienia');

for (const filename of ['SmsQueueTable.jsx', 'SmsSentThisMonthCard.jsx']) {
  const source = fs.readFileSync(new URL(`../src/components/sms/${filename}`, import.meta.url), 'utf8');
  assert.match(source, /row\.cycleLabel/);
  assert.match(source, /smsDesktopCycleLabel/);
}
const panel = fs.readFileSync(new URL('../src/components/sms/SmsPanel.jsx', import.meta.url), 'utf8');
assert.match(panel, /cycleLabel: getSmsReminderCycleLabel\(row\)/);
assert.match(panel, /cycleLabel: getSmsReminderCycleLabel\(log\)/);

// Replace the old brittle tabliczka-only check with an executable model-pair regression.
const validPair = validateJobDevicesForCompletion({ devices: [{
  device_type: 'single-split',
  indoor_models: ['Rotenso Imoto I35Xi'],
  outdoor_model: 'Rotenso Imoto I35Xo',
}] });
assert.equal(validPair.ok, true, validPair.message);
const missingIndoor = validateJobDevicesForCompletion({ devices: [{
  device_type: 'single-split', indoor_models: [''], outdoor_model: 'Rotenso Imoto I35Xo',
}] });
assert.equal(missingIndoor.ok, false);
assert.equal(missingIndoor.code, 'missing_indoor');
const wrongFamily = validateJobDevicesForCompletion({ devices: [{
  device_type: 'single-split', indoor_models: ['Rotenso Ukura U35Xi'],
  outdoor_model: 'Rotenso Imoto I35Xo',
}] });
assert.equal(wrongFamily.ok, false);
assert.equal(wrongFamily.code, 'single_pair_mismatch');
const validMulti = validateJobDevicesForCompletion({ devices: [{
  device_type: 'multi-split', indoor_models: ['Rotenso Imoto I26Xi', 'Rotenso Imoto I35Xi'],
  outdoor_model: 'Rotenso Hiro Multi H50Xm2',
}] });
assert.equal(validMulti.ok, true, validMulti.message);

assert.match(normalizeDatabaseErrorMessage({ message: 'job_device_models_incomplete:JW' }), /wewnętrznej.*zewnętrznej/i);

const migration = fs.readFileSync(
  new URL('../supabase/migrations/current/20261008105757_job_device_models_completion_v1267.sql', import.meta.url), 'utf8',
);
const additionalGuard = fs.readFileSync(new URL('../supabase/migrations/current/20261008150000_completion_jw_index_guard_v1269.sql',import.meta.url),'utf8');
const db = new PGlite();
await db.exec(`
  create schema auth;
  create schema private;
  create role anon;
  create role authenticated;
  create role service_role;
  create function auth.role() returns text language sql stable as $$
    select current_setting('request.jwt.claim.role',true)
  $$;
  create table public.jobs (
    id uuid primary key,
    status text,
    device_model text,
    device_serial_number text
  );
  grant select,insert,update on public.jobs to authenticated;
`);
await db.exec(migration);
await db.exec(additionalGuard);
await db.exec('set role authenticated');
await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
await db.query('insert into public.jobs(id,status,device_model) values ($1,$2,$3)',[id,'W trakcie','JW: Rotenso Ukura | JZ: Rotenso Ukura']);
async function rejectInvalid(model, label) {
  await db.query('update public.jobs set status=$1,device_model=$2 where id=$3',['W trakcie',model,id]);
  await assert.rejects(
    () => db.query('update public.jobs set status=$1 where id=$2',['Zakończone',id]),
    (error) => error?.code === '23514', label,
  );
}
await rejectInvalid('', 'empty job');
await rejectInvalid('JZ: Rotenso Ukura', 'missing JW');
await rejectInvalid('JW: Rotenso Ukura', 'missing JZ');
await rejectInvalid('JW:  | JZ: Rotenso Ukura', 'empty JW');
await rejectInvalid('JW: Rotenso Ukura | JZ: ', 'empty JZ');
await rejectInvalid('JW: Rotenso Ukura | JZ: Rotenso Ukura\nJZ: Inny', 'each serialized device must have JW');
await rejectInvalid('Rotenso Ukura', 'legacy unstructured model must not evade the new completion guard');
await rejectInvalid('JW1: Jednostka A | JW3: Jednostka C | JZ: Zewnętrzna', 'JW1/JW3 gap is forbidden');
await rejectInvalid('JW1: Jednostka A | JW1: Jednostka B | JZ: Zewnętrzna', 'duplicated JW index is forbidden');

await db.query('update public.jobs set status=$1,device_model=$2 where id=$3',
 ['Zakończone','JW: Rotenso Ukura | JZ: Rotenso Ukura',id]);
const saved = await db.query('select status from public.jobs where id=$1',[id]);
assert.equal(saved.rows[0].status,'Zakończone');
await assert.rejects(
  () => db.query('update public.jobs set device_model=$1 where id=$2',['JZ: Tylko zewnętrzna',id]),
  (error) => error?.code==='23514',
  'a completed job must not lose its JW by later model edits',
);
await db.query('update public.jobs set device_model=$1 where id=$2',
 ['JW1: Wewnętrzna A | JW2: Wewnętrzna B | JZ: Zewnętrzna',id]);
await db.exec('reset role');
await db.query('update public.jobs set status=$1,device_model=$2 where id=$3',['W trakcie','JZ: Tylko JZ',id]);
await db.exec('set role service_role');
await db.query("select set_config('request.jwt.claim.role','service_role',false)");
await assert.rejects(
  () => db.query('update public.jobs set status=$1 where id=$2',['Zakończone',id]),
  (error) => error?.code === '23514',
  'privileged service role must not bypass JW/JZ integrity',
);
await db.exec('reset role');
console.log('PASS v12.69: JW/JZ completeness guarded by SQL, cycles 1–5 and grouping rendered without retry inflation.');
