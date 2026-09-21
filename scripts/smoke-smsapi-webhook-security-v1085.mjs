import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  constantTimeEqual,
  deriveSmsApiCallbackToken,
  normalizeSmsApiStatus,
  planSmsCallbackUpdates,
  shouldAdvanceSmsStatus,
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

assert.equal(normalizeSmsApiStatus('404', 'DELIVERED'), 'delivered');
assert.equal(normalizeSmsApiStatus('403', 'SENT'), 'provider_sent');
assert.equal(normalizeSmsApiStatus('405', 'UNDELIVERED'), 'error');
assert.equal(normalizeSmsApiStatus('406', 'FAILED'), 'error');
assert.equal(normalizeSmsApiStatus('410', 'ACCEPTED'), 'provider_sent');

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
assert.match(webhook, /deriveSmsApiCallbackToken/);
assert.match(webhook, /constantTimeEqual/);
assert.match(webhook, /planSmsCallbackUpdates/);
assert.match(webhook, /new Response\('OK'/);
const callbackCode=webhook.slice(webhook.indexOf('async function applyDeliveryStatus('),webhook.indexOf('function firstValue('));
const context={normalizeSmsApiStatus,JSON};vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(callbackCode.replace('ReturnType<typeof createClient>','any'))+';globalThis.apply=applyDeliveryStatus;',context);
const failed=await context.apply({rpc:async()=>({data:null,error:{message:'transaction failed'}})},{providerMessageId:'fixture',status:'DELIVERED',raw:{}});
assert.equal(failed.ok,false);assert.equal(failed.status,500);assert.equal(failed.error,'transaction failed');
const missing=await context.apply({rpc:async()=>({data:null,error:null})},{providerMessageId:'fixture',status:'DELIVERED',raw:{}});
assert.equal(missing.ok,false);assert.equal(missing.status,500);

const sender = fs.readFileSync('supabase/functions/send-service-sms/index.ts', 'utf8').replace(/\r\n/g, '\n');
assert.match(sender, /notify_url: notifyUrl/);
assert.match(sender, /smsapi-delivery-webhook\?auth=/);
assert.match(sender, /AbortSignal\.timeout\(20000\)/);
assert.match(sender, /sendServiceSmsOnce/);
const delivery = fs.readFileSync('supabase/functions/send-service-sms/delivery.ts', 'utf8').replace(/\r\n/g, '\n');
assert.match(delivery, /claim_service_sms/);
assert.match(delivery, /confirm_service_sms/);

console.log('PASS: callback authentication helpers and RPC failure propagation; atomic ordering is tested by audit-v1089/sms-race.mjs.');
