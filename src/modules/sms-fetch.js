import { getDefaultSmsSettings } from './sms.js';

const smsSnapshotRequests = new WeakMap();

function normalizeSmsSnapshot(data) {
  const fallbackLogs = Array.isArray(data?.logs) ? data.logs : [];
  const queueLogs = Array.isArray(data?.queue_logs) ? data.queue_logs : fallbackLogs;
  const sentThisMonthLogs = Array.isArray(data?.sent_this_month_logs) ? data.sent_this_month_logs : fallbackLogs;
  const unsentLogs = Array.isArray(data?.unsent_logs) ? data.unsent_logs : [];
  const historyLogs = Array.isArray(data?.history_logs) ? data.history_logs : fallbackLogs;

  return {
    settings: { ...getDefaultSmsSettings(), ...(data?.settings || {}) },
    logs: queueLogs,
    sentThisMonthLogs,
    unsentLogs,
    historyLogs,
  };
}

export async function cleanupSmsDuplicateLogs() {
  return {
    ok: true,
    skipped: true,
    reason: 'history_protection_stage1',
    physicalDeleteDisabled: true,
  };
}

export async function loadSmsModuleData({ supabase, isAdmin }) {
  if (!supabase || !isAdmin) {
    return { settings: getDefaultSmsSettings(), logs: [], sentThisMonthLogs: [], unsentLogs: [], historyLogs: [] };
  }

  const inFlight = smsSnapshotRequests.get(supabase);
  if (inFlight) return inFlight;

  const request = (async () => {
    const { data, error } = await supabase.rpc('admin_get_sms_module_snapshot');
    if (error) throw error;
    return normalizeSmsSnapshot(data);
  })();

  smsSnapshotRequests.set(supabase, request);
  try {
    return await request;
  } finally {
    if (smsSnapshotRequests.get(supabase) === request) {
      smsSnapshotRequests.delete(supabase);
    }
  }
}

export async function saveSmsSettings({ supabase, settings, isAdmin = true }) {
  if (!supabase) throw new Error('Brak połączenia z Supabase.');
  if (!isAdmin) throw new Error('Tylko administrator może zapisywać ustawienia modułu SMS.');

  const payload = {
    p_is_enabled: !!settings.is_enabled,
    p_sender_name: settings.sender_name?.trim() || null,
    p_service_phone: settings.service_phone?.trim() || null,
    p_company_name: settings.company_name?.trim() || null,
    p_template_service_reminder: settings.template_service_reminder?.trim() || getDefaultSmsSettings().template_service_reminder,
  };

  const { data, error } = await supabase.rpc('admin_upsert_sms_settings', payload);
  if (error) throw error;
  return { ...getDefaultSmsSettings(), ...(data || {}) };
}


export async function loadSmsHistoryPage({ supabase, isAdmin, page = 1, pageSize = 50 } = {}) {
  if (!supabase || !isAdmin) return { rows: [], total: 0, page: 1, pageSize };
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 50));
  const normalizedPage = Math.max(1, Number(page) || 1);
  const { data, error } = await supabase.rpc('admin_get_sms_history_page', {
    p_limit: normalizedPageSize,
    p_offset: (normalizedPage - 1) * normalizedPageSize,
  });
  if (!error) {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const total = Math.max(0, Number(data?.total) || 0);
    return { rows, total, page: normalizedPage, pageSize: normalizedPageSize };
  }

  // Compatibility during a rolling frontend/backend deploy only.
  if (!['PGRST202', '42883'].includes(String(error.code || ''))) throw error;
  const fallback = await loadSmsModuleData({ supabase, isAdmin });
  const allRows = Array.isArray(fallback.historyLogs) ? fallback.historyLogs : [];
  const offset = (normalizedPage - 1) * normalizedPageSize;
  return {
    rows: allRows.slice(offset, offset + normalizedPageSize),
    total: allRows.length,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
}
