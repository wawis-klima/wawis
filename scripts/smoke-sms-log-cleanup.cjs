const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readSql } = require('./sql-paths.cjs');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  if (relativePath.endsWith('.sql')) return readSql(root, relativePath);
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const migration = read('supabase/migrations/20261002062031_sms_history_safety_stage1_v1218.sql');

assert.match(migration, /protect_sms_log_history/);
assert.match(migration, /Historia SMS nie może być fizycznie usuwana/);
assert.match(migration, /physical_delete_disabled/);
assert.match(migration, /cancel_service_sms_log/);
assert.match(migration, /for update/i);
assert.match(migration, /private\.sms_delivery_claims/);
assert.match(migration, /status not in \('pending_approval', 'not_sent'\)/);
assert.match(migration, /provider_message_id is not null/);
assert.match(migration, /sent_at is not null/);
assert.match(migration, /delivered_at is not null/);
assert.match(migration, /on delete set null/gi);
assert.doesNotMatch(migration, /delete from public\.sms_log/i);
assert.match(migration, /revoke all on function public\.cancel_service_sms_log\(uuid, uuid\) from authenticated/);
assert.match(migration, /grant execute on function public\.cancel_service_sms_log\(uuid, uuid\) to service_role/);

for (const relativePath of ['src/modules/sms-fetch.js', 'src/mobile791/modules/sms-fetch.js']) {
  const source = read(relativePath);
  const loadStart = source.indexOf('export async function loadSmsModuleData');
  const saveStart = source.indexOf('export async function saveSmsSettings', loadStart);
  const loadBlock = source.slice(loadStart, saveStart);
  assert.doesNotMatch(loadBlock, /cleanupSmsDuplicateLogs/);
  assert.match(source, /history_protection_stage1/);
  assert.match(source, /admin_get_sms_module_snapshot/);
}

const generatorSource = read('supabase/functions/generate-service-sms-queue/index.ts');
assert.doesNotMatch(generatorSource, /cleanupDuplicateSmsLogs/);
assert.doesNotMatch(generatorSource, /admin_cleanup_sms_duplicate_logs/);
assert.doesNotMatch(generatorSource, /cleanupResult/);

const senderSource = read('supabase/functions/send-service-sms/index.ts');
const deleteStart = senderSource.indexOf('async function handleDeleteLogs');
const manualStart = senderSource.indexOf('async function handleManualJobSend', deleteStart);
const deleteBlock = senderSource.slice(deleteStart, manualStart);
assert.match(deleteBlock, /rpc\("cancel_service_sms_log"/);
assert.match(deleteBlock, /new Set/);
assert.doesNotMatch(deleteBlock, /from\("sms_log"\)/);
assert.doesNotMatch(deleteBlock, /updateSmsLogInsert/);
assert.doesNotMatch(deleteBlock, /client:/);
assert.doesNotMatch(deleteBlock, /phone:/);

const testGroupsSource = read('scripts/test-groups.cjs');
assert.match(testGroupsSource, /test:smoke:sms-log-cleanup/);

const version = String(JSON.parse(read('app-version.json')).version || '');
assert.match(version, /^\d+\.\d{2}$/, 'Wersja aplikacji musi mieć format NN.NN.');
assert.ok(Number(version) >= 12.18, 'Etap 1 ochrony historii musi pozostać aktywny od 12.18 wzwyż.');

console.log('SMS history safety stage 1 smoke OK');
process.exit(0);
