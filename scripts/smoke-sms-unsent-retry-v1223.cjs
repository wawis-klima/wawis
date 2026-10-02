const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20261002095320_sms_unsent_manual_retry_v1223.sql');
assert.match(migration, /claim_service_sms_not_sent_retry/);
assert.match(migration, /retry_of_log_id/);
assert.match(migration, /unsent_logs/);
assert.match(migration, /c\.reminder_group_id,false,c\.retry_of_log_id/);
assert.match(migration, /grant execute on function public\.claim_service_sms_not_sent_retry\(uuid\) to service_role/i);

const delivery = read('supabase/functions/send-service-sms/delivery.ts');
assert.match(delivery, /claim_service_sms_not_sent_retry/);
assert.match(delivery, /retryLogId/);

const sender = read('supabase/functions/send-service-sms/index.ts');
assert.match(sender, /retry_not_sent/);
assert.match(sender, /handleRetryNotSentSend/);

for (const file of ['src/modules/sms-send.js','src/mobile791/modules/sms-send.js','sms-send.js']) {
  assert.match(read(file), /retryNotSentSmsLogs/);
}

for (const file of ['src/modules/sms-fetch.js','src/mobile791/modules/sms-fetch.js']) {
  assert.match(read(file), /unsentLogs/);
}

for (const file of ['src/components/sms/SmsPanel.jsx','src/mobile791/components/sms/SmsPanel.jsx']) {
  const panel = read(file);
  assert.match(panel, /SmsUnsentCard/);
  assert.match(panel, /activeSummaryView === 'unsent'/);
  assert.doesNotMatch(panel, /SMS-y są wysyłane automatycznie na 7 dni przed terminem serwisu/);
  assert.doesNotMatch(panel, /label: 'Zaplanowany'/);
}

for (const file of ['src/components/sms/SmsUnsentCard.jsx','src/mobile791/components/sms/SmsUnsentCard.jsx']) {
  const card = read(file);
  assert.match(card, /Wyślij ponownie/);
  assert.match(card, /Wyślij zaznaczone/);
}

for (const file of ['src/components/sms/SmsHistoryCard.jsx','src/mobile791/components/sms/SmsHistoryCard.jsx']) {
  const history = read(file);
  assert.match(history, /getSmsStatusLabel\(log.status\)/);
  assert.doesNotMatch(history, /oczekuje na wysłanie/i);
  assert.match(history, /Powód: \{log\.error_message\}/);
}

console.log('SMS v12.23 unsent manual retry smoke OK');
require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'test-sms-approval-routing.mjs')], { stdio: 'inherit' });
