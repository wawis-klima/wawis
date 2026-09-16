import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT_SHA = '74b895c849cdb7644250acf0de7933fc9ef7f1a5';
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
const auditRead = (relative) => execFileSync('git', ['show', `${AUDIT_SHA}:${relative}`], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n');

// RED — exact audited 10.84 behavior must be reproducible before accepting the fixes.
const oldGuard = auditRead('supabase/migrations/20260911072000_worker_job_create_rls_v1050.sql');
assert.match(oldGuard, /old\.status='W trakcie'\s+and new\.status='Zakończone'/i);
assert.doesNotMatch(oldGuard, /photos|nameplate|tabliczk/i, '10.84 guard unexpectedly validates nameplates');
console.log('RED N2 reproduced on 10.84: DB job completion guard does not validate JW/JZ nameplates.');

const oldProtocol = auditRead('src/mobile791/modules/job-protocol-storage.js');
assert.match(oldProtocol, /reconciliation\.confirmed\s*&&\s*!existing\.record\s*&&\s*reconciliation\.record\)\s*return reconciliation\.record/);
assert.doesNotMatch(oldProtocol, /PROTOCOL_WRITE_CONFLICT|expectedStoragePath|\.eq\(["']storage_path["']/);
console.log('RED N3 reproduced on 10.84: a competing protocol record can be accepted as own success and replace is not CAS-bound.');

const oldFuel = auditRead('src/modules/fuel.js');
const oldFuelFn = oldFuel.slice(oldFuel.indexOf('export async function addFuelEntry'), oldFuel.indexOf('export async function updateFuelEntry'));
assert.doesNotMatch(oldFuelFn, /entryId|attemptId|operationId/);
assert.match(oldFuelFn, /\.insert\(\{\s*vehicle_id:/s);
console.log('RED N4 reproduced on 10.84: fuel retry has no stable operation UUID in the INSERT.');

const oldEmailClient = auditRead('src/mobile791/modules/job-protocol-email.js');
assert.match(oldEmailClient, /requestKey:\s*createRequestKey\(\)/);
const oldEmailEdge = auditRead('supabase/functions/send-job-protocol-email/index.ts');
assert.doesNotMatch(oldEmailEdge, /AbortController|provider_result_unknown|existingSend|existingLog/);
console.log('RED N5 reproduced on 10.84: every retry gets a new request key and provider uncertainty is not reconciled.');

// GREEN — current candidate must implement the stronger contracts.
const n2MigrationPath = 'supabase/migrations/20260916201000_job_completion_nameplate_guard_v1088.sql';
assert.ok(fs.existsSync(path.join(root, n2MigrationPath)), 'N2 migration is missing');
const n2Migration = read(n2MigrationPath);
assert.match(n2Migration, /assert_job_nameplates_complete/i);
assert.match(n2Migration, /lock_job_for_photo_mutation/i);
assert.match(n2Migration, /before insert or update or delete on public\.photos/i);
assert.match(n2Migration, /new\.status\s*=\s*'Zakończone'/i);
assert.match(n2Migration, /photo_kind\s*=\s*'nameplate'/i);
assert.match(n2Migration, /unit_ref/i);

const protocol = read('src/mobile791/modules/job-protocol-storage.js');
assert.match(protocol, /PROTOCOL_WRITE_CONFLICT/);
assert.match(protocol, /expectedStoragePath/);
assert.match(protocol, /\.eq\(["']storage_path["'],\s*expectedExistingStoragePath\s*\|\|\s*existing\.record\.storage_path\)/);
assert.doesNotMatch(protocol, /reconciliation\.confirmed\s*&&\s*!existing\.record\s*&&\s*reconciliation\.record\)\s*return reconciliation\.record/);
assert.match(protocol, /protocolRecordUsesStoragePath\(reconciliation\.record, storagePath\)/);

const fuel = read('src/modules/fuel.js');
const fuelFn = fuel.slice(fuel.indexOf('export async function addFuelEntry'), fuel.indexOf('export async function updateFuelEntry'));
assert.match(fuelFn, /entryId/);
assert.match(fuelFn, /id:\s*normalizedEntryId/);
assert.match(fuel, /reconcileFuelEntryById/);
assert.match(fuelFn, /existingPhotoPath|photoPath/);
const fuelPanel = read('src/components/fuel/FuelPanelBase.jsx');
assert.match(fuelPanel, /fuel-entry-attempt-v1088/);
assert.match(fuelPanel, /entryId/);
assert.match(fuelPanel, /localStorage/);
assert.match(fuelPanel, /onAttemptProgress/);

const emailClient = read('src/mobile791/modules/job-protocol-email.js');
assert.match(emailClient, /protocol-email-attempt-v1088/);
assert.match(emailClient, /getOrCreateProtocolEmailAttempt/);
assert.match(emailClient, /requestKey:\s*createRequestKey\(\)/, 'A new key must be created only by the durable attempt manager.');
const emailSendFn = emailClient.slice(emailClient.indexOf('export async function sendJobProtocolEmail'));
assert.doesNotMatch(emailSendFn, /createRequestKey\(\)/, 'send/retry must reuse the durable attempt key instead of creating a new one.');
assert.match(emailSendFn, /const requestKey = attempt\.requestKey/);
const emailEdge = read('supabase/functions/send-job-protocol-email/index.ts');
assert.match(emailEdge, /AbortController/);
assert.match(emailEdge, /provider_result_unknown/);
assert.match(emailEdge, /request_key/);
assert.match(emailEdge, /status\s*===\s*["']sent["']/);
assert.match(emailEdge, /Idempotency-Key/);

const groups = read('scripts/test-groups.cjs');
assert.match(groups, /smoke-audit-fixes-v1088\.mjs/);

console.log('GO: 10.88 N2/N3/N4/N5 behavioral contracts are closed.');
