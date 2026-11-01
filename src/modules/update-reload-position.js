// WAWIS 14.05 — po przeładowaniu przez aktualizację aplikacja wraca do modułu, w którym był użytkownik,
// zamiast do pierwszego ekranu (zgłoszenie właściciela 01.11.2026).
// Zapamiętujemy wyłącznie identyfikator modułu i sekcji (bez danych), w sessionStorage bieżącej karty.
// Przywracamy TYLKO bezpośrednio po przeładowaniu aktualizacji (znacznik nie starszy niż 30 s),
// więc zwykłe uruchomienie aplikacji nadal zaczyna od ekranu startowego.
// Uprawnień nie omijamy: obie aplikacje mają strażnika ról, który przenosi pracownika do dozwolonego modułu.

export const UPDATE_RELOAD_MARKER_KEY = 'wawis-update-reload-at';
const POSITION_KEY = 'wawis-active-position';
const MAX_AGE_MS = 30000;

function storage(win) {
  try {
    return win?.sessionStorage || null;
  } catch {
    return null;
  }
}

export function rememberActivePosition(module, section = module, win = typeof window !== 'undefined' ? window : null) {
  const store = storage(win);
  if (!store || !module) return;
  try {
    store.setItem(POSITION_KEY, JSON.stringify({ module: String(module), section: String(section || module) }));
  } catch {
    // Brak sessionStorage (tryb prywatny) nie może przerywać nawigacji.
  }
}

export function markUpdateReload(now = Date.now(), win = typeof window !== 'undefined' ? window : null) {
  const store = storage(win);
  if (!store) return;
  try {
    store.setItem(UPDATE_RELOAD_MARKER_KEY, String(now));
  } catch {
    // jw.
  }
}

/** Zwraca {module, section} zapamiętane przed przeładowaniem aktualizacji albo wartości domyślne.
 *  Funkcja bez skutków ubocznych (React StrictMode wywołuje inicjalizator stanu dwukrotnie).
 *  Znacznik usuwa consumeUpdateReloadMarker() po uruchomieniu aplikacji — kolejny start zaczyna od ekranu startowego. */
export function restorePositionAfterUpdate({ fallbackModule, fallbackSection = fallbackModule, allowedModules = [], now = Date.now(),
  win = typeof window !== 'undefined' ? window : null } = {}) {
  const fallback = { module: fallbackModule, section: fallbackSection, restored: false };
  const store = storage(win);
  if (!store) return fallback;
  let markerAt = 0;
  let saved = null;
  try {
    markerAt = Number(store.getItem(UPDATE_RELOAD_MARKER_KEY) || 0);
    saved = JSON.parse(store.getItem(POSITION_KEY) || 'null');
  } catch {
    return fallback;
  }
  if (!markerAt || now - markerAt < 0 || now - markerAt > MAX_AGE_MS) return fallback;
  const module = String(saved?.module || '');
  if (!module || !allowedModules.includes(module)) return fallback;
  return { module, section: String(saved?.section || module), restored: true };
}

export function consumeUpdateReloadMarker(win = typeof window !== 'undefined' ? window : null) {
  const store = storage(win);
  if (!store) return;
  try {
    store.removeItem(UPDATE_RELOAD_MARKER_KEY);
  } catch {
    // jw.
  }
}

/** Podział przywróconej pozycji: moduł dostępny także dla pracownika ustawiamy od razu,
 *  moduł tylko administratora — dopiero po wczytaniu profilu z rolą Administrator. */
export function splitRestoredPosition(restored, { fallbackModule, fallbackSection = fallbackModule, workerModules = [] } = {}) {
  if (!restored?.restored) return { initial: { module: fallbackModule, section: fallbackSection }, adminPending: null };
  if (workerModules.includes(restored.module)) return { initial: { module: restored.module, section: restored.section }, adminPending: null };
  return { initial: { module: fallbackModule, section: fallbackSection }, adminPending: { module: restored.module, section: restored.section } };
}
