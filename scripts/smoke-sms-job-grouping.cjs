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
  assert.equal(targets.length, 1, 'Dwa urządzenia z jednego montażu powinny utworzyć jeden target SMS.');
  assert.equal(targets[0].target_type, 'job');
  assert.equal(targets[0].id, 'job-1');
  assert.equal(targets[0].grouped_device_count, 2);
  assert.equal(targets[0].model, '2 urządzenia');
  assert.equal(targets[0].serial_number, 'Wiele numerów');

  const queue = smsModule.deriveSmsQueue(targets, []);
  assert.equal(queue.length, 1, 'Kolejka SMS powinna pokazać jeden wpis dla montażu z dwoma urządzeniami.');
  assert.equal(queue[0].grouped_device_count, 2);
  assert.match(queue[0].selectionKey, /^job:job-1:/);

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

  const panelSource = fs.readFileSync(path.join(root, 'src', 'components', 'sms', 'SmsPanel.jsx'), 'utf8');
  assert.match(panelSource, /getGroupedDeviceLabel/);
  assert.match(panelSource, /jeden SMS do klienta/);
  assert.match(panelSource, /grouped_device_count/);
  assert.match(panelSource, /getPrimaryQueueLogId/);
  assert.match(panelSource, /grouped_sms_rows/);

  const generatorSource = fs.readFileSync(path.join(root, 'supabase', 'functions', 'generate-service-sms-queue', 'index.ts'), 'utf8');
  assert.match(generatorSource, /groupedByJobCycle/);
  assert.match(generatorSource, /identities:\s*\[`job:\$\{linkedJobId\}`\]/);
  assert.match(generatorSource, /device_id:\s*item\.deviceId \|\| null/);
  assert.match(generatorSource, /job_id:\s*item\.jobId \|\| null/);
  assert.match(generatorSource, /existingCustomerByKey/);
  assert.match(generatorSource, /getCustomerQueueKey/);

  console.log('SMS job grouping smoke OK');
  process.exit(0);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
