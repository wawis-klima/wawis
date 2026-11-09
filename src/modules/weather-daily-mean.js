// WAWIS 14.33 — średnia temperatura dnia badania dla miejscowości montażu (decyzja właściciela 07.11.2026).
// Źródło: Open-Meteo (bez klucza, bez danych klienta poza nazwą miejscowości). Wynik to PODPOWIEDŹ wpisywana do
// formularza próby szczelności — administrator zatwierdza ją przyciskiem „Zapisz” i może ją zmienić.
// Archiwum (ERA5) ma kilka dni opóźnienia, więc dla ostatnich dni używamy danych bieżących (prognoza z historią).

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const geocodeCache = new Map();
const meanCache = new Map();

// 14.42: miejscowość w montażu bywa zapisana z kodem pocztowym („42-400 Zawiercie”) — wyszukiwarka go nie zna.
export function normalizeCity(value) {
  return String(value || '').replace(/^\s*\d{2}\s*-\s*\d{3}\s*,?\s*/, '').replace(/\s+/g, ' ').trim();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function daysAgo(isoDate, now = new Date()) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - target) / 86_400_000);
}

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Współrzędne miejscowości w Polsce (pierwszy wynik wyszukiwarki Open-Meteo). */
export async function geocodePolishCity(city, { fetchImpl = fetch } = {}) {
  const name = normalizeCity(city);
  if (!name) return null;
  const key = name.toLowerCase();
  if (!geocodeCache.has(key)) {
    geocodeCache.set(key, (async () => {
      const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=1&language=pl&countryCode=PL&format=json`;
      const data = await getJson(fetchImpl, url);
      const hit = Array.isArray(data?.results) ? data.results[0] : null;
      return hit && Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude)
        ? { latitude: hit.latitude, longitude: hit.longitude, name: hit.name || name }
        : null;
    })().catch((error) => { geocodeCache.delete(key); throw error; }));
  }
  return geocodeCache.get(key);
}

function readMean(data) {
  const value = Array.isArray(data?.daily?.temperature_2m_mean) ? data.daily.temperature_2m_mean[0] : null;
  return Number.isFinite(value) ? value : null;
}

/**
 * Średnia temperatura dnia (°C, zaokrąglona do pełnych stopni) albo null, gdy nie da się jej ustalić
 * (brak miejscowości, data w przyszłości, brak danych). Błąd sieci → wyjątek (nie myli się z „brak danych”).
 */
export async function dailyMeanTemperature({ city, date, fetchImpl = fetch, now = new Date() } = {}) {
  if (!isIsoDate(date) || !normalizeCity(city)) return null;
  const age = daysAgo(date, now);
  if (age < 0) return null; // przyszłość
  const key = `${normalizeCity(city).toLowerCase()}|${date}`;
  if (meanCache.has(key)) return meanCache.get(key);
  const place = await geocodePolishCity(city, { fetchImpl });
  if (!place) return null;
  const query = `latitude=${place.latitude}&longitude=${place.longitude}&start_date=${date}&end_date=${date}&daily=temperature_2m_mean&timezone=Europe%2FWarsaw`;
  let mean = null;
  if (age >= 5) mean = readMean(await getJson(fetchImpl, `${ARCHIVE_URL}?${query}`));
  if (mean == null && age <= 90) mean = readMean(await getJson(fetchImpl, `${FORECAST_URL}?${query}`));
  const rounded = mean == null ? null : Math.round(mean);
  if (rounded != null) meanCache.set(key, rounded);
  return rounded;
}

export function clearWeatherCacheForTests() {
  geocodeCache.clear();
  meanCache.clear();
}
