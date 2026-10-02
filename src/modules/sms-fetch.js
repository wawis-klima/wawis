import { getDefaultSmsSettings } from './sms.js';

function normalizeSmsSnapshot(data) {
  return {
    settings: { ...getDefaultSmsSettings(), ...(data?.settings || {}) },
    logs: Array.isArray(data?.logs) ? data.logs : [],
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
    return { settings: getDefaultSmsSettings(), logs: [] };
  }

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
