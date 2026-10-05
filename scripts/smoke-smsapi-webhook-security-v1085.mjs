import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  collectSmsCallbackAuthTokens,
  constantTimeEqual,
  deriveSmsApiCallbackToken,
  normalizeSmsApiStatus,
  planSmsCallbackUpdates,
  shouldAdvanceSmsStatus,
  smsApiIdxToClaimId,
} from '../supabase/functions/smsapi-delivery-webhook/security.mjs';

const tokenA1 = await deriveSmsApiCallbackToken('secret-a');
const tokenA2 = await deriveSmsApiCallbackToken('secret-a');
const tokenB = await deriveSmsApiCallbackToken('secret-b');
assert.equal(tokenA1, tokenA2);
assert.notEqual(tokenA1, tokenB);
assert.equal(tokenA1.length, 64);
assert.equal(constantTimeEqual(tokenA1, tokenA2), true);
assert.equal(constantTimeEqual(tokenA1, tokenB), false);
assert.equal(constantTimeEqual('', ''), false);
assert.deepEqual(
  collectSmsCallbackAuthTokens({
    current: 't3',
    previous: 't2',
    valid_tokens: ['t3', 't2', 't1', 't0', ''],
  }),
  ['t3', 't2', 't1', 't0'],
);
assert.deepEqual(
  collectSmsCallbackAuthTokens({ current: 'current-only', previous: 'previous-only' }),
  ['current-only', 'previous-only'],
);

assert.equal(smsApiIdxToClaimId('a1c1fa534dd44ec58f6af67abd857e4b'), 'a1c1fa53-4dd4-4ec5-8f6a-f67abd857e4b');
assert.equal(smsApiIdxToClaimId('bad-idx'), null);

assert.equal(normalizeSmsApiStatus('404', 'DELIVERED'), 'delivered');
assert.equal(normalizeSmsApiStatus('403', 'SENT'), 'provider_sent');
assert.equal(normalizeSmsApiStatus('405', 'UNDELIVERED'), 'error');
assert.equal(normalizeSmsApiStatus('406', 'FAILED'), 'error');
assert.equal(normalizeSmsApiStatus('410', 'ACCEPTED'), 'provider_sent');
assert.equal(normalizeSmsApiStatus('408', 'UNKNOWN'), 'provider_sent');
assert.equal(normalizeSmsApiStatus('999', 'FUTURE_STATUS'), null, 'Nieznany callback nie może automatycznie oznaczać SMS jako wysłany.');

assert.equal(shouldAdvanceSmsStatus('provider_sent', 'delivered'), true);
assert.equal(shouldAdvanceSmsStatus('provider_sent', 'error'), true);
assert.equal(shouldAdvanceSmsStatus('error', 'delivered'), true);
assert.equal(shouldAdvanceSmsStatus('delivered', 'error'), false);
assert.equal(shouldAdvanceSmsStatus('delivered', 'provider_sent'), false);
assert.equal(shouldAdvanceSmsStatus('delivered', 'delivered'), false);

const firstDelivery = planSmsCallbackUpdates({
  logStatus: 'provider_sent',
  jobStatus: 'provider_sent',
  logSentAt: '2026-09-16T10:00:00Z',
  jobSentAt: '2026-09-16T10:00:00Z',
  nextStatus: 'delivered',
  hasJob: true,
});
assert.deepEqual(firstDelivery, { logNeedsAdvance: true, jobNeedsAdvance: true, callbackBelongsToLatestSend: true });

const retryAfterLogOnly = planSmsCallbackUpdates({
  logStatus: 'delivered',
  jobStatus: 'provider_sent',
  logSentAt: '2026-09-16T10:00:00Z',
  jobSentAt: '2026-09-16T10:00:00Z',
  nextStatus: 'delivered',
  hasJob: true,
});
assert.equal(retryAfterLogOnly.logNeedsAdvance, false);
assert.equal(retryAfterLogOnly.jobNeedsAdvance, true, 'Retry musi domknąć jobs po wcześniejszym sukcesie sms_log.');

const staleCallback = planSmsCallbackUpdates({
  logStatus: 'provider_sent',
  jobStatus: 'provider_sent',
  logSentAt: '2026-09-16T09:00:00Z',
  jobSentAt: '2026-09-16T10:00:00Z',
  nextStatus: 'delivered',
  hasJob: true,
});
assert.equal(staleCallback.logNeedsAdvance, true);
assert.equal(staleCallback.jobNeedsAdvance, false, 'Stary SMS nie może nadpisać stanu nowszej wysyłki na jobs.');
assert.equal(staleCallback.callbackBelongsToLatestSend, false);

const webhook = fs.readFileSync('supabase/functions/smsapi-delivery-webhook/index.ts', 'utf8').replace(/\r\n/g, '\n');
assert.match(webhook, /SMSAPI_ACCESS_TOKEN/);
assert.match(webhook, /searchParams\.get\('auth'\)/);
assert.match(webhook, /get_smsapi_callback_auth_tokens/);
assert.match(webhook, /stableTokens/);
assert.match(webhook, /collectSmsCallbackAuthTokens\(tokenRecord\)/);
assert.match(webhook, /deriveSmsApiCallbackToken/);
assert.match(webhook, /constantTimeEqual/);
assert.match(webhook, /planSmsCallbackUpdates/);
assert.match(webhook, /new Response\('OK'/);
const callbackCode=webhook.slice(webhook.indexOf('async function applyDeliveryStatus('),webhook.indexOf('function firstValue('));
const context={normalizeSmsApiStatus,JSON,console};vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(callbackCode.replace('ReturnType<typeof createClient>','any'))+';globalThis.apply=applyDeliveryStatus;',context);
const failed=await context.apply({rpc:async()=>({data:null,error:{message:'transaction failed'}})},{providerMessageId:'fixture',claimId:'a1c1fa53-4dd4-4ec5-8f6a-f67abd857e4b',status:'DELIVERED',raw:{}});
assert.equal(failed.ok,false);assert.equal(failed.status,500);assert.equal(failed.error,'transaction failed');
const missing=await context.apply({rpc:async()=>({data:null,error:null})},{providerMessageId:'fixture',claimId:'a1c1fa53-4dd4-4ec5-8f6a-f67abd857e4b',status:'DELIVERED',raw:{}});
assert.equal(missing.ok,false);assert.equal(missing.status,500);
let unknownRpcCalls=0;
const unknown=await context.apply({rpc:async()=>{unknownRpcCalls+=1;return {data:{ok:true},error:null};}},{providerMessageId:'fixture-unknown',claimId:null,status:'999',statusName:'FUTURE_STATUS',raw:{}});
assert.equal(unknown.ok,true);assert.equal(unknown.ignored,true);assert.equal(unknownRpcCalls,0,'Nieznany callback nie może dotykać stanu w bazie.');

const config=fs.readFileSync('supabase/config.toml','utf8');
assert.match(config,/\[functions\.smsapi-delivery-webhook\][\s\S]*?verify_jwt\s*=\s*false/);

const callbackMigration = fs.readFileSync('supabase/migrations/20261005133000_sms_callback_auth_rotation_v1246.sql','utf8');
assert.match(callbackMigration,/private\.sms_callback_auth_config/);
assert.match(callbackMigration,/rotate_smsapi_callback_auth_token/);
assert.match(callbackMigration,/previous_valid_until/);

const sender = fs.readFileSync('supabase/functions/send-service-sms/index.ts', 'utf8').replace(/\r\n/g, '\n');
assert.match(sender, /notify_url: notifyUrl/);
assert.match(sender, /smsapi-delivery-webhook\?auth=/);
assert.match(sender, /get_smsapi_callback_auth_tokens/);
assert.match(sender, /loadSmsCallbackAuthToken/);
assert.doesNotMatch(sender, /wawis:smsapi-callback:v1:/, 'Nowe wysyłki nie mogą wiązać callback auth z SMSAPI_ACCESS_TOKEN.');
assert.match(sender, /AbortSignal\.timeout\(20000\)/);
assert.match(sender, /sendServiceSmsOnce/);
const delivery = fs.readFileSync('supabase/functions/send-service-sms/delivery.ts', 'utf8').replace(/\r\n/g, '\n');
assert.match(delivery, /claim_service_sms_group_v2/);
assert.doesNotMatch(delivery, /rpc\('claim_service_sms_group'\s*,/);
assert.match(delivery, /stage_service_sms_claim/);
assert.match(delivery, /record_service_sms_acceptance/);
assert.match(delivery, /mark_service_sms_claim_uncertain/);
assert.doesNotMatch(delivery, /confirm_service_sms/);
assert.match(sender, /check_idx:\s*"1"/);
assert.match(sender, /const idx = toSmsApiIdx\(prepared\.claimId\)/);
assert.match(sender, /idx,/);
assert.match(webhook, /apply_sms_delivery_atomic_v2/);
assert.match(webhook, /p_claim_id:\s*entry\.claimId/);

console.log('PASS: callback authentication helpers and RPC failure propagation; atomic ordering is tested by audit-v1089/sms-race.mjs.');
