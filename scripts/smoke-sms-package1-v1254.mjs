import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveSmsSettingsResult } from '../supabase/functions/send-service-sms/settings.mjs';
import { isRetryableUnsentLog, buildUnsentSmsLogs } from '../src/modules/sms-unsent.js';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20261005164949_sms_package1_retry_preflight_settings_legacy_v1254.sql', import.meta.url),
  'utf8',
);
const delivery = fs.readFileSync(
  new URL('../supabase/functions/send-service-sms/delivery.ts', import.meta.url),
  'utf8',
);
const sender = fs.readFileSync(
  new URL('../supabase/functions/send-service-sms/index.ts', import.meta.url),
  'utf8',
);
const webhook = fs.readFileSync(
  new URL('../supabase/functions/smsapi-delivery-webhook/index.ts', import.meta.url),
  'utf8',
);

// P1-05: settings fail closed.
assert.throws(
  () => resolveSmsSettingsResult({ data: null, error: { message: 'db unavailable' } }),
  /Nie udało się odczytać ustawień modułu SMS: db unavailable/,
);
assert.equal(resolveSmsSettingsResult({ data: null, error: null }).is_enabled, false);
assert.equal(resolveSmsSettingsResult({ data: { is_enabled: false }, error: null }).is_enabled, false);
assert.equal(resolveSmsSettingsResult({ data: { is_enabled: true }, error: null }).is_enabled, true);

// P1-02 / P1-03: safe failures appear in Niewysłane; ambiguous ones do not.
const base = {
  id: 'log-1',
  phone: '48500111222',
  reminder_due_date: '2025-01-01',
  reminder_group_id: 'group-1',
  reminder_group_primary: true,
};
const rejectedNoId = { ...base, status: 'error', provider_message_id: null, sent_at: null, delivered_at: null };
const undelivered = { ...base, id: 'log-2', reminder_group_id: 'group-2', status: 'error', provider_message_id: 'provider-2', sent_at: '2025-01-01T10:00:00Z', delivered_at: null };
const ambiguous = { ...base, id: 'log-3', reminder_group_id: 'group-3', status: 'error', provider_message_id: null, sent_at: '2025-01-01T10:00:00Z', delivered_at: null };
const notSent = { ...base, id: 'log-4', reminder_group_id: 'group-4', status: 'not_sent', provider_message_id: null, sent_at: null, delivered_at: null };

assert.equal(isRetryableUnsentLog(rejectedNoId), true);
assert.equal(isRetryableUnsentLog(undelivered), true);
assert.equal(isRetryableUnsentLog(ambiguous), false);
assert.equal(isRetryableUnsentLog(notSent), true);

const visible = buildUnsentSmsLogs({
  unsentLogs: [rejectedNoId, undelivered, ambiguous, notSent],
  queue: [],
});
assert.deepEqual(
  new Set(visible.map((row) => row.id)),
  new Set(['log-1', 'log-2', 'log-4']),
);

// SQL and sender must use one safety contract.
assert.match(migration, /sms_log_is_retryable_failure/);
assert.match(migration, /release_service_sms_claim_before_provider/);
assert.match(migration, /ensure_sms_reminder_group_for_member/);
assert.match(migration, /legacy_claim_cutoff/);
assert.match(migration, /legacy_fallback_valid_until/);
assert.match(migration, /2026-10-05 16:45:00\+00/);
assert.match(migration, /2026-10-12 16:45:00\+00/);
assert.match(migration, /is_smsapi_legacy_callback_allowed/);
assert.match(migration, /where private\.sms_log_is_retryable_failure/);

assert.match(delivery, /class SmsProviderPreflightError/);
assert.match(delivery, /release_service_sms_claim_before_provider/);
assert.match(delivery, /mark_service_sms_claim_uncertain/);
assert.match(delivery, /error instanceof SmsProviderPreflightError/);
assert.match(delivery, /error instanceof SmsProviderRejectedError/);

assert.match(sender, /resolveSmsSettingsResult/);
assert.doesNotMatch(sender, /row\?\.is_enabled \?\? true/);
assert.match(sender, /throw new SmsProviderPreflightError/);
assert.match(sender, /outcome: "failed_before_provider"/);

assert.match(webhook, /is_smsapi_legacy_callback_allowed/);
assert.match(webhook, /legacyAllowed !== true/);
assert.match(webhook, /collectSmsCallbackAuthTokens/);

console.log('PASS: SMS Package 1 retry, preflight, settings fail-closed and legacy callback safety');
