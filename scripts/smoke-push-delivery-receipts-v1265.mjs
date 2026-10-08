import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20261007124500_push_delivery_receipts_v1265.sql');
const receiptEdge = read('supabase/functions/push-delivery-receipt/index.ts');
const assignmentEdge = read('supabase/functions/send-assignment-push/index.ts');
const fuelEdge = read('supabase/functions/send-fuel-entry-push/index.ts');
const worker = read('public/push-sw.js');
const config = read('supabase/config.toml');

for (const column of ['receipt_token_hash', 'received_at', 'displayed_at', 'receipt_updated_at']) {
  assert(migration.includes(column), `Migracja 12.65 musi zawierać ${column}`);
}
assert.match(migration, /unique index[\s\S]*receipt_token_hash/i);

assert.match(config, /\[functions\.push-delivery-receipt\][\s\S]*verify_jwt\s*=\s*false/);

for (const edge of [assignmentEdge, fuelEdge]) {
  assert.match(edge, /createDeliveryAttempt\(/);
  assert.match(edge, /receipt_token_hash/);
  assert.match(edge, /deliveryReceipt:[\s\S]*deliveryLogId:[\s\S]*receiptToken:[\s\S]*endpoint:/);
  assert.match(edge, /status:\s*"sending"/);
  assert.match(edge, /finalizeDeliveryAttempt\([\s\S]*status:\s*"sent"/);
  assert.match(edge, /SHA-256|sha256Hex/);
}

assert.match(receiptEdge, /stage !== "received" && stage !== "displayed"/);
assert.match(receiptEdge, /\.eq\("id", deliveryLogId\)[\s\S]*\.eq\("receipt_token_hash", tokenHash\)/);
assert.match(receiptEdge, /if \(!row\.received_at\) patch\.received_at = now/);
assert.match(receiptEdge, /stage === "displayed"[\s\S]*patch\.displayed_at = now/);

assert.match(worker, /reportPushReceipt\(payload, "received"\)/);
assert.match(worker, /showNotification\(title, options\)/);
assert.match(worker, /reportPushReceipt\(payload, "displayed"\)/);
assert(
  worker.indexOf('reportPushReceipt(payload, "received")') < worker.indexOf('shouldDisplayPush(payload, context || {})'),
  'Odbiór musi być raportowany przed filtrem bezpieczeństwa wyświetlania.',
);
assert(
  worker.indexOf('showNotification(title, options)') < worker.indexOf('reportPushReceipt(payload, "displayed")'),
  'Etap displayed wolno zapisać dopiero po udanym showNotification.',
);
const currentVersion = JSON.parse(read('public/app-version.json')).version;
assert(worker.includes(`wawis-app-shell-v${currentVersion}`), 'Service Worker must use current released app version');

console.log('PASS push delivery receipts v12.65');
