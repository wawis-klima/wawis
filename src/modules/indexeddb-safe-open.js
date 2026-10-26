// WAWIS 13.76: bezpieczne otwieranie lokalnych baz IndexedDB (wzór: kolejka zdjęć od 13.62).
//
// indexedDB.open(nazwa, N) kończy się błędem VersionError, gdy w telefonie jest baza w wersji > N.
// Tak się dzieje po powrocie do starszej wersji aplikacji, jeśli nowsza podniosła numer bazy.
// Dlatego najpierw otwieramy bazę BEZ numeru (nigdy VersionError), a numer podnosimy tylko wtedy,
// gdy brakuje magazynów. Numeru nigdy nie obniżamy i nie usuwamy żadnych danych.

const FRESH_DATABASE = Symbol('fresh-indexeddb-database');
const DEFAULT_TIMEOUT_MS = 10000;

function requestDatabase({ name, version, upgrade, timeoutMs, errorMessage, existingOnly }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let blocked = false;
    let fresh = false;
    let timer = null;
    const finish = (error, db = null) => {
      if (settled) {
        try { if (db && db !== FRESH_DATABASE) db.close(); } catch { /* już zamknięta */ }
        return;
      }
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (error) reject(error);
      else resolve(db);
    };
    let request;
    try {
      request = existingOnly ? indexedDB.open(name) : indexedDB.open(name, version);
    } catch (error) {
      finish(error);
      return;
    }
    timer = setTimeout(() => finish(new Error(blocked
      ? `${errorMessage} Aktualizacja lokalnej bazy czeka na zamknięcie innego okna WAWIS.`
      : `${errorMessage} Przekroczono limit czasu.`)), timeoutMs);
    request.onupgradeneeded = (event) => {
      // Otwarcie bez numeru na telefonie bez tej bazy utworzyłoby pustą v1 — przerywamy i zakładamy właściwą wersję.
      if (existingOnly && Number(event?.oldVersion || 0) === 0) {
        fresh = true;
        try { request.transaction.abort(); } catch { /* transakcja już zakończona */ }
        return;
      }
      upgrade(request.result, request.transaction, Number(event?.oldVersion || 0));
    };
    request.onblocked = () => { blocked = true; };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      finish(null, db);
    };
    request.onerror = (event) => {
      if (fresh) {
        event?.preventDefault?.();
        finish(null, FRESH_DATABASE);
        return;
      }
      finish(request.error || new Error(errorMessage));
    };
  });
}

/**
 * @param {object} options
 * @param {string} options.name nazwa bazy
 * @param {number} options.version minimalna wersja ze wszystkimi magazynami
 * @param {(db: IDBDatabase) => boolean} options.isReady czy baza ma wszystkie magazyny i indeksy
 * @param {(db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void} options.upgrade tworzy brakujące magazyny (bez usuwania danych)
 */
export async function openIndexedDbWithoutDowngrade({
  name,
  version,
  isReady,
  upgrade,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  errorMessage = 'Nie udało się otworzyć lokalnej bazy.',
}) {
  if (typeof indexedDB === 'undefined') return null;
  const base = { name, version, upgrade, timeoutMs, errorMessage };
  // 1. Bez numeru wersji — nigdy VersionError (także gdy telefon ma bazę nowszej wersji aplikacji).
  const current = await requestDatabase({ ...base, existingOnly: true });
  // 2. Nowa instalacja: zakładamy bazę we właściwej wersji.
  if (current === FRESH_DATABASE) return requestDatabase({ ...base, existingOnly: false });
  // 3. Baza w tej lub nowszej wersji ze wszystkimi magazynami: używamy jej bez zmiany numeru.
  const currentVersion = Number(current.version || 0);
  if (currentVersion >= version && isReady(current)) return current;
  current.close();
  // 4. Starsza wersja: niedestrukcyjne podniesienie.
  if (currentVersion < version) return requestDatabase({ ...base, existingOnly: false });
  // 5. Wersja >= wymaganej, ale brak magazynu: dodajemy go o jeden numer wyżej — nigdy nie obniżamy.
  return requestDatabase({ ...base, version: currentVersion + 1, existingOnly: false });
}
