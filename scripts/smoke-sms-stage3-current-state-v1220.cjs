const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const migration = read('supabase/migrations/20261002073753_sms_stage3_current_state_calendar_v1220.sql');
  assert.match(migration, /alter column sms_consent set default true/i);
  assert.match(migration, /alter column sms_reminder_enabled set default true/i);
  assert.match(migration, /private\.normalize_sms_phone/);
  assert.match(migration, /private\.sms_source_job_uuid/);
  assert.match(migration, /private\.service_sms_due_date/);
  assert.match(migration, /claim_service_sms_group_v2/);
  assert.match(migration, /Europe\/Warsaw/);
  assert.match(migration, /v_job\.sms_consent is not true/);
  assert.match(migration, /v_job\.sms_reminder_enabled is not true/);
  assert.match(migration, /missing_linked_job_consent/);
  assert.match(migration, /invalid_current_phone/);
  assert.match(migration, /outside_active_window/);
  assert.match(migration, /p_log_id uuid/);
  assert.match(migration, /for update/i);
  assert.match(migration, /revoke all on function public\.claim_service_sms_group_v2\(uuid, uuid, uuid, integer\) from authenticated/i);
  assert.match(migration, /grant execute on function public\.claim_service_sms_group_v2\(uuid, uuid, uuid, integer\) to service_role/i);

  for (const jobsPath of ['src/modules/jobs-form.js', 'src/mobile791/modules/jobs-form.js']) {
    const jobs = read(jobsPath);
    assert.match(jobs, /sms_consent:\s*true,/);
    assert.match(jobs, /sms_reminder_enabled:\s*true,/);
  }

  const desktop = read('src/modules/sms.js');
  const mobile = read('src/mobile791/modules/sms.js');
  assert.equal(mobile, desktop, 'Desktop i mobile muszą używać identycznej domeny SMS.');
  assert.match(desktop, /Europe\/Warsaw/);
  assert.match(desktop, /addMonthsClampedIso/);
  assert.match(desktop, /isoDateToDay/);
  assert.match(desktop, /normalizeSourceJobId/);
  assert.match(desktop, /deviceSmsConsent/);
  assert.match(desktop, /deviceSmsReminderEnabled/);
  assert.match(desktop, /sms_consent:\s*hasAuthoritativeConsent \? linkedJob\?\.sms_consent === true : deviceSmsConsent/);
  assert.match(desktop, /sms_eligibility:\s*hasAuthoritativeConsent \? 'linked_job' : \(isLegacyDevice \? 'legacy_device' : 'missing_linked_job_consent'\)/);
  assert.doesNotMatch(desktop, /DAY_MS/);
  assert.doesNotMatch(desktop, /setMonth\(/);

  const sms = await import(pathToFileURL(path.join(root, 'src', 'modules', 'sms.js')).href);
  assert.equal(sms.calculateServiceDueDate('2025-03-31'), '2026-02-28');
  assert.equal(sms.calculateServiceDueDate('2023-03-31'), '2024-02-29');
  assert.equal(sms.calculateServiceDueDate('2026-01-31'), '2026-12-31');

  const schedule = sms.getReminderSchedule('2025-03-31', 2);
  assert.equal(schedule[0].dueDate, '2026-02-28');
  assert.equal(schedule[0].expiresOn, '2026-05-01');
  assert.equal(schedule[1].dueDate, '2027-02-28');
  assert.equal(schedule[0].expiresDay - schedule[0].dueDay, 62);

  const job = {
    id: 'job-a',
    client: 'Klient urządzeń',
    phone: '500600700',
    sms_recipient_phone: '500600700',
    sms_consent: true,
    sms_reminder_enabled: true,
    service_reminder_years: 5,
  };
  const targets = sms.buildSmsTargets({
    jobs: [job],
    devices: [
      { id: 'dev-a', source_job_id: 'job-a::device-1', installation_date: '2025-03-31', model: 'A', serial_number: 'A1' },
      { id: 'dev-b', source_job_id: 'job-a::device-2', installation_date: '2025-06-30', model: 'B', serial_number: 'B1' },
    ],
  });
  assert.equal(targets.length, 2, 'Każde urządzenie musi zachować własny harmonogram.');
  assert.ok(targets.every((row) => row.target_type === 'device'));
  assert.deepEqual(targets.map((row) => row.source_job_id), ['job-a', 'job-a']);
  assert.deepEqual(targets.map((row) => row.installation_date).sort(), ['2025-03-31', '2025-06-30']);
  assert.ok(targets.every((row) => row.sms_consent === true && row.sms_reminder_enabled === true));

  const orphan = sms.buildSmsTargets({
    jobs: [],
    devices: [{ id: 'orphan', source_job_id: '', installation_date: '2025-03-31', contractor_phone: '500600700' }],
  });
  assert.equal(orphan.length, 1);
  assert.equal(orphan[0].sms_consent, false);
  assert.equal(orphan[0].sms_reminder_enabled, false);
  assert.equal(orphan[0].sms_eligibility, 'missing_linked_job_consent');

  const delivery = read('supabase/functions/send-service-sms/delivery.ts');
  assert.match(delivery, /claim_service_sms_group_v2/);
  assert.match(delivery, /p_log_id:\s*logId/);
  assert.match(delivery, /p_job_id:\s*jobId/);
  assert.match(delivery, /p_device_id:\s*deviceId/);
  assert.match(delivery, /recipient_phone/);
  assert.match(delivery, /current_due_date/);
  assert.doesNotMatch(delivery, /p_phone:/);
  assert.doesNotMatch(delivery, /p_due_date:/);

  const sender = read('supabase/functions/send-service-sms/index.ts');
  assert.match(sender, /logId:\s*log\.id/);
  assert.match(sender, /prepared\.recipientPhone/);
  assert.match(sender, /prepared\.currentDueDate/);
  assert.match(sender, /prepared\.installationDate/);
  assert.match(sender, /message:\s*currentMessage/);
  assert.doesNotMatch(sender, /calculateDueDate\(/);
  assert.doesNotMatch(sender, /function normalizePhone/);

  const generator = read('supabase/functions/generate-service-sms-queue/index.ts');
  assert.match(generator, /getWarsawIsoDate/);
  assert.match(generator, /Europe\/Warsaw/);
  assert.match(generator, /addMonthsClampedIso/);
  assert.match(generator, /addDaysIso/);
  assert.match(generator, /normalizeSourceJobId/);
  assert.match(generator, /linkedJob\.sms_consent === true/);
  assert.match(generator, /linkedJob\.sms_reminder_enabled === true/);
  assert.match(generator, /skippedOrphanCount/);
  assert.match(generator, /refreshedCount/);
  assert.doesNotMatch(generator, /groupedByJobCycle/);
  assert.doesNotMatch(generator, /standaloneItems/);
  assert.doesNotMatch(generator, /setMonth\(/);
  assert.doesNotMatch(generator, /ACTIVE_WINDOW_DAYS \* 24 \* 60 \* 60 \* 1000/);

  console.log('SMS stage 3 current-state/calendar v12.20 smoke OK');
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
