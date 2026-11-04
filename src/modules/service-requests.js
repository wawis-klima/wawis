// WAWIS 14.20 — zgłoszenia klientów z naklejki QR (zakładka „Zgłoszenia” administratora).

export const SERVICE_REQUEST_KIND_LABELS = { awaria: 'Awaria', przeglad: 'Przegląd' };
export const SERVICE_REQUEST_STATUS_LABELS = { nowe: 'Nowe', zalatwione: 'Załatwione' };

export function formatRequestPhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '').replace(/^48(?=\d{9}$)/, '');
  return digits.length === 9 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : String(value || '');
}

export function formatRequestDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function countNewServiceRequests(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.status === 'nowe').length;
}

function rpcError(error) {
  const message = String(error?.message || '');
  if (/service_requests|PGRST202|schema cache|does not exist/i.test(message)) {
    return new Error('Zgłoszenia nie są jeszcze włączone w bazie (brak migracji 14.20).');
  }
  if (/admin_only|42501/i.test(message)) return new Error('Zgłoszenia widzi tylko administrator.');
  return new Error(message || 'Nie udało się wczytać zgłoszeń.');
}

export async function loadServiceRequests({ supabase, limit = 200 }) {
  const { data, error } = await supabase.rpc('service_requests_list_v1420', { p_limit: limit });
  if (error) throw rpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function setServiceRequestStatus({ supabase, id, status }) {
  const { data, error } = await supabase.rpc('service_request_set_status_v1420', { p_id: id, p_status: status });
  if (error) throw rpcError(error);
  if (data !== true) throw new Error('Nie znaleziono zgłoszenia — odśwież listę.');
  return true;
}

/** 14.21: przegląd można zaplanować, gdy zgłoszenie wskazuje klienta i urządzenie. */
export function canPlanServiceVisit(row) {
  return Boolean(row?.contractor_id && row?.device_id);
}

/** Uwagi przeglądu z treści zgłoszenia (pole „Uwagi” w Przeglądach serwisowych, maks. 4000 znaków). */
export function buildServiceVisitNotes(row) {
  const label = SERVICE_REQUEST_KIND_LABELS[row?.kind] || 'Zgłoszenie';
  const parts = [
    `Zgłoszenie klienta z naklejki QR (${formatRequestDate(row?.created_at)}): ${label}.`,
    row?.description ? String(row.description).trim() : '',
    row?.phone ? `Tel. klienta: ${formatRequestPhone(row.phone)}.` : '',
  ].filter(Boolean);
  return parts.join(' ').slice(0, 4000);
}
