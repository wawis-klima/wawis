// WAWIS 14.21 — liczniki w lewym panelu komputera (KOMUNIKACJA): nowe zgłoszenia i SMS-y do zatwierdzenia.
import { loadServiceRequests } from './service-requests.js';

const SENT_STATUSES = new Set(['sent', 'provider_sent', 'delivered']);
const norm = (value) => String(value || '').trim().toLowerCase();

/**
 * SMS-y czekające na zatwierdzenie — tak samo jak poranne zadanie (count_pending_sms_groups_v1417)
 * i ekran SMS: wpis główny grupy (albo bez grupy) w statusie pending_approval, w grupie bez SMS-a
 * już wysłanego lub doręczonego. Ukryte wpisy dodatkowe grupy nie są liczone.
 */
export function countPendingSmsGroups({ pending = [], sentGroupIds = [] }) {
  const sent = new Set((sentGroupIds || []).map(String));
  return (Array.isArray(pending) ? pending : []).filter((row) => {
    if (norm(row?.status) !== 'pending_approval') return false;
    const group = String(row?.reminder_group_id || '');
    if (group && row?.reminder_group_primary !== true) return false;
    return !group || !sent.has(group);
  }).length;
}

export async function loadPendingSmsCount({ supabase }) {
  const { data: pending, error } = await supabase.from('sms_log')
    .select('id, status, reminder_group_id, reminder_group_primary')
    .eq('sms_type', 'service_reminder').eq('status', 'pending_approval').limit(1000);
  if (error) throw error;
  const groupIds = [...new Set((pending || []).map((row) => String(row?.reminder_group_id || '')).filter(Boolean))];
  let sentGroupIds = [];
  for (let from = 0; from < groupIds.length; from += 100) {
    const { data: sent, error: sentError } = await supabase.from('sms_log')
      .select('reminder_group_id, status').in('reminder_group_id', groupIds.slice(from, from + 100));
    if (sentError) throw sentError;
    sentGroupIds = sentGroupIds.concat((sent || []).filter((row) => SENT_STATUSES.has(norm(row?.status))).map((row) => row.reminder_group_id));
  }
  return countPendingSmsGroups({ pending, sentGroupIds });
}

export async function loadNewServiceRequestCount({ supabase }) {
  const rows = await loadServiceRequests({ supabase, limit: 500 });
  return rows.filter((row) => row?.status === 'nowe').length;
}

/** Licznik w menu: 1–99, powyżej „99+”; zero lub błąd = bez znaczka. */
export function formatNavBadge(count) {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) return '';
  return value > 99 ? '99+' : String(Math.trunc(value));
}
