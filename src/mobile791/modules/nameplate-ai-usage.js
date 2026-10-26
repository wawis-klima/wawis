// WAWIS 13.73 (decyzja właściciela 26.10.2026): AI odczytu tabliczek jest płatne — używamy go tylko,
// gdy czytnik telefonu sobie nie poradził albo gdy pracownik sam naciśnie „Sprawdź przez AI”.
// Ten moduł liczy na telefonie, ile razy AI zostało użyte i ile razy go uniknięto (Diagnostyka),
// oraz pamięta wynik AI dla tego samego zdjęcia, żeby ponowny odczyt nie płacił drugi raz.

const USAGE_KEY = 'wawis-nameplate-ai-usage-v1';
const KEEP_DAYS = 31;
const CACHE_LIMIT = 30;
const aiResultCache = new Map();

// Rodzaje wpisów: ai — wywołanie płatnego AI; skipped — AI niepotrzebne (czytnik wystarczył);
// cached — ponowny odczyt tego samego zdjęcia z zapamiętanego wyniku AI.
export const AI_USAGE_KINDS = Object.freeze(['ai', 'skipped', 'cached']);

function dayKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function readUsage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const parsed = JSON.parse(window.localStorage.getItem(USAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeUsage(usage) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    // Licznik jest pomocniczy — brak miejsca nie może blokować odczytu tabliczki.
  }
}

export function recordNameplateAiUsage(kind, reason = '', { now = new Date() } = {}) {
  if (!AI_USAGE_KINDS.includes(kind)) return;
  const usage = readUsage();
  const key = dayKey(now);
  const day = usage[key] || { ai: 0, skipped: 0, cached: 0, reasons: {} };
  day[kind] = (Number(day[kind]) || 0) + 1;
  if (reason) {
    const reasonKey = `${kind}:${String(reason).slice(0, 40)}`;
    day.reasons = { ...(day.reasons || {}), [reasonKey]: (Number(day.reasons?.[reasonKey]) || 0) + 1 };
  }
  usage[key] = day;
  const cutoff = dayKey(new Date(now.getTime() - KEEP_DAYS * 86400000));
  for (const existing of Object.keys(usage)) {
    if (existing < cutoff) delete usage[existing];
  }
  writeUsage(usage);
}

// Podsumowanie do Diagnostyki: dziś i ostatnie 7 dni (ten telefon).
export function getNameplateAiUsageSummary({ now = new Date() } = {}) {
  const usage = readUsage();
  const today = dayKey(now);
  const weekStart = dayKey(new Date(now.getTime() - 6 * 86400000));
  const empty = () => ({ ai: 0, skipped: 0, cached: 0 });
  const summary = { today: empty(), week: empty() };
  for (const [key, day] of Object.entries(usage)) {
    for (const kind of AI_USAGE_KINDS) {
      const value = Number(day?.[kind]) || 0;
      if (key === today) summary.today[kind] += value;
      if (key >= weekStart && key <= today) summary.week[kind] += value;
    }
  }
  return summary;
}

// Klucz zdjęcia: treść pliku (SHA-256), żeby ten sam kadr rozpoznać także po ponownym przycięciu.
export async function getNameplateImageKey(file, targetUnit = '') {
  if (!file) return '';
  const unit = String(targetUnit || '');
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof file.arrayBuffer === 'function') {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hex = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${unit}:${hex}`;
    }
  } catch {
    // Brak crypto.subtle (np. strona bez HTTPS) — klucz zastępczy poniżej.
  }
  return `${unit}:${file.name || ''}:${file.size || 0}:${file.type || ''}`;
}

export function getCachedNameplateAiResult(key) {
  if (!key || !aiResultCache.has(key)) return null;
  return aiResultCache.get(key);
}

export function rememberNameplateAiResult(key, aiResult) {
  if (!key || !aiResult) return;
  aiResultCache.delete(key);
  aiResultCache.set(key, aiResult);
  while (aiResultCache.size > CACHE_LIMIT) aiResultCache.delete(aiResultCache.keys().next().value);
}

export function clearNameplateAiResultCache() {
  aiResultCache.clear();
}
