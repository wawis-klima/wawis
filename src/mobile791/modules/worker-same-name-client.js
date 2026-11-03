// WAWIS 14.14 — klient o tej samej nazwie przy dodawaniu montażu przez pracownika (audyt 03.11.2026).
//
// Baza celowo nie pozwala na dwóch kontrahentów o tej samej nazwie (unikalny indeks
// contractors_company_name_unique_idx). Funkcja worker_create_or_get_contractor_for_job
// po nieudanym dopasowaniu po telefonie i e-mailu dopasowuje klienta po samej nazwie —
// montaż drugiego „Jana Kowalskiego” trafiał po cichu do pierwszego.
//
// Ten moduł sprawdza to PRZED zapisem: gdy w bazie jest klient o tej samej nazwie, a telefon
// ani e-mail go nie potwierdzają, pracownik decyduje, czy to ten sam klient. „Nie” zatrzymuje
// zapis przed utworzeniem montażu (formularz zostaje), z prośbą o dopisanie miejscowości do nazwy.
// Bez zależności — testowany wykonywalnie w scripts/smoke-worker-same-name-client-v1414.mjs.

export const SAME_NAME_CLIENT_ERROR_CODE = 'WAWIS_SAME_NAME_CLIENT';

function cleanText(value) {
  return String(value ?? '').trim();
}

// Zgodne z public.normalize_contractors_text: lower + trim + pojedyncze spacje.
export function normalizeClientName(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, ' ');
}

function phoneKey(value) {
  const digits = cleanText(value).replace(/\D+/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
}

function emailKey(value) {
  const email = cleanText(value).toLowerCase();
  return email.includes('@') ? email : '';
}

// Wzorzec ILIKE bez znaków specjalnych użytkownika; dokładne porównanie robi normalizeClientName.
export function buildNameLookupPattern(name) {
  return normalizeClientName(name).replace(/[%*\\_]/g, '_').replace(/ /g, '%');
}

function primaryAddress(contractor) {
  const addresses = Array.isArray(contractor?.addresses) ? contractor.addresses : [];
  const primary = addresses.find((item) => item?.is_primary === true) || addresses[0] || null;
  return {
    city: cleanText(primary?.city || contractor?.city),
    street: cleanText(primary?.street || contractor?.street),
  };
}

export function isConfirmedByContact(form = {}, contractor = {}) {
  const formPhone = phoneKey(form.phone);
  const formEmail = emailKey(form.email);
  if (formPhone && formPhone === phoneKey(contractor.phone)) return true;
  if (formEmail && formEmail === emailKey(contractor.email)) return true;
  return false;
}

export function buildSameNameQuestion(contractor = {}) {
  const name = cleanText(contractor.company_name) || 'ten klient';
  const { city, street } = primaryAddress(contractor);
  const address = [city, street].filter(Boolean).join(', ');
  const phone = phoneKey(contractor.phone);
  const details = [
    address ? `adres: ${address}` : '',
    phone ? `tel. kończący się na ${phone.slice(-3)}` : '',
  ].filter(Boolean).join(', ');
  return `W bazie jest już klient „${name}”${details ? ` (${details})` : ''}.\n\n`
    + 'Czy to ten sam klient?\n\n'
    + 'OK — tak, dodaj montaż do tego klienta.\n'
    + 'Anuluj — to inna osoba.';
}

export function buildDifferentPersonMessage(name) {
  const clean = cleanText(name) || 'klienta';
  return `Montaż nie został zapisany. W bazie jest już inny klient „${clean}”. `
    + `Jeśli to inna osoba, dopisz do nazwy miejscowość, np. „${clean} Myszków”, i zapisz ponownie. `
    + 'Wpisane dane zostały w formularzu.';
}

export async function findSameNameContractors({ supabase, name }) {
  const normalized = normalizeClientName(name);
  if (!normalized || !supabase || typeof supabase.from !== 'function') return [];
  const { data, error } = await supabase
    .from('contractors')
    .select('id, company_name, phone, email, city, street, addresses')
    .ilike('company_name', buildNameLookupPattern(name))
    .limit(20);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).filter((row) => normalizeClientName(row?.company_name) === normalized);
}

/**
 * Wynik: { status: 'none' | 'same_contact' | 'confirmed' | 'lookup_failed' }.
 * Gdy pracownik odpowie „inna osoba”, rzuca błąd z kodem SAME_NAME_CLIENT_ERROR_CODE
 * (zanim powstanie montaż). Błąd sprawdzenia nie blokuje zapisu — zostaje dotychczasowe działanie.
 */
export async function checkWorkerSameNameClient({ supabase, form = {}, confirmFn, logFn } = {}) {
  let matches;
  try {
    matches = await findSameNameContractors({ supabase, name: form.client });
  } catch (error) {
    if (typeof logFn === 'function') logFn('worker-same-name-client.lookup-failed', { error });
    return { status: 'lookup_failed' };
  }
  if (!matches.length) return { status: 'none' };
  const existing = matches[0];
  if (isConfirmedByContact(form, existing)) return { status: 'same_contact', contractorId: existing.id };

  const ask = typeof confirmFn === 'function'
    ? confirmFn
    : (message) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(message) : false);
  if (ask(buildSameNameQuestion(existing))) return { status: 'confirmed', contractorId: existing.id };

  const error = new Error(buildDifferentPersonMessage(form.client));
  error.code = SAME_NAME_CLIENT_ERROR_CODE;
  throw error;
}
