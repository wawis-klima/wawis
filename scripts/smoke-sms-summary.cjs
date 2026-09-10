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
  const smsPanelSource = fs.readFileSync(path.join(root, 'src', 'components', 'sms', 'SmsPanel.jsx'), 'utf8');
  const today = new Date();
  const installationDueToday = formatIsoDate(addMonths(new Date(today.getTime() - (24 * 60 * 60 * 1000)), -11));
  const installationNextMonth = formatIsoDate(addMonths(today, -10));
  const records = [
    { id: 'job-1', target_type: 'job', client: 'Jan Kowalski', sms_consent: true, sms_reminder_enabled: true, phone: '500600700', sms_recipient_phone: '500600700', installation_date: installationDueToday, service_reminder_years: 5 },
    { id: 'job-2', target_type: 'job', client: 'Brak zgody', sms_consent: false, sms_reminder_enabled: true, phone: '600700800', sms_recipient_phone: '600700800', installation_date: installationDueToday, service_reminder_years: 5 },
    { id: 'device-1', target_type: 'device', client: 'Brak telefonu', sms_consent: true, sms_reminder_enabled: true, phone: '', sms_recipient_phone: '', installation_date: installationDueToday, service_reminder_years: 5 },
    { id: 'job-3', target_type: 'job', client: 'Termin później', sms_consent: true, sms_reminder_enabled: true, phone: '700800900', sms_recipient_phone: '700800900', installation_date: installationNextMonth, service_reminder_years: 5 },
  ];
  const queue = [{ selectionKey: 'job:job-1:1', client: 'Jan Kowalski' }, { selectionKey: 'job:job-3:1', client: 'Termin później' }];
  const currentMonthIso = new Date().toISOString();
  const logs = [{ id: 'log-1', status: 'sent', job_id: 'job-1', sent_at: currentMonthIso }, { id: 'log-2', status: 'error', job_id: 'job-2', created_at: currentMonthIso }];
  const summary = smsModule.getSmsSummary(records, queue, logs);
  assert.equal(summary.tracked, 2);
  assert.equal(summary.dueToday, 1);
  assert.equal(summary.sentThisMonth, 1);
  assert.equal(summary.missingConsent, 2);
  assert.equal(summary.errors, 1);
  assert.match(smsPanelSource, /getSmsSummary\(targets, queue, logs\)/);
  assert.match(smsPanelSource, /Klienci na liście/);
  assert.doesNotMatch(smsPanelSource, /Do przypomnienia dziś/);
  assert.match(smsPanelSource, /Wysłane w tym miesiącu/);
  assert.match(smsPanelSource, /summary\.tracked/);
  assert.doesNotMatch(smsPanelSource, /summary\.dueToday/);
  assert.match(smsPanelSource, /summary\.sentThisMonth/);
  assert.ok(smsPanelSource.includes("const [activeSummaryView, setActiveSummaryView] = useState('queue');"));
  assert.ok(smsPanelSource.includes("activeSummaryView === 'queue'"));
  assert.ok(smsPanelSource.includes("activeSummaryView === 'sentThisMonth'"));
  assert.ok(smsPanelSource.includes("onClick={() => setActiveSummaryView('queue')}"));
  assert.ok(smsPanelSource.includes("onClick={() => setActiveSummaryView('sentThisMonth')}"));
  assert.doesNotMatch(smsPanelSource, /showSentThisMonth/);
  console.log('SMS summary smoke OK');
  process.exit(0);
})().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
