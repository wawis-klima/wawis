const fs = require('node:fs');

const file = 'scripts/smoke-fuel-module-v1014.mjs';
let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const oldBlock = String.raw`assert.match(pushEdge, /\.select\("id, user_id, endpoint, p256dh, auth, ownership_generation"\)/, 'Wysyłka musi odczytać generację własności endpointu.');
assert.match(pushEdge, /\.eq\("user_id", subscription\.user_id\)/, 'Cleanup 404/410 musi być przypięty do odbiorcy.');
assert.match(pushEdge, /\.eq\("ownership_generation", subscription\.ownership_generation\)/, 'Cleanup 404/410 musi być przypięty do generacji wysyłki.');`;
const newBlock = String.raw`assert.match(pushEdge, /\.select\("id, user_id, endpoint, p256dh, auth, lifecycle_token, ownership_generation"\)/, 'Wysyłka musi odczytać generację i lifecycle własności endpointu.');
assert.match(pushEdge, /rpc\("push_subscription_expire_atomic"/, 'Cleanup 404/410 musi używać atomowego expire z tombstone.');
assert.match(pushEdge, /p_request_user_id: subscription\.user_id/, 'Cleanup 404/410 musi być przypięty do odbiorcy.');
assert.match(pushEdge, /p_expected_generation: subscription\.ownership_generation/, 'Cleanup 404/410 musi być przypięty do generacji wysyłki.');
assert.match(pushEdge, /p_lifecycle_token: subscription\.lifecycle_token/, 'Cleanup 404/410 musi być przypięty do lifecycle wysyłki.');`;

const count = source.split(oldBlock).length - 1;
if (count !== 1) throw new Error(`Expected exactly one old fuel PUSH assertion block, got ${count}`);
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source, 'utf8');
console.log('Aligned historical fuel PUSH regression with 10.87 atomic tombstone contract.');
