// WAWIS 14.20 — publiczna strona naklejki QR: wywołania funkcji qr-service-request (bez logowania).

const env = typeof import.meta !== 'undefined' && import.meta?.env ? import.meta.env : {};
const MOCK = String(env.VITE_SUPABASE_MODE || '').trim().toLowerCase() === 'mock' || String(env.VITE_SUPABASE_MOCK || '') === '1';
// W trybie testowym adres jest przechwytywany przez Playwright (nie wychodzi do internetu).
const BASE = MOCK ? 'https://mock-supabase.invalid' : String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
export const PUBLIC_QR_ENDPOINT = `${BASE}/functions/v1/qr-service-request`;

/** Czy na tym urządzeniu jest zapisana sesja WAWIS (pracownik) — wtedy zamiast strony klienta otwiera się aplikacja. */
export function hasStoredWawisSession(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  try {
    if (!storage) return false;
    if (storage.getItem('klima-mock-supabase-session')) return true;
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i) || '';
      if (/^sb-.+-auth-token$/.test(key) && storage.getItem(key)) return true;
    }
  } catch {
    // Brak dostępu do pamięci (tryb prywatny) — traktujemy jak brak sesji.
  }
  return false;
}

export const STAFF_LOGIN_FLAG = 'wawis-qr-staff-login';

/** Strona klienta: kod z naklejki w adresie, brak sesji pracownika i brak wyboru „Jestem pracownikiem”. */
export function shouldShowPublicQrPage({ code, storage, session }) {
  if (!code) return false;
  try {
    if (session?.getItem(STAFF_LOGIN_FLAG) === '1') return false;
  } catch {
    // brak sessionStorage — bez znaczenia
  }
  // Sesja może być w pamięci trwałej (aplikacja) albo w pamięci karty (wersja testowa telefonu).
  return !hasStoredWawisSession(storage) && !hasStoredWawisSession(session);
}

async function call(body, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(PUBLIC_QR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      signal: controller?.signal,
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const error = new Error(payload?.error || 'Nie udało się połączyć. Spróbuj ponownie albo zadzwoń.');
      error.status = response.status;
      error.field = payload?.field || '';
      throw error;
    }
    return payload || {};
  } catch (error) {
    if (error?.name === 'AbortError' || !error?.status) {
      const wrapped = new Error(error?.status ? error.message : 'Brak połączenia z internetem. Spróbuj ponownie albo zadzwoń.');
      wrapped.status = error?.status || 0;
      wrapped.field = error?.field || '';
      throw wrapped;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function fetchPublicQrInfo(code, options) {
  return call({ action: 'info', code }, options);
}

export function submitPublicQrRequest({ code, kind, description, phone, website = '' }, options) {
  return call({ action: 'submit', code, kind, description, phone, website }, options);
}
