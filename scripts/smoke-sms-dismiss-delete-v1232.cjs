const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const migration = read('supabase/migrations/20261003055805_sms_dismiss_failed_and_delete_unsent_v1232.sql');
assert.match(migration, /v_status = 'error'/);
assert.match(migration, /status = 'dismissed'/);
assert.match(migration, /v_status in \('deleted', 'dismissed'\)/);
assert.match(migration, /v_status not in \('pending_approval', 'not_sent'\)/);
assert.match(migration, /grant execute on function public\.cancel_service_sms_log\(uuid, uuid\) to service_role/i);

const sms = read('src/modules/sms.js');
assert.match(sms, /'dismissed'/);
assert.match(sms, /case 'dismissed':\s*return 'usunięto z listy'/);
assert.match(sms, /'deleted', 'dismissed', 'not_sent'/);

const panel = read('src/components/sms/SmsPanel.jsx');
assert.match(panel, /latestLog\?\.id/);
assert.match(panel, /handleDeleteUnsentSelected/);
assert.match(panel, /handleDeleteUnsentNow/);
assert.match(panel, /buildUnsentDeletePayload/);
assert.match(panel, /canDelete: Boolean\(retryLogId\)/);
assert.match(panel, /canSend: Boolean\(retryLogId && target\)/);

const card = read('src/components/sms/SmsUnsentCard.jsx');
assert.match(card, /Usuń zaznaczone/);
assert.match(card, /onDeleteSelected/);
assert.match(card, /onDeleteNow/);

console.log('SMS dismiss/delete v12.32 smoke OK');
