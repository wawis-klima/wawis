const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonths(date, months) {
  const result = new Date(date.getTime());
  const dayOfMonth = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(dayOfMonth, lastDay));
  return result;
}

(async () => {
  const smsModule = await import(pathToFileURL(path.join(root, 'src', 'modules', 'sms.js')).href);
  const today = new Date();
  const installationDueToday = formatIsoDate(addMonths(new Date(today.getTime() - (24 * 60 * 60 * 1000)), -11));

  const jobs = [{
    id: 'job-1',
    client: 'Jan Kowalski',
    title: 'Montaż Jan Kowalski',
    phone: '500600700',
    sms_recipient_phone: '500600700',
    sms_consent: true,
    sms_reminder_enabled: true,
    installation_date: installationDueToday,
    service_reminder_years: 5,
    city: 'Warszawa',
    street: 'Testowa 1',
  }];

  const devices = [
    { id: 'device-1', source_job_id: 'job-1', contractor_name: 'Jan Kowalski', contractor_phone: '500600700', contractor_city: 'Warszawa', contractor_street: 'Testowa 1', model: 'Klimatyzator A', serial_number: 'AAA', installation_date: installationDueToday, service_reminder_years: 5 },
    { id: 'device-2', source_job_id: 'job-1', contractor_name: 'Jan Kowalski', contractor_phone: '500600700', contractor_city: 'Warszawa', contractor_street: 'Testowa 1', model: 'Klimatyzator B', serial_number: 'BBB', installation_date: installationDueToday, service_reminder_years: 5 },
  ];

  const targets = smsModule.buildSmsTargets({ jobs, devices });
  assert.equal(targets.length, 2, 'Etap 3 musi zachować dwa osobne targety urządzeń przed grupowaniem SMS.');
  assert.ok(targets.every((target) => target.target_type === 'device'));
  assert.deepEqual(targets.map((target) => target.id).sort(), ['device-1', 'device-2']);
  assert.ok(targets.every((target) => target.grouped_device_count === 1));

  const queue = smsModule.deriveSmsQueue(targets, []);
  assert.equal(queue.length, 1, 'Kolejka SMS powinna nadal pokazać jeden wpis dla klienta z dwoma urządzeniami w tym samym oknie.');
  assert.equal(queue[0].grouped_device_count, 2);
  assert.match(queue[0].selectionKey, /^sms:/);

  const legacyPendingLogs = [
    { id: 'log-device-1', device_id: 'device-1', job_id: 'job-1', status: 'pending_approval', reminder_cycle: queue[0].reminder_cycle, created_at: new Date().toISOString() },
    { id: 'log-device-2', device_id: 'device-2', job_id: 'job-1', status: 'pending_approval', reminder_cycle: queue[0].reminder_cycle, created_at: new Date().toISOString() },
  ];
  const legacyQueue = smsModule.deriveSmsQueue(targets, legacyPendingLogs);
  assert.equal(legacyQueue.length, 1, 'Stare osobne logi urządzeń też muszą być widoczne jako jeden wpis.');
  assert.equal(legacyQueue[0].queueLog.id, 'log-device-1');

  const finalizedQueue = smsModule.deriveSmsQueue(targets, [
    { ...legacyPendingLogs[1] },
    { id: 'sent-device-1', device_id: 'device-1', job_id: 'job-1', status: 'sent', reminder_cycle: queue[0].reminder_cycle, sent_at: new Date().toISOString() },
  ]);
  assert.equal(finalizedQueue.length, 0, 'Po wysłaniu jednego SMS-a do montażu duplikaty urządzeń nie mogą wrócić na listę.');

  const secondJobTargets = smsModule.buildSmsTargets({
    jobs: [
      { ...jobs[0], device_model: 'Klimatyzator A', device_serial_number: 'AAA' },
      {
        ...jobs[0],
        id: 'job-2',
        client: 'Jan Kowalski',
        title: 'Drugi montaż Jan Kowalski',
        phone: '500 600 700',
        sms_recipient_phone: '500 600 700',
        device_model: 'Klimatyzator C',
        device_serial_number: 'CCC',
      },
    ],
    devices: [],
  });
  const customerQueue = smsModule.deriveSmsQueue(secondJobTargets, []);
  assert.equal(customerQueue.length, 1, 'Dwa zlecenia tego samego klienta w tym samym terminie powinny dać jeden SMS.');
  assert.equal(customerQueue[0].customer_grouped, true);
  assert.equal(customerQueue[0].grouped_sms_rows.length, 2);
  assert.equal(customerQueue[0].grouped_device_count, 2);
  assert.match(customerQueue[0].selectionKey, /^sms:/);

  const customerPendingQueue = smsModule.deriveSmsQueue(secondJobTargets, [
    { id: 'log-job-1', job_id: 'job-1', status: 'pending_approval', reminder_cycle: customerQueue[0].reminder_cycle, reminder_due_date: customerQueue[0].reminder_due_date, phone: '48500600700', created_at: new Date().toISOString() },
    { id: 'log-job-2', job_id: 'job-2', status: 'pending_approval', reminder_cycle: customerQueue[0].reminder_cycle, reminder_due_date: customerQueue[0].reminder_due_date, phone: '48500600700', created_at: new Date().toISOString() },
  ]);
  assert.equal(customerPendingQueue.length, 1, 'Stare dwa oczekujące logi klienta muszą być widoczne jako jedno zlecenie SMS.');
  assert.deepEqual(customerPendingQueue[0].grouped_queue_log_ids.sort(), ['log-job-1', 'log-job-2']);

  const customerFinalizedQueue = smsModule.deriveSmsQueue(secondJobTargets, [
    { id: 'sent-job-1', job_id: 'job-1', status: 'sent', reminder_cycle: customerQueue[0].reminder_cycle, reminder_due_date: customerQueue[0].reminder_due_date, phone: '48500600700', sent_at: new Date().toISOString() },
    { id: 'log-job-2', job_id: 'job-2', status: 'pending_approval', reminder_cycle: customerQueue[0].reminder_cycle, reminder_due_date: customerQueue[0].reminder_due_date, phone: '48500600700', created_at: new Date().toISOString() },
  ]);
  assert.equal(customerFinalizedQueue.length, 0, 'Po wysłaniu jednego SMS-a do klienta pozostałe zlecenia klienta z tego samego terminu nie mogą wrócić na listę.');

  const dueA = new Date(today.getTime() - (20 * 24 * 60 * 60 * 1000));
  const dueB = new Date(today.getTime() - (5 * 24 * 60 * 60 * 1000));
  const standaloneTargets = smsModule.buildSmsTargets({
    jobs: [
      { id: 'job-standalone-a', client: 'Salon Testowy', phone: '600 700 800', sms_recipient_phone: '600 700 800', sms_consent: true, sms_reminder_enabled: true, service_reminder_years: 5 },
      { id: 'job-standalone-b', client: 'Salon Testowy', phone: '+48 600 700 800', sms_recipient_phone: '+48 600 700 800', sms_consent: true, sms_reminder_enabled: true, service_reminder_years: 5 },
    ],
    devices: [
      { id: 'standalone-a', source_job_id: 'job-standalone-a::device-1', contractor_name: 'Salon Testowy', contractor_phone: '600 700 800', model: 'Rotenso A', serial_number: 'SER-A', installation_date: formatIsoDate(addMonths(dueA, -47)), service_reminder_years: 5 },
      { id: 'standalone-b', source_job_id: 'job-standalone-b::device-1', contractor_name: 'Salon Testowy', contractor_phone: '+48 600 700 800', model: 'Rotenso B', serial_number: 'SER-B', installation_date: formatIsoDate(addMonths(dueB, -35)), service_reminder_years: 5 },
    ],
  });
  const customerWindowQueue = smsModule.deriveSmsQueue(standaloneTargets, []);
  assert.equal(customerWindowQueue.length, 1, 'Dwa aktywne urządzenia tego samego klienta z terminami oddalonymi o kilkanaście dni powinny dać jeden SMS.');
  assert.equal(customerWindowQueue[0].grouped_sms_rows.length, 2, 'Grupa klienta powinna zawierać oba urządzenia nawet przy różnych cyklach.');
  assert.equal(customerWindowQueue[0].grouped_device_count, 2);

  const firstWindowRow = customerWindowQueue[0].grouped_sms_rows.find((row) => row.id === 'standalone-a');
  const secondWindowRow = customerWindowQueue[0].grouped_sms_rows.find((row) => row.id === 'standalone-b');
  assert(firstWindowRow && secondWindowRow, 'Oba urządzenia klienta muszą pozostać dostępne w danych grupy.');

  const suppressedWindowQueue = smsModule.deriveSmsQueue(standaloneTargets, [
    {
      id: 'sent-standalone-a',
      device_id: 'standalone-a',
      client: 'Salon Testowy',
      phone: '48600700800',
      status: 'delivered',
      reminder_cycle: firstWindowRow.reminder_cycle,
      reminder_due_date: firstWindowRow.reminder_due_date,
      delivered_at: new Date().toISOString(),
    },
  ]);
  assert.equal(suppressedWindowQueue.length, 0, 'Wysłany SMS dla jednego urządzenia ma zablokować drugie urządzenie tego klienta w tym samym 62-dniowym oknie.');

  const groupedSent = smsModule.getSentThisMonthLogs([
    {
      id: 'sent-a',
      device_id: 'standalone-a',
      client: 'Salon Testowy',
      phone: '48600700800',
      status: 'delivered',
      reminder_cycle: firstWindowRow.reminder_cycle,
      reminder_due_date: firstWindowRow.reminder_due_date,
      delivered_at: new Date().toISOString(),
    },
    {
      id: 'sent-b',
      device_id: 'standalone-b',
      client: 'Salon Testowy',
      phone: '600700800',
      status: 'sent',
      reminder_cycle: secondWindowRow.reminder_cycle,
      reminder_due_date: secondWindowRow.reminder_due_date,
      sent_at: new Date().toISOString(),
    },
  ]);
  assert.equal(groupedSent.length, 1, 'Historia bieżącego miesiąca ma pokazywać jeden wpis klienta zamiast dwóch bliskich wysyłek.');
  assert.equal(groupedSent[0].grouped_log_count, 2);

  const anchoredHistory = smsModule.groupSmsLogsByCustomerWindow([
    { id: 'anchor-a', client: 'Kotwica', phone: '48500600700', status: 'sent', reminder_due_date: '2026-01-01', sent_at: new Date().toISOString() },
    { id: 'anchor-b', client: 'Kotwica', phone: '500600700', status: 'sent', reminder_due_date: '2026-03-01', sent_at: new Date().toISOString() },
    { id: 'anchor-c', client: 'Kotwica', phone: '500 600 700', status: 'sent', reminder_due_date: '2026-04-30', sent_at: new Date().toISOString() },
  ]);
  assert.equal(anchoredHistory.length, 2, 'Kotwica 1/60/120 dni musi dać dwie grupy.');
  assert.deepEqual(anchoredHistory.map((row) => row.grouped_log_count).sort((a, b) => b - a), [2, 1]);

  const panelSource = fs.readFileSync(path.join(root, 'src', 'components', 'sms', 'SmsPanel.jsx'), 'utf8');
  assert.match(panelSource, /getGroupedDeviceLabel/);
  assert.match(panelSource, /jeden SMS do klienta/);
  assert.match(panelSource, /grouped_device_count/);
  assert.match(panelSource, /getPrimaryQueueLogId/);
  assert.match(panelSource, /grouped_sms_rows/);

  const generatorSource = fs.readFileSync(path.join(root, 'supabase', 'functions', 'generate-service-sms-queue', 'index.ts'), 'utf8');
  assert.doesNotMatch(generatorSource, /groupedByJobCycle/);
  assert.doesNotMatch(generatorSource, /standaloneItems/);
  assert.match(generatorSource, /normalizeSourceJobId/);
  assert.match(generatorSource, /identities:\s*\[`device:\$\{device\.id\}`\]/);
  assert.match(generatorSource, /device_id:\s*item\.deviceId \|\| null/);
  assert.match(generatorSource, /job_id:\s*item\.jobId \|\| null/);
  assert.match(generatorSource, /linkedJob\.sms_consent === true/);
  assert.match(generatorSource, /linkedJob\.sms_reminder_enabled === true/);
  assert.match(generatorSource, /ensureServiceSmsGroup/);
  assert.match(generatorSource, /ensure_service_sms_group/);
  assert.match(generatorSource, /existingPrimaryGroupIds/);
  assert.match(generatorSource, /reminder_group_id:\s*reminderGroupId/);
  assert.match(generatorSource, /reminder_group_primary:\s*true/);
  assert.doesNotMatch(generatorSource, /existingCustomerWindows/);
  assert.doesNotMatch(generatorSource, /hasCustomerReminderInWindow/);

  console.log('SMS job grouping smoke OK');
  process.exit(0);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
