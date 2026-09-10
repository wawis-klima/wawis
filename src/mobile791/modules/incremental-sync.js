const MISSING_SYNC_INFRASTRUCTURE = /(get_mobile_change_|mobile_change_feed|does not exist|schema cache|could not find the function)/i;

function normalizeCursor(value) {
  return Math.max(0, Number(value) || 0);
}

export function isIncrementalSyncUnavailable(error) {
  return MISSING_SYNC_INFRASTRUCTURE.test(String(error?.message || error || ''));
}

export async function loadMobileChangeHead({ supabase }) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_mobile_change_head');
  if (error) {
    if (isIncrementalSyncUnavailable(error)) return null;
    throw error;
  }
  return normalizeCursor(data);
}

export async function loadMobileChangeBatch({ supabase, afterCursor = 0, limit = 100 }) {
  if (!supabase) return { available: false, changes: [] };
  const { data, error } = await supabase.rpc('get_mobile_change_batch', {
    p_after_seq: normalizeCursor(afterCursor),
    p_limit: Math.min(Math.max(Number(limit) || 100, 1), 250),
  });
  if (error) {
    if (isIncrementalSyncUnavailable(error)) return { available: false, changes: [] };
    throw error;
  }
  const changes = (Array.isArray(data) ? data : [])
    .map((item) => ({
      changeSeq: normalizeCursor(item?.change_seq),
      jobId: String(item?.job_id || '').trim(),
      changeKind: String(item?.change_kind || 'changed'),
      changedAt: item?.changed_at || '',
    }))
    .filter((item) => item.changeSeq > normalizeCursor(afterCursor) && item.jobId)
    .sort((left, right) => left.changeSeq - right.changeSeq);
  return { available: true, changes };
}
