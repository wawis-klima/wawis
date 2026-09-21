export const EMPTY_DASHBOARD_METRICS = Object.freeze({
  jobsToday: null,
  jobsNext7Days: null,
  jobsCurrentWeek: null,
  smsDueToday: null,
  devicesWithoutDate: null,
  contractorsCount: null,
  clientsWithoutPhone: null,
  jobsWithoutInstaller: null,
  smsErrors: null,
});

function readNumber(source, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isMissingRpcError(error) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return message.includes('admin_get_dashboard_metrics') || message.includes('function') && message.includes('does not exist') || error?.code === 'PGRST202';
}

export function normalizeDashboardMetrics(data = {}) {
  return {
    jobsToday: readNumber(data, ['jobs_today', 'jobsToday']),
    jobsNext7Days: readNumber(data, ['jobs_next_7_days', 'jobsNext7Days', 'week_jobs']),
    jobsCurrentWeek: readNumber(data, ['jobs_current_week', 'jobsCurrentWeek', 'current_week_jobs']),
    smsDueToday: readNumber(data, ['sms_due_today', 'smsDueToday']),
    devicesWithoutDate: readNumber(data, ['devices_without_date', 'devicesWithoutDate']),
    contractorsCount: readNumber(data, ['contractors_count', 'contractorsCount']),
    clientsWithoutPhone: readNumber(data, ['clients_without_phone', 'clientsWithoutPhone']),
    jobsWithoutInstaller: readNumber(data, ['jobs_without_installer', 'jobsWithoutInstaller']),
    smsErrors: readNumber(data, ['sms_errors', 'smsErrors']),
  };
}

export async function loadDashboardMetrics({ supabase, isAdmin }) {
  if (!supabase || !isAdmin) return EMPTY_DASHBOARD_METRICS;

  const { data, error } = await supabase.rpc('admin_get_dashboard_metrics');
  if (error) {
    if (isMissingRpcError(error)) return null;
    throw error;
  }

  return normalizeDashboardMetrics(data || {});
}
