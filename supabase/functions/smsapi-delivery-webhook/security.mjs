const STATUS_RANK = new Map([
  ['pending_approval', 0],
  ['queued', 0],
  ['provider_sent', 1],
  ['sent', 1],
  ['error', 2],
  ['delivered', 3],
  ['deleted', 4],
]);

const FAILED_NAMES = new Set(['NOT_FOUND', 'EXPIRED', 'UNDELIVERED', 'FAILED', 'REJECTED', 'STOP', 'ERROR']);
const SENT_NAMES = new Set(['SENT', 'UNKNOWN', 'QUEUE', 'ACCEPTED', 'RENEWAL', 'PROVIDER_SENT']);

export async function deriveSmsApiCallbackToken(accessToken) {
  const source = `wawis:smsapi-callback:v1:${String(accessToken || '')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export function normalizeSmsApiStatus(status, statusName = '') {
  const name = String(statusName || status || '').trim().toUpperCase();
  if (name === 'DELIVERED' || name === 'DORĘCZONA' || name === 'DOSTARCZONA') return 'delivered';
  if (FAILED_NAMES.has(name)) return 'error';
  if (SENT_NAMES.has(name)) return 'provider_sent';

  const code = Number.parseInt(String(status || '').trim(), 10);
  if (code === 404) return 'delivered';
  if ([401, 402, 405, 406, 407, 412].includes(code)) return 'error';
  if ([403, 408, 409, 410, 411].includes(code)) return 'provider_sent';

  const text = String(status || '').trim().toLowerCase();
  if (['delivered', 'doręczona', 'dostarczona'].includes(text)) return 'delivered';
  if (['error', 'failed', 'undelivered', 'rejected', 'expired'].includes(text)) return 'error';
  return 'provider_sent';
}

export function shouldAdvanceSmsStatus(currentStatus, nextStatus) {
  const current = STATUS_RANK.get(String(currentStatus || '').trim().toLowerCase()) ?? 0;
  const next = STATUS_RANK.get(String(nextStatus || '').trim().toLowerCase()) ?? 0;
  return next > current;
}

export function planSmsCallbackUpdates({
  logStatus,
  jobStatus = null,
  logSentAt = null,
  jobSentAt = null,
  nextStatus,
  hasJob = false,
}) {
  const logNeedsAdvance = shouldAdvanceSmsStatus(logStatus, nextStatus);
  const parsedLogSentAt = logSentAt ? Date.parse(String(logSentAt)) : Number.NaN;
  const parsedJobSentAt = jobSentAt ? Date.parse(String(jobSentAt)) : Number.NaN;
  const callbackBelongsToLatestSend = !Number.isFinite(parsedJobSentAt)
    || !Number.isFinite(parsedLogSentAt)
    || parsedLogSentAt >= parsedJobSentAt;
  const jobNeedsAdvance = Boolean(
    hasJob
    && callbackBelongsToLatestSend
    && shouldAdvanceSmsStatus(jobStatus, nextStatus)
  );
  return { logNeedsAdvance, jobNeedsAdvance, callbackBelongsToLatestSend };
}
