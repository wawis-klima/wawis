export const DEFAULT_SERVICE_REMINDER_TEMPLATE =
  "Dzień dobry {client}, przypominamy o obowiązkowym przeglądzie klimatyzacji po 11 miesiącach od montażu. Aby utrzymać gwarancję, prosimy o kontakt: {service_phone}. {company_name}";

export function resolveSmsSettingsResult(result = {}) {
  const error = result && typeof result === 'object' ? result.error : null;
  if (error) {
    const message = typeof error?.message === 'string' ? error.message : String(error);
    throw new Error(`Nie udało się odczytać ustawień modułu SMS: ${message}`);
  }

  const row = result && typeof result === 'object' && result.data && typeof result.data === 'object'
    ? result.data
    : null;

  return {
    // Fail closed: brak rekordu konfiguracji nie może sam włączyć wysyłki.
    is_enabled: row?.is_enabled === true,
    sending_mode: row?.sending_mode ?? 'approval',
    sender_name: row?.sender_name ?? null,
    service_phone: row?.service_phone ?? null,
    company_name: row?.company_name ?? 'Wawis Klimatyzacja',
    template_service_reminder: row?.template_service_reminder || DEFAULT_SERVICE_REMINDER_TEMPLATE,
  };
}
