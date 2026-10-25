// WAWIS 13.70: czytniki tabliczek (Code 128 z numerem SN i OCR nadruku) pobierają pliki z sieci.
// Bez tego przygotowania odczyt SN w trybie samolotowym nie działał (13.69: model z EAN był,
// numeru SN nie było). Raz, z internetem, w tle ładujemy oba czytniki — service worker zapisuje
// ich pliki w trwałym cache „wawis-nameplate-readers-v1”, więc później działają bez internetu.

export const NAMEPLATE_READER_CACHE = 'wawis-nameplate-readers-v1';
export const NAMEPLATE_READER_STATUS_KEY = 'wawis-nameplate-readers-offline';
const WARM_DELAY_MS = 8000;
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;
const RETRY_FAILED_AFTER_MS = 6 * 60 * 60 * 1000;

let warmPromise = null;

function readStatus() {
  try {
    const raw = window.localStorage.getItem(NAMEPLATE_READER_STATUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStatus(status) {
  try {
    window.localStorage.setItem(NAMEPLATE_READER_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Brak localStorage nie może blokować aplikacji.
  }
}

export function getNameplateReaderOfflineStatus() {
  if (typeof window === 'undefined') return null;
  return readStatus();
}

// Sprawdza, czy w trwałym cache są pliki obu czytników.
export async function inspectNameplateReaderCache() {
  if (typeof caches === 'undefined') return { barcode: false, ocr: false, files: 0 };
  try {
    const cache = await caches.open(NAMEPLATE_READER_CACHE);
    const urls = (await cache.keys()).map((request) => request.url);
    const barcode = urls.some((url) => /\/npm\/barcode-detector@/.test(url))
      && urls.some((url) => /\/npm\/zxing-wasm@.*\.wasm/.test(url));
    const ocr = urls.some((url) => /\/ocr\/tesseract\.min\.js/.test(url))
      && urls.some((url) => /\/ocr\/worker\.min\.js/.test(url))
      && urls.some((url) => /\/ocr\/core\/tesseract-core/.test(url));
    return { barcode, ocr, files: urls.length };
  } catch {
    return { barcode: false, ocr: false, files: 0 };
  }
}

async function runWarmup() {
  const [{ warmUniversalBarcodeReader }, { warmDesktopNameplateOcr }] = await Promise.all([
    import('../../modules/desktop-nameplate-barcode.js'),
    import('../../modules/desktop-nameplate-model-ocr.js'),
  ]);
  const errors = [];
  try { await warmUniversalBarcodeReader(); } catch (error) { errors.push(`kody: ${error?.message || error}`); }
  try { await warmDesktopNameplateOcr(); } catch (error) { errors.push(`OCR: ${error?.message || error}`); }
  const cached = await inspectNameplateReaderCache();
  const status = {
    ready: Boolean(cached.barcode && cached.ocr),
    barcode: cached.barcode,
    ocr: cached.ocr,
    files: cached.files,
    checkedAt: new Date().toISOString(),
    errors,
  };
  writeStatus(status);
  return status;
}

// Uruchamiane w tle po zalogowaniu. Nic nie robi bez internetu, bez service workera
// albo gdy czytniki są już zapisane (ponowne sprawdzenie raz na dobę).
export function scheduleNameplateReaderWarmup({ delayMs = WARM_DELAY_MS, force = false } = {}) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return () => {};
  if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return () => {};
  const timerId = window.setTimeout(async () => {
    if (navigator.onLine === false || warmPromise) return;
    if (!force) {
      // Czytniki już w cache → nic nie pobieramy (tylko odświeżamy status do Diagnostyki).
      const cached = await inspectNameplateReaderCache();
      if (cached.barcode && cached.ocr) {
        const previous = readStatus();
        if (!previous?.ready || Date.now() - Date.parse(previous.checkedAt || 0) > RECHECK_AFTER_MS) {
          writeStatus({ ready: true, barcode: true, ocr: true, files: cached.files, checkedAt: new Date().toISOString(), errors: [] });
        }
        return;
      }
      // Nieudana próba (np. słaby internet) — ponawiamy najwcześniej po 6 godzinach.
      const previous = readStatus();
      if (previous && !previous.ready && Date.now() - Date.parse(previous.checkedAt || 0) < RETRY_FAILED_AFTER_MS) return;
    }
    try {
      await navigator.serviceWorker.ready;
    } catch {
      return;
    }
    // Pliki trafią do cache tylko wtedy, gdy stroną zarządza już service worker.
    if (!navigator.serviceWorker.controller) return;
    warmPromise = runWarmup().catch(() => null).finally(() => { warmPromise = null; });
  }, Math.max(0, Number(delayMs) || 0));
  return () => window.clearTimeout(timerId);
}

// Ręczne „Przygotuj teraz” z Diagnostyki.
export async function prepareNameplateReadersNow() {
  if (typeof navigator === 'undefined' || navigator.onLine === false) {
    return { ready: false, error: 'Brak internetu — czytniki można pobrać tylko z internetem.' };
  }
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    return { ready: false, error: 'Obsługa offline aplikacji jeszcze się nie uruchomiła. Zamknij i otwórz aplikację, potem spróbuj ponownie.' };
  }
  if (warmPromise) return (await warmPromise) || { ready: false };
  warmPromise = runWarmup().catch((error) => ({ ready: false, error: error?.message || String(error) }))
    .finally(() => { warmPromise = null; });
  return warmPromise;
}
