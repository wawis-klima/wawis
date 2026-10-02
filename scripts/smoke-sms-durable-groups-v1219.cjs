const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const migration = read('supabase/migrations/20261002070050_sms_durable_customer_groups_v1219.sql');
  assert.match(migration, /create table private\.sms_reminder_groups/i);
  assert.match(migration, /anchor_due_date date not null/i);
  assert.match(migration, /window_end_date date not null/i);
  assert.match(migration, /window_end_date = anchor_due_date \+ 62/i);
  assert.match(migration, /with recursive normalized/i);
  assert.match(migration, /when o\.due_date <= c\.anchor_due_date \+ 62 then c\.anchor_due_date/i);
  assert.match(migration, /reminder_group_id uuid/i);
  assert.match(migration, /reminder_group_primary boolean not null default false/i);
  assert.match(migration, /uq_sms_log_reminder_group_primary/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /hashtextextended\(v_customer_key, 0\)/i);
  assert.match(migration, /create or replace function public\.ensure_service_sms_group/i);
  assert.match(migration, /create or replace function public\.claim_service_sms_group/i);
  assert.match(migration, /v_delivery_key := 'group:' \|\| v_group_id::text/i);
  assert.match(migration, /grant execute on function public\.claim_service_sms_group\(text, date, uuid, uuid, integer\) to service_role/i);
  assert.match(migration, /revoke all on function public\.claim_service_sms_group\(text, date, uuid, uuid, integer\) from authenticated/i);
  assert.match(migration, /reminder_group_anchor_date/i);
  assert.match(migration, /reminder_group_window_end_date/i);

  const delivery = read('supabase/functions/send-service-sms/delivery.ts');
  assert.match(delivery, /claim_service_sms_group_v2/);
  assert.match(delivery, /p_log_id:\s*logId/);
  assert.match(delivery, /p_job_id:\s*jobId/);
  assert.match(delivery, /p_device_id:\s*deviceId/);
  assert.match(delivery, /reminder_group_id/);
  assert.match(delivery, /reminderGroupId/);
  assert.doesNotMatch(delivery, /rpc\('claim_service_sms_group'\s*,/);

  const sender = read('supabase/functions/send-service-sms/index.ts');
  assert.match(sender, /currentDueDate/);
  assert.match(sender, /recipientPhone/);
  assert.match(sender, /logId:\s*log\.id/);
  assert.doesNotMatch(sender, /dueDate:\s*effectiveDueDate/);
  assert.match(sender, /idx:\s*toSmsApiIdx\(prepared\.claimId\)/);
  assert.match(sender, /check_idx:\s*"1"/);
  assert.doesNotMatch(sender, /upsertFinalizedCycleLog/);
  assert.doesNotMatch(sender, /updateSmsLogInsert/);
  assert.match(delivery, /stage_service_sms_claim/);
  assert.match(delivery, /record_service_sms_acceptance/);

  const generator = read('supabase/functions/generate-service-sms-queue/index.ts');
  assert.match(generator, /ensureServiceSmsGroup/);
  assert.match(generator, /ensure_service_sms_group/);
  assert.match(generator, /existingPrimaryGroupIds/);
  assert.match(generator, /reminder_group_id:\s*reminderGroupId/);
  assert.match(generator, /reminder_group_primary:\s*true/);
  assert.match(generator, /String\(insertError\.code \|\| ""\) === "23505"/);
  assert.doesNotMatch(generator, /existingCustomerWindows/);
  assert.doesNotMatch(generator, /hasCustomerReminderInWindow/);
  assert.doesNotMatch(generator, /rememberCustomerReminder/);

  const desktop = read('src/modules/sms.js');
  const mobile = read('src/mobile791/modules/sms.js');
  assert.equal(mobile, desktop, 'Desktop i mobile muszą używać identycznej logiki grup SMS.');
  assert.match(desktop, /getSmsReminderGroupId/);
  assert.match(desktop, /isPersistedReminderGroupMatch/);
  assert.match(desktop, /reminder_group_anchor_date/);
  assert.match(desktop, /group:\$\{reminderGroupId\}/);

  const sms = await import(pathToFileURL(path.join(root, 'src', 'modules', 'sms.js')).href);
  const base = {
    client: 'Klient Kotwica',
    phone: '48500600700',
    status: 'sent',
    sent_at: new Date().toISOString(),
  };
  const anchored = sms.groupSmsLogsByCustomerWindow([
    { ...base, id: 'a', reminder_due_date: '2026-01-01', reminder_cycle: 1 },
    { ...base, id: 'b', reminder_due_date: '2026-03-01', reminder_cycle: 2 },
    { ...base, id: 'c', reminder_due_date: '2026-04-30', reminder_cycle: 3 },
  ]);
  assert.equal(anchored.length, 2, '1/60/120 dni musi utworzyć dwie grupy, nie jeden łańcuch.');
  const sizes = anchored.map((row) => row.grouped_log_count).sort((a, b) => b - a);
  assert.deepEqual(sizes, [2, 1], 'Pierwsza grupa ma A+B, druga tylko C.');

  const durable = sms.groupSmsLogsByCustomerWindow([
    {
      ...base,
      id: 'd1',
      reminder_due_date: '2026-01-01',
      reminder_group_id: '11111111-1111-4111-8111-111111111111',
      reminder_group_anchor_date: '2026-01-01',
      reminder_group_window_end_date: '2026-03-04',
    },
    {
      ...base,
      id: 'd2',
      reminder_due_date: '2026-03-01',
      reminder_group_id: '11111111-1111-4111-8111-111111111111',
      reminder_group_anchor_date: '2026-01-01',
      reminder_group_window_end_date: '2026-03-04',
    },
  ]);
  assert.equal(durable.length, 1, 'Logi z tym samym reminder_group_id muszą być jedną trwałą grupą.');
  assert.equal(durable[0].grouped_log_count, 2);

  console.log('SMS durable customer groups v12.19 smoke OK');
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
