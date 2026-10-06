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
const deleteIds = read('src/modules/sms-delete.js');
assert.match(panel, /latestLog\?\.id/);
assert.match(panel, /handleDeleteUnsentSelected/);
assert.match(panel, /handleDeleteUnsentNow/);
assert.match(panel, /buildUnsentDeletePayload/);
assert.match(panel, /canDelete: Boolean\(retryLogId\)/);
assert.match(panel, /canSend: Boolean\(retryLogId && target\)/);
assert.match(panel, /setDeleteBusy/);
assert.match(panel, /toggleUnsentAll\(checked, pagedRows\)/);
assert.match(panel, /toggleAll\(checked, pagedRows\)/);
const deletePayloadStart = panel.indexOf('function buildUnsentDeletePayload');
const deletePayloadEnd = panel.indexOf('async function handleDeleteUnsentSelected', deletePayloadStart);
const deletePayloadBlock = panel.slice(deletePayloadStart, deletePayloadEnd);
assert.match(deleteIds, /grouped_log_ids/);
assert.match(deleteIds, /export function getQueueDeleteLogIds/);
assert.match(deleteIds, /export function getUnsentDeleteLogIds/);
assert.match(deletePayloadBlock, /getUnsentDeleteLogIds/);
assert.match(deletePayloadBlock, /reminderGroupId/);
const queueDeletePayloadStart = panel.indexOf('function buildDeletePayload');
const queueDeletePayloadEnd = panel.indexOf('function reportDeleteResult', queueDeletePayloadStart);
const queueDeletePayloadBlock = panel.slice(queueDeletePayloadStart, queueDeletePayloadEnd);
assert.match(queueDeletePayloadBlock, /getQueueDeleteLogIds/);
const queueIdsBlock = deleteIds.slice(deleteIds.indexOf('export function getQueueDeleteLogIds'), deleteIds.indexOf('export function getUnsentDeleteLogIds'));
assert.doesNotMatch(queueIdsBlock, /row\.id/);
assert.match(panel, /window\.confirm/);

const card = read('src/components/sms/SmsUnsentCard.jsx');
assert.match(card, /Usuń zaznaczone/);
assert.match(card, /onDeleteSelected/);
assert.match(card, /onDeleteNow/);
assert.match(card, /deleteBusy/);
assert.match(card, /pageRows\.filter/);
assert.match(card, /Usuwanie…/);

const queueCard = read('src/components/sms/SmsQueueTable.jsx');
assert.match(queueCard, /deleteBusy/);
assert.match(queueCard, /pageRows\.filter/);
assert.match(queueCard, /na tej stronie/);

const sendClient = read('src/modules/sms-send.js');
assert.match(sendClient, /index \+= 25/);
assert.match(sendClient, /rows\.slice\(index, index \+ 25\)/);

const edge = read('supabase/functions/send-service-sms/index.ts');
assert.match(edge, /logIds\.length > 200/);
assert.match(edge, /reminderGroupId/);
assert.match(edge, /\.in\("reminder_group_id", groupIds\)/);
assert.match(edge, /partial: true/);

console.log('SMS dismiss/delete safety v12.33 smoke OK');
