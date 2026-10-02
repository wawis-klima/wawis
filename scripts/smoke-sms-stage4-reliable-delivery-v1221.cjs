const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20261002081343_sms_stage4_reliable_delivery_v1221.sql');
const hotfix = read('supabase/migrations/20261002081756_sms_stage4_found_state_fix_v1221.sql');
assert.match(migration, /add column if not exists staged_at timestamptz/i);
assert.match(migration, /add column if not exists uncertain_at timestamptz/i);
assert.match(migration, /add column if not exists source_log_id uuid/i);
assert.match(migration, /create unique index if not exists uq_sms_delivery_claims_provider_message_id/i);
assert.match(migration, /stage_service_sms_claim/i);
assert.match(migration, /record_service_sms_acceptance/i);
assert.match(migration, /reject_service_sms_claim/i);
assert.match(migration, /mark_service_sms_claim_uncertain/i);
assert.match(migration, /apply_sms_delivery_atomic_v2/i);
assert.match(migration, /grant execute on function public\.stage_service_sms_claim/i);
assert.match(migration, /grant execute on function public\.record_service_sms_acceptance/i);
assert.match(migration, /grant execute on function public\.reject_service_sms_claim/i);
assert.match(migration, /grant execute on function public\.mark_service_sms_claim_uncertain/i);
assert.match(migration, /grant execute on function public\.apply_sms_delivery_atomic_v2/i);
assert.match(hotfix, /l\.id is null/i);
assert.match(hotfix, /l\.id is not null/i);

const delivery = read('supabase/functions/send-service-sms/delivery.ts');
assert.match(delivery, /stage_service_sms_claim/);
assert.match(delivery, /record_service_sms_acceptance/);
assert.match(delivery, /reject_service_sms_claim/);
assert.match(delivery, /mark_service_sms_claim_uncertain/);
assert.match(delivery, /SmsProviderRejectedError/);
assert.match(delivery, /SmsDeliveryUncertainError/);
assert.match(delivery, /SmsAcceptancePersistenceError/);
assert.doesNotMatch(delivery, /confirm_service_sms/);
assert.match(delivery, /safeToRetry = false/);

const sender = read('supabase/functions/send-service-sms/index.ts');
assert.doesNotMatch(sender, /^import \{\\\\n/m);
assert.match(sender, /idx:\s*toSmsApiIdx\(prepared\.claimId\)/);
assert.match(sender, /check_idx:\s*"1"/);
assert.match(sender, /SmsProviderRejectedError/);
assert.match(sender, /provider_accepted_persistence_pending/);
assert.match(sender, /outcome:\s*"uncertain"/);
assert.match(sender, /response\.status >= 400 && response\.status < 500/);
assert.match(sender, /if \(!response\.ok\)/);
assert.doesNotMatch(sender, /upsertFinalizedCycleLog/);
assert.doesNotMatch(sender, /updateSmsLogInsert/);

const webhook = read('supabase/functions/smsapi-delivery-webhook/index.ts');
const webhookSecurity = read('supabase/functions/smsapi-delivery-webhook/security.mjs');
assert.match(webhook, /\['idx', 'IDX'\]/);
assert.match(webhook, /smsApiIdxToClaimId/);
assert.match(webhook, /apply_sms_delivery_atomic_v2/);
assert.match(webhook, /p_claim_id:\s*entry\.claimId/);
assert.match(webhookSecurity, /export function smsApiIdxToClaimId/);

for (const clientPath of ['src/modules/sms-send.js', 'src/mobile791/modules/sms-send.js', 'sms-send.js']) {
  const client = read(clientPath);
  assert.match(client, /data\?\.ok === false/);
  assert.match(client, /getFunctionFailureMessage/);
}

const generator = read('supabase/functions/generate-service-sms-queue/index.ts');
assert.match(generator, /provider_message_id, sent_at, delivered_at/);
assert.match(generator, /retryableProviderError/);
assert.match(generator, /existing\.hasProviderProof !== true/);

console.log('SMS stage 4 reliable delivery v12.21 smoke OK');
