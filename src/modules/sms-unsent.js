import { groupSmsLogsByCustomerWindow } from './sms.js';

// Pending messages come from the actionable queue, so already sent groups
// cannot reappear here through historical pending duplicates.
export function buildUnsentSmsLogs({ unsentLogs = [], queue = [] } = {}) {
  const logsById = new Map();
  for (const log of unsentLogs) {
    if (log?.id && log.status === 'not_sent') logsById.set(log.id, log);
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
