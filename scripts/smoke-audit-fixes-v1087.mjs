import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const AUDIT_SHA = '74b895c849cdb7644250acf0de7933fc9ef7f1a5';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
const auditRead = (relativePath) => execFileSync('git', ['show', `${AUDIT_SHA}:${relativePath}`], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
}).replace(/\r\n/g, '\n');

function loadGuard(source) {
  const sandbox = { globalThis: {} };
  sandbox.self = sandbox.globalThis;
  vm.runInNewContext(source, sandbox, { filename: 'push-context-guard.js' });
  return sandbox.globalThis.WawisPushContextGuard;
}

// RED evidence: exact audited 10.84 counterexamples.
const auditLifecycle = auditRead('src/mobile791/modules/push-lifecycle-v1078.js');
const auditGuardSource = auditRead('public/push-context-guard.js');
const auditMobilePush = auditRead('src/mobile791/modules/push-subscriptions.js');
const auditDesktopPush = auditRead('src/modules/push-subscriptions.js');
const auditAssignmentEdge = auditRead('supabase/functions/send-assignment-push/index.ts');
const auditFuelEdge = auditRead('supabase/functions/send-fuel-entry-push/index.ts');

assert.match(auditLifecycle, /let pushContextRevision = 0;/);
const auditGuard = loadGuard(auditGuardSource);
assert.equal(
  auditGuard.shouldApplyContextCommand({ userId: 'A', generation: 4, revision: 20 }, { userId: '', generation: 0, revision: 1 }),
  false,
);
console.log('RED F4 reproduced on 10.84: persisted SW revision=20 rejects fresh-page CLEAR revision=1.');

for (const [name, source] of [['mobile', auditMobilePush], ['desktop', auditDesktopPush]]) {
  assert.match(source, /pushManager\.getSubscription\(\)/, `F10/10.84 ${name}: expected getSubscription`);
  assert.match(source, /pushManager\.subscribe\(\{/, `F10/10.84 ${name}: expected subscribe`);
  assert.match(source, /subscription\.unsubscribe\(\)/, `F10/10.84 ${name}: expected unsubscribe`);
}
console.log('RED F10 reproduced on 10.84: PushManager operations can wait forever.');

for (const [name, source] of [['assignment', auditAssignmentEdge], ['fuel', auditFuelEdge]]) {
  assert.match(source, /from\(["']push_subscriptions["']\)[\s\S]{0,300}update\(\{\s*is_active:\s*false\s*\}\)/,
    `F11/10.84 ${name}: expected direct expired cleanup`);
}
console.log('RED F11 reproduced on 10.84: 404/410 cleanup bypasses tombstone.');

// GREEN contract required from 10.87.
const currentGuardSource = read('public/push-context-guard.js');
const currentLifecycle = read('src/mobile791/modules/push-lifecycle-v1078.js');
const currentMobilePush = read('src/mobile791/modules/push-subscriptions.js');
const currentDesktopPush = read('src/modules/push-subscriptions.js');
const currentAssignmentEdge = read('supabase/functions/send-assignment-push/index.ts');
const currentFuelEdge = read('supabase/functions/send-fuel-entry-push/index.ts');
const migrationFiles = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((name) => /push.*v1087.*\.sql$/i.test(name));
assert(migrationFiles.length >= 2, '10.87 must include coordinated PUSH RPC + ACL migrations.');
const currentMigrations = migrationFiles.map((name) => read(path.join('supabase', 'migrations', name))).join('\n');

const currentGuard = loadGuard(currentGuardSource);
assert.equal(typeof currentGuard.shouldApplySet, 'function');
assert.equal(typeof currentGuard.shouldApplyClear, 'function');
assert.equal(currentGuard.shouldApplySet({ userId: 'B', generation: 7, protocolVersion: 2 }, { userId: 'A', generation: 6, protocolVersion: 2 }), false,
  'F4: late SET A must not replace B');
assert.equal(currentGuard.shouldApplyClear({ userId: 'B', generation: 7, protocolVersion: 2 }, { expectedUserId: 'A', expectedGeneration: 6, protocolVersion: 2 }), false,
  'F4: late CLEAR A must not clear B');
assert.equal(currentGuard.shouldApplyClear({ userId: 'A', generation: 6, protocolVersion: 2 }, { expectedUserId: 'A', expectedGeneration: 6, protocolVersion: 2 }), true);
assert.equal(currentGuard.shouldApplySet({ userId: '', generation: 6, protocolVersion: 2 }, { userId: 'A', generation: 6, protocolVersion: 2 }), false,
  'F4: clear tombstone/floor must block late same-generation SET');
assert.doesNotMatch(currentLifecycle, /let pushContextRevision = 0;/);
assert.match(currentLifecycle, /expectedUserId/);
assert.match(currentLifecycle, /expectedGeneration/);
assert.match(currentLifecycle, /WAWIS_PUSH_CONTEXT_GET/);

for (const [name, source] of [['mobile', currentMobilePush], ['desktop', currentDesktopPush]]) {
  assert.doesNotMatch(source, /return registration\?\.pushManager\.getSubscription\(\) \|\| null;/,
    `F10 ${name}: bare getSubscription remains`);
  assert.match(source, /withPushLifecycleTimeout[\s\S]*pushManager\.getSubscription\(\)/,
    `F10 ${name}: getSubscription must be bounded`);
  assert.match(source, /withPushLifecycleTimeout[\s\S]*pushManager\.subscribe\(\{/,
    `F10 ${name}: subscribe must be bounded`);
  assert.match(source, /withPushLifecycleTimeout[\s\S]*subscription\.unsubscribe\(\)/,
    `F10 ${name}: unsubscribe must be bounded`);
}
assert.match(read('src/hooks/usePushNotificationsState.js'), /syncEpochRef/);
assert.match(read('src/mobile791/hooks/usePushNotificationsState.js'), /syncEpochRef/);

assert.match(currentMigrations, /revoke\s+all\s+on\s+table\s+public\.push_subscriptions\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
assert.match(currentMigrations, /grant\s+select\s+on\s+table\s+public\.push_subscriptions\s+to\s+authenticated/i);
assert.match(currentMigrations, /push_subscription_expire_atomic/i);
assert.match(currentMigrations, /push_subscription_sync_self/i);
assert.match(currentMigrations, /auth\.uid\(\)/i);
assert.doesNotMatch(currentDesktopPush, /from\(["']push_subscriptions["']\)\s*\.upsert\(/,
  'F11: desktop must not directly upsert push_subscriptions');
assert.doesNotMatch(currentDesktopPush, /from\(["']push_subscriptions["']\)[\s\S]{0,160}\.update\(/,
  'F11: desktop must not directly update push_subscriptions');
for (const [name, source] of [['assignment', currentAssignmentEdge], ['fuel', currentFuelEdge]]) {
  assert.match(source, /rpc\(["']push_subscription_expire_atomic["']/,
    `F11 ${name}: expired cleanup must use atomic tombstone RPC`);
  assert.doesNotMatch(source, /from\(["']push_subscriptions["']\)[\s\S]{0,300}update\(\{\s*is_active:\s*false\s*\}\)/,
    `F11 ${name}: direct expired cleanup remains`);
}

console.log('GO: 10.87 closes F4/F10/F11 after reproducing exact 10.84 failures.');
