import { groupSmsLogsByCustomerWindow } from './sms.js';

export function isRetryableUnsentLog(log) {
  if (!log?.id) return false;
  const status = String(log.status || '').trim().toLowerCase();

  if (status === 'not_sent') {
    return !log.provider_message_id && !log.sent_at && !log.delivered_at;
  }

  if (status === 'error') {
    return !log.delivered_at && (Boolean(log.provider_message_id) || !log.sent_at);
  }

  return false;
}

// Pending messages come from the actionable queue, so already sent groups
// cannot reappear here through historical pending duplicates.
export function buildUnsentSmsLogs({ unsentLogs = [], queue = [] } = {}) {
  const logsById = new Map();
  for (const log of unsentLogs) {
    if (isRetryableUnsentLog(log)) logsById.set(log.id, log);
  }
  for (const row of queue) {
    for (const log of [row.queueLog, ...(row.queueLogs || [])]) {
      if (log?.id && log.status === 'pending_approval') {
        logsById.set(log.id, { ...log, linkedTarget: row });
      }
    }
  }
  return groupSmsLogsByCustomerWindow([...logsById.values()]);
}
