// WAWIS 14.47: podgląd klienta/urządzenia w module SMS — przejścia działają we wszystkich widokach.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const panel = read('src/components/sms/SmsPanel.jsx');
const client = read('src/components/sms/SmsClientDetailsCard.jsx');
const device = read('src/components/sms/SmsDeviceDetailsCard.jsx');
const app = read('src/App.jsx');

// Funkcja łącząca wpis SMS z urządzeniem/montażem (wykonana, nie tylko sprawdzona tekstowo).
const start = panel.indexOf('export function buildSmsDetailsRow(row, jobById = null) {');
assert.ok(start > 0);
const body = panel.slice(start, panel.indexOf('\n}\n', start) + 3).replace('export function', 'function');
const build = new Function(`${body}; return buildSmsDetailsRow;`)();
const log = { id: 'log-1', client: 'MINIMARKET', device_id: 'dev-1', job_id: null, status: 'provider_sent' };
const merged = build({ ...log, linkedTarget: { id: 'dev-1', target_type: 'device', contractor_id: 'c-1', source_job_id: null, client: 'MINIMARKET JURAJSKI', model: 'Rotenso' } });
assert.equal(merged.contractor_id, 'c-1', 'kontrahent z urządzenia');
assert.equal(merged.target_type, 'device');
assert.equal(merged.sms_log_id, 'log-1');
assert.equal(merged.client, 'MINIMARKET JURAJSKI');
assert.equal(build(log), log, 'bez powiązania — sam wpis');
// Montaż z urządzeniami nie ma celu „job:” — kontrahent z montażu wpisu (przypadek wykryty przez E2E 14.47).
const jobLog = { id: 'log-2', client: 'Jan', job_id: 'job-1', device_id: null };
const jobs = new Map([['job-1', { id: 'job-1', contractor_id: 'c-9' }]]);
const fromJob = build(jobLog, jobs);
assert.equal(fromJob.contractor_id, 'c-9');
assert.equal(fromJob.source_job_id, 'job-1');
assert.equal(build(jobLog, new Map()), jobLog, 'nieznany montaż — sam wpis');

// Wszystkie widoki wpisów SMS używają łączenia; widok mobilny „Wysłane” ma akcje.
assert.equal((panel.match(/setSelectedClient\(buildSmsDetailsRow\(row, jobById\)\)/g) || []).length, 3);
assert.match(panel, /setSelectedClient\(queueMatch \|\| buildSmsDetailsRow\(row, jobById\)\)/);
assert.doesNotMatch(panel, /<SmsSentThisMonthCard rows=\{filteredSentRows\}[^>]*onPageChange=\{setCurrentPage\} \/>/, 'widok mobilny bez akcji');
assert.equal((panel.match(/<SmsDeviceDetailsCard device=\{selectedDevice\} onClose=\{\(\) => setSelectedDevice\(null\)\} onOpenJob=\{onOpenJob\} onOpenContractor=\{onOpenContractor\} \/>/g) || []).length, 2);

assert.match(client, /client\.target_type === 'device' \|\| \(!client\.target_type && client\.device_id\) \? 'Urządzenie'/);
assert.match(client, /onOpenJob\?\.\(client\) === false/);
assert.match(device, /Przejdź do kontrahenta/);
assert.match(app, /function handleOpenJobFromSms\(jobLike\) \{\n[^\n]*\n    return openJobInJobsModule\(jobLike\);/);
assert.match(app, /if \(!resolvedJob\) return false;/);

// Hooki przed wczesnym return w obu kartach.
for (const [name, src] of [['klient', client], ['urządzenie', device]]) {
  assert.ok(src.indexOf('React.useState') < src.indexOf('return null;'), `${name}: hooki przed return`);
}
console.log('PASS WAWIS 14.47 — przejścia z podglądów modułu SMS.');
