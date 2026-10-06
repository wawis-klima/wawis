function normalizeLogId(value) {
  return String(value || '').trim();
}

function uniqueLogIds(values = []) {
  return [...new Set(values.map(normalizeLogId).filter(Boolean))];
}

export function getQueueDeleteLogIds(row = {}) {
  return uniqueLogIds([
    row.retryLogId,
    row.queueLog?.id,
    row.latestLog?.id,
    ...(Array.isArray(row.queueLogs) ? row.queueLogs.map((item) => item?.id) : []),
    ...(Array.isArray(row.grouped_queue_log_ids) ? row.grouped_queue_log_ids : []),
    ...(Array.isArray(row.grouped_log_ids) ? row.grouped_log_ids : []),
  ]);
}

export function getUnsentDeleteLogIds(row = {}) {
  return uniqueLogIds([
    row.id,
    ...getQueueDeleteLogIds(row),
  ]);
}
