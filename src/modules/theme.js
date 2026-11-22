// WAWIS 14.84 — motyw ciemny „Grafit z czerwienią” (decyzja właściciela 22.11.2026).
// Wybór jest zapamiętany na tym telefonie (localStorage), działa tylko w aplikacji na telefonie.
// Motyw ciemny = atrybut data-theme="dark" na <html>; kolory w src/styles/theme-dark.css.
export const THEME_STORAGE_KEY = 'wawis-theme-v1484';
// Kolor paska przeglądarki / systemu (meta theme-color) w każdym motywie.
export const THEME_BAR_COLORS = Object.freeze({ light: '#2563eb', dark: '#0c0c0d' });

export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

// Brak dostępu do pamięci (tryb prywatny, blokada) = motyw jasny; nigdy wyjątek.
export function readStoredTheme(storage) {
  try {
    return normalizeTheme(storage?.getItem?.(THEME_STORAGE_KEY));
  } catch {
    return 'light';
  }
}

export function saveTheme(theme, storage) {
  try {
    storage?.setItem?.(THEME_STORAGE_KEY, normalizeTheme(theme));
    return true;
  } catch {
    return false;
  }
}

export function currentTheme(doc = typeof document === 'undefined' ? null : document) {
  return doc?.documentElement?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme, doc = typeof document === 'undefined' ? null : document) {
  const next = normalizeTheme(theme);
  const root = doc?.documentElement;
  if (!root) return next;
  if (next === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  const meta = doc.querySelector?.('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_BAR_COLORS[next]);
  return next;
}

// Przełączenie: zapis na telefonie i natychmiastowa zmiana wyglądu (bez przeładowania).
export function toggleTheme(storage, doc = typeof document === 'undefined' ? null : document) {
  const next = currentTheme(doc) === 'dark' ? 'light' : 'dark';
  applyTheme(next, doc);
  saveTheme(next, storage);
  return next;
}
