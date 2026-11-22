// WAWIS 14.21 — liczniki w lewym panelu komputera (KOMUNIKACJA): nowe zgłoszenia i SMS-y do zatwierdzenia.
import { loadServiceRequests } from './service-requests.js';
import { loadSmsModuleData } from './sms-fetch.js';
import { buildSmsTargets, deriveSmsQueue } from './sms.js';
import { fetchAdminDevices } from './devices-fetch.js';

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

// 14.41: przez RPC jak ekran SMS. Tabela sms_log nie ma uprawnienia SELECT dla zalogowanych, więc bezpośredni
// odczyt zawsze kończył się błędem, a licznik znikał.
export async function loadPendingSmsCount({ supabase }) {
  const { logs } = await loadSmsModuleData({ supabase, isAdmin: true });
  const pending = (logs || []).filter((row) => norm(row?.sms_type) === 'service_reminder');
  const sentGroupIds = pending.filter((row) => SENT_STATUSES.has(norm(row?.status)) && row?.reminder_group_id).map((row) => row.reminder_group_id);
  return countPendingSmsGroups({ pending, sentGroupIds });
}

// 14.78: licznik SMS w menu = „Klienci na liście” w module SMS (decyzja właściciela 22.11.2026). Ekran SMS liczy
// listę z urządzeń i montaży (terminy przeglądów) razem z kolejką; poranne zadanie dokłada wpisy tylko w dni robocze,
// więc licznik z samej kolejki znikał w weekend, choć na liście byli klienci. Urządzenia pobieramy najwyżej co 10 min.
const DEVICES_CACHE_MS = 10 * 60 * 1000;
const devicesCache = new WeakMap();

async function loadDevicesForCount({ supabase, jobs, now }) {
  const cached = devicesCache.get(supabase);
  if (cached?.devices && now - cached.at < DEVICES_CACHE_MS) return cached.devices;
  const result = await fetchAdminDevices({ supabase, isAdmin: true, jobs, trySync: false });
  const devices = Array.isArray(result?.devices) ? result.devices : [];
  devicesCache.set(supabase, { at: now, devices });
  return devices;
}

export async function loadSmsListCount({ supabase, jobs = [], now = Date.now() }) {
  const [{ logs }, devices] = await Promise.all([
    loadSmsModuleData({ supabase, isAdmin: true }),
    loadDevicesForCount({ supabase, jobs, now }),
  ]);
  return deriveSmsQueue(buildSmsTargets({ jobs, devices }), logs || []).length;
}

/** Licznik w menu: lista jak w module SMS; gdy urządzeń nie da się pobrać — sama kolejka (jak do 14.77). */
export async function loadSmsNavCount({ supabase, jobs = [], now = Date.now() }) {
  try {
    return await loadSmsListCount({ supabase, jobs, now });
  } catch (error) {
    console.warn('Licznik SMS: lista niedostępna, liczę samą kolejkę.', error?.message || error);
    return loadPendingSmsCount({ supabase });
  }
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
