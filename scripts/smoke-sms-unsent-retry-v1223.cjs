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

const retryUndeliveredMigration = read('supabase/migrations/20261003173500_sms_retry_confirmed_undelivered_v1235.sql');
assert.match(retryUndeliveredMigration, /v_status\s*=\s*'error'/);
assert.match(retryUndeliveredMigration, /l\.provider_message_id is null/);
assert.match(retryUndeliveredMigration, /l\.delivered_at is not null/);

const delivery = read('supabase/functions/send-service-sms/delivery.ts');
assert.match(delivery, /claim_service_sms_not_sent_retry/);
assert.match(delivery, /retryLogId/);

const sender = read('supabase/functions/send-service-sms/index.ts');
assert.match(sender, /retry_not_sent/);
assert.match(sender, /handleRetryNotSentSend/);

for (const file of ['src/modules/sms-send.js']) {
  const smsSend = read(file);
  assert.match(smsSend, /retryNotSentSmsLogs/);
  assert.match(smsSend, /status === 'not_sent' \|\| status === 'error'/);
  assert.match(smsSend, /getInvokeErrorMessage/);
}

for (const file of ['src/modules/sms-fetch.js']) {
  assert.match(read(file), /unsentLogs/);
}

for (const file of ['src/components/sms/SmsPanel.jsx']) {
  const panel = read(file);
  assert.match(panel, /SmsUnsentCard/);
  assert.match(panel, /activeSummaryView === 'unsent'/);
  assert.doesNotMatch(panel, /SMS-y są wysyłane automatycznie na 7 dni przed terminem serwisu/);
  assert.doesNotMatch(panel, /label: 'Zaplanowany'/);
}

for (const file of ['src/components/sms/SmsUnsentCard.jsx']) {
  const card = read(file);
  assert.match(card, /Wyślij ponownie/);
  assert.match(card, /Wyślij zaznaczone/);
  assert.match(card, /sendingIds = \[\]/);
  assert.match(card, /const rowSending = sendingIds\.includes\(row\.selectionKey\)/);
  assert.match(card, /rowSending \? 'Wysyłanie…'/);
  assert.doesNotMatch(card, /\{sendBusy \? 'Wysyłanie…' : row\.status/);
}

const panelSource = read('src/components/sms/SmsPanel.jsx');
assert.match(panelSource, /sendingUnsentIds/);
assert.match(panelSource, /setSendingUnsentIds\(row\?\.selectionKey \? \[row\.selectionKey\] : \[\]\)/);
assert.match(panelSource, /sendingIds=\{sendingUnsentIds\}/);

const bulkCleanup = read('supabase/migrations/20261003180500_sms_bulk_remove_old_unsent_v1236.sql');
assert.match(bulkCleanup, /status\s*=\s*'deleted'/);
assert.match(bulkCleanup, /lower\(btrim\(coalesce\(status, ''\)\)\)\s*=\s*'not_sent'/);


for (const file of ['src/components/sms/SmsHistoryCard.jsx']) {
  const history = read(file);
  assert.match(history, /getSmsStatusLabel\(log.status\)/);
  assert.match(history, /smsHistoryGridHeader/);
  assert.match(history, /smsHistoryCell/);
  assert.match(history, /smsHistoryStatusCell/);
  assert.doesNotMatch(history, /oczekuje na wysłanie/i);
  assert.match(history, /Powód: \{log\.error_message\}/);
}

console.log('SMS v12.23 unsent manual retry smoke OK');
require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'test-sms-approval-routing.mjs')], { stdio: 'inherit' });
