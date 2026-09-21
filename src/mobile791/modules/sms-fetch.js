import { getDefaultSmsSettings } from './sms.js';

function normalizeSmsSnapshot(data) {
  return {
    settings: { ...getDefaultSmsSettings(), ...(data?.settings || {}) },
    logs: Array.isArray(data?.logs) ? data.logs : [],
  };
}

export async function cleanupSmsDuplicateLogs({ supabase, isAdmin }) {
  if (!supabase || !isAdmin) return { ok: true, skipped: true };

  const { data, error } = await supabase.rpc('admin_cleanup_sms_duplicate_logs');
  if (error) {
    const message = String(error.message || error.details || error.hint || '');
    if (/admin_cleanup_sms_duplicate_logs|function .* does not exist|Could not find the function/i.test(message)) {
      return { ok: true, skipped: true, reason: 'missing_rpc' };
    }
    throw error;
  }

  return data || { ok: true };
}

export async function loadSmsModuleData({ supabase, isAdmin }) {
  if (!supabase || !isAdmin) {
    return { settings: getDefaultSmsSettings(), logs: [] };
  }

  await cleanupSmsDuplicateLogs({ supabase, isAdmin });

  const { data, error } = await supabase.rpc('admin_get_sms_module_snapshot');
  if (error) throw error;

  return normalizeSmsSnapshot(data);
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
