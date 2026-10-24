import { summarizePhotoDiagnosticQueue } from '../../modules/diagnostics-package4.js';
const DB_NAME = 'wawis-mobile-photo-queue';
// WAWIS 13.62: minimalna wersja bazy. Schemat v3 i v4 jest identyczny (ten sam magazyn i indeksy).
// Telefony, które 22.10 uruchomiły 13.42–13.48, mają już v4; kod nigdy nie żąda wersji niższej
// niż istniejąca (VersionError) i otwiera także przyszłe wersje z tym samym magazynem.
const DB_VERSION = 4;
const STORE_NAME = 'queued-photos';
const OPEN_TIMEOUT_MS = 6000;
const RESET_TIMEOUT_MS = 8000;
export const PHOTO_QUEUE_CHANGED_EVENT = 'wawis-photo-queue-changed';
export const PHOTO_QUEUE_DB_NAME = DB_NAME;

export const PHOTO_QUEUE_ERROR_CODES = Object.freeze({
  UNAVAILABLE: 'PHOTO_QUEUE_UNAVAILABLE',
  VERSION: 'PHOTO_QUEUE_VERSION_MISMATCH',
  BLOCKED: 'PHOTO_QUEUE_BLOCKED',
  TIMEOUT: 'PHOTO_QUEUE_TIMEOUT',
  QUOTA: 'PHOTO_QUEUE_QUOTA',
  OPEN: 'PHOTO_QUEUE_OPEN_FAILED',
  READ: 'PHOTO_QUEUE_READ_FAILED',
  WRITE: 'PHOTO_QUEUE_WRITE_FAILED',
  RESET: 'PHOTO_QUEUE_RESET_FAILED',
});

let lastPhotoQueueError = null;

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function classifyPhotoQueueError(error, fallbackCode = PHOTO_QUEUE_ERROR_CODES.OPEN) {
  if (error?.photoQueueCode) return error.photoQueueCode;
  const name = String(error?.name || '');
  const text = `${name} ${String(error?.message || error || '')}`.toLowerCase();
  if (name === 'VersionError' || /requested version|less than the existing version|versionerror/.test(text)) return PHOTO_QUEUE_ERROR_CODES.VERSION;
  if (name === 'QuotaExceededError' || /quota|exceeded|no space|brak miejsca/.test(text)) return PHOTO_QUEUE_ERROR_CODES.QUOTA;
  return fallbackCode;
}

function createPhotoQueueError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.photoQueueCode = code;
  if (cause) error.cause = cause;
  return error;
}

function rememberPhotoQueueError(error, fallbackCode, context) {
  const code = classifyPhotoQueueError(error, fallbackCode);
  lastPhotoQueueError = { code, at: new Date().toISOString(), context };
  // Kod w obiekcie trafia do diagnostyki jako bezpieczny, znany kod (bez treści danych).
  console.warn(`[${code}] ${context}`, { code, name: String(error?.name || ''), message: String(error?.message || '').slice(0, 160) });
  return code;
}

export function getLastPhotoQueueError() {
  return lastPhotoQueueError ? { ...lastPhotoQueueError } : null;
}

export function describePhotoQueueFailure(code = '') {
  switch (code) {
    case PHOTO_QUEUE_ERROR_CODES.QUOTA:
      return 'Brak miejsca w pamięci telefonu na zapis zdjęcia. Zwolnij miejsce i spróbuj ponownie.';
    case PHOTO_QUEUE_ERROR_CODES.BLOCKED:
    case PHOTO_QUEUE_ERROR_CODES.TIMEOUT:
      return 'Lokalna kolejka zdjęć jest zajęta przez inne okno WAWIS. Zamknij pozostałe okna/karty WAWIS i spróbuj ponownie.';
    case PHOTO_QUEUE_ERROR_CODES.VERSION:
    case PHOTO_QUEUE_ERROR_CODES.OPEN:
    case PHOTO_QUEUE_ERROR_CODES.READ:
    case PHOTO_QUEUE_ERROR_CODES.WRITE:
    case PHOTO_QUEUE_ERROR_CODES.UNAVAILABLE:
      return 'Lokalna kolejka zdjęć na tym telefonie jest niedostępna. Otwórz Synchronizację i użyj „Napraw kolejkę zdjęć”.';
    default:
      return 'Nie udało się zapisać zdjęcia w pamięci telefonu.';
  }
}

function dispatchQueueChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(PHOTO_QUEUE_CHANGED_EVENT));
  } catch {
    window.dispatchEvent(new Event(PHOTO_QUEUE_CHANGED_EVENT));
  }
}

function ensureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique: false });
  }
}

function ensureSchema(request) {
  const db = request.result;
  const store = db.objectStoreNames.contains(STORE_NAME)
    ? request.transaction.objectStore(STORE_NAME)
    : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  ensureIndex(store, 'created_at', 'created_at');
  ensureIndex(store, 'job_id', 'job_id');
  ensureIndex(store, 'upload_key', 'upload_key');
  ensureIndex(store, 'unit_key', 'unit_key');
  ensureIndex(store, 'file_fingerprint', 'file_fingerprint');
  ensureIndex(store, 'next_attempt_at', 'next_attempt_at');
  // Celowo nie usuwamy ani nie nadpisujemy żadnego rekordu podczas podnoszenia wersji.
}

function createOpenRequest(mode, repairVersion = 0) {
  if (mode === 'existing') return indexedDB.open(DB_NAME);
  if (mode === 'upgrade') return indexedDB.open(DB_NAME, DB_VERSION);
  return indexedDB.open(DB_NAME, repairVersion);
}

// Każde otwarcie ma limit czasu: zablokowany upgrade (stara karta trzyma połączenie)
// nie może zawiesić zapisu ani udawać pustej kolejki.
function requestQueueDb(mode, repairVersion = 0) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let blocked = false;
    let timer = null;
    const finish = (error, db = null) => {
      if (settled) {
        try { db?.close(); } catch { /* połączenie już zamknięte */ }
        return;
      }
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (error) reject(error);
      else resolve(db);
    };
    let request;
    try {
      request = createOpenRequest(mode, repairVersion);
    } catch (error) {
      finish(createPhotoQueueError(classifyPhotoQueueError(error), 'Nie udało się otworzyć lokalnej kolejki zdjęć.', error));
      return;
    }
    timer = setTimeout(() => finish(createPhotoQueueError(
      blocked ? PHOTO_QUEUE_ERROR_CODES.BLOCKED : PHOTO_QUEUE_ERROR_CODES.TIMEOUT,
      blocked
        ? 'Aktualizacja lokalnej kolejki zdjęć czeka na zamknięcie innego okna WAWIS.'
        : 'Otwarcie lokalnej kolejki zdjęć przekroczyło limit czasu.',
    )), OPEN_TIMEOUT_MS);
    request.onupgradeneeded = () => ensureSchema(request);
    request.onblocked = () => { blocked = true; };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      finish(null, db);
    };
    request.onerror = () => {
      const error = request.error || new Error('Nie udało się otworzyć lokalnej kolejki zdjęć.');
      finish(createPhotoQueueError(classifyPhotoQueueError(error), 'Nie udało się otworzyć lokalnej kolejki zdjęć.', error));
    };
  });
}

async function openQueueDb() {
  if (!hasIndexedDb()) return null;
  // 1. Otwarcie bez numeru wersji nigdy nie kończy się VersionError (v3, v4 i przyszłe v5+).
  const current = await requestQueueDb('existing');
  if (current.version >= DB_VERSION && current.objectStoreNames.contains(STORE_NAME)) return current;
  const currentVersion = Number(current.version || 0);
  const hasStore = current.objectStoreNames.contains(STORE_NAME);
  current.close();
  // 2. v1–v3 (lub nowa instalacja): niedestrukcyjne podniesienie do v4.
  if (currentVersion < DB_VERSION) return requestQueueDb('upgrade');
  // 3. Wyższa wersja bez magazynu (nie powinno wystąpić): dodajemy magazyn, nie obniżamy wersji.
  return requestQueueDb('repair', currentVersion + (hasStore ? 0 : 1));
}

async function withStore(mode, operation) {
  const db = await openQueueDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;
    try {
      request = operation(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(request?.result ?? null);
    };
    transaction.onerror = () => {
      const error = transaction.error || request?.error || new Error('Błąd lokalnej kolejki zdjęć.');
      db.close();
      reject(error);
    };
    transaction.onabort = transaction.onerror;
  });
}

function toSerializableRecord(photo = {}) {
  const localFile = photo.__localFile || photo.local_file || null;
  const preparedFile = photo.__preparedFile || photo.prepared_file || null;
  return {
    id: String(photo.id || ''),
    job_id: photo.job_id,
    created_at: photo.created_at || new Date().toISOString(),
    uploaded_by: photo.uploaded_by || '',
    user_id: photo.user_id || photo.uploaded_by || '',
    uploader_name: photo.uploader_name || 'Pracownik',
    upload_status: photo.upload_status || 'local',
    upload_status_label: photo.upload_status_label || 'Zapisano na telefonie',
    upload_error: photo.upload_error || '',
    upload_key: photo.upload_key || '',
    unit_key: photo.unit_key || '',
    file_fingerprint: photo.file_fingerprint || '',
    planned_storage_path: photo.planned_storage_path || photo.storage_path || '',
    legacy_queue_item: Boolean(photo.legacy_queue_item),
    local_file_name: photo.local_file_name || localFile?.name || 'zdjecie.jpg',
    local_file_type: localFile?.type || photo.local_file_type || 'image/jpeg',
    local_file_last_modified: localFile?.lastModified || photo.local_file_last_modified || Date.now(),
    local_file: localFile,
    photo_kind: photo.photo_kind || '',
    device_index: Number(photo.device_index || 0),
    unit_ref: photo.unit_ref || '',
    device_ref: photo.device_ref || '',
    serial_number: photo.serial_number || '',
    documentation_label: photo.documentation_label || '',
    ocr_status: photo.ocr_status || '',
    ocr_checked_at: photo.ocr_checked_at || null,
    retry_count: Number(photo.retry_count || 0),
    last_attempt_at: photo.last_attempt_at || '',
    next_attempt_at: photo.next_attempt_at || '',
    lease_until: photo.lease_until || '',
    upload_stage: photo.upload_stage || 'queued',
    prepared_file: preparedFile,
    prepared_file_name: photo.prepared_file_name || preparedFile?.name || '',
    prepared_file_type: photo.prepared_file_type || preparedFile?.type || '',
    prepared_file_last_modified: photo.prepared_file_last_modified || preparedFile?.lastModified || 0,
    upload_original_size: Number(photo.upload_original_size || localFile?.size || 0),
    upload_file_size: Number(photo.upload_file_size || preparedFile?.size || 0),
    upload_saved_percent: Number(photo.upload_saved_percent || 0),
    upload_compressed: Boolean(photo.upload_compressed),
  };
}

// Zwraca true WYŁĄCZNIE po zakończonej (commit) transakcji IndexedDB.
export async function savePhotoQueueItem(photo) {
  if (!photo?.id || !(photo.__localFile || photo.local_file)) return false;
  if (!hasIndexedDb()) {
    rememberPhotoQueueError(null, PHOTO_QUEUE_ERROR_CODES.UNAVAILABLE, 'Przeglądarka nie udostępnia IndexedDB — zdjęcie nie zostało zapisane w pamięci telefonu.');
    return false;
  }
  try {
    await withStore('readwrite', (store) => store.put(toSerializableRecord(photo)));
    lastPhotoQueueError = null;
    dispatchQueueChanged();
    return true;
  } catch (error) {
    rememberPhotoQueueError(error, PHOTO_QUEUE_ERROR_CODES.WRITE, 'Nie udało się zapisać zdjęcia w pamięci telefonu.');
    return false;
  }
}

export async function updatePhotoQueueItem(photoId, patch = {}) {
  if (!photoId) return false;
  let db = null;
  try {
    db = await openQueueDb();
    if (!db) return false;
    const updated = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(String(photoId));
      let didUpdate = false;
      request.onsuccess = () => {
        const current = request.result;
        if (!current) return;
        store.put({ ...current, ...patch, id: String(photoId) });
        didUpdate = true;
      };
      request.onerror = () => reject(request.error || new Error('Nie udało się odczytać zdjęcia do aktualizacji.'));
      transaction.oncomplete = () => resolve(didUpdate);
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się zaktualizować lokalnego statusu zdjęcia.'));
      transaction.onabort = transaction.onerror;
    });
    if (updated) dispatchQueueChanged();
    return updated;
  } catch (error) {
    // Błąd otwarcia lub zapisu statusu nigdy nie może przerwać wysyłki wyjątkiem (np. VersionError).
    rememberPhotoQueueError(error, PHOTO_QUEUE_ERROR_CODES.WRITE, 'Nie udało się zaktualizować lokalnego statusu zdjęcia.');
    return false;
  } finally {
    try { db?.close(); } catch { /* już zamknięte */ }
  }
}

export async function deletePhotoQueueItem(photoId) {
  if (!photoId) return false;
  try {
    await withStore('readwrite', (store) => store.delete(String(photoId)));
    dispatchQueueChanged();
    return true;
  } catch (error) {
    rememberPhotoQueueError(error, PHOTO_QUEUE_ERROR_CODES.WRITE, 'Nie udało się usunąć zdjęcia z lokalnej kolejki.');
    return false;
  }
}

// Stan kolejki dla interfejsu: błąd odczytu NIE jest pustą kolejką.
export async function readPhotoQueueState() {
  if (!hasIndexedDb()) {
    return { ok: false, items: [], code: PHOTO_QUEUE_ERROR_CODES.UNAVAILABLE, message: describePhotoQueueFailure(PHOTO_QUEUE_ERROR_CODES.UNAVAILABLE) };
  }
  try {
    const records = await withStore('readonly', (store) => store.getAll());
    const items = Array.isArray(records)
      ? records.sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')))
      : [];
    return { ok: true, items, code: '', message: '' };
  } catch (error) {
    const code = rememberPhotoQueueError(error, PHOTO_QUEUE_ERROR_CODES.READ, 'Nie udało się odczytać lokalnej kolejki zdjęć.');
    return { ok: false, items: [], code, message: describePhotoQueueFailure(code) };
  }
}

// Dla wewnętrznych pętli wysyłki: przy błędzie odczytu nic nie wysyłamy i niczego nie usuwamy.
// Interfejs musi korzystać z readPhotoQueueState(), żeby nie pokazać „Wszystko wysłane”.
export async function listPhotoQueueItems() {
  const state = await readPhotoQueueState();
  return state.items;
}

export async function recoverStalePhotoQueueItems(nowMs = Date.now()) {
  const items = await listPhotoQueueItems();
  let recovered = 0;
  for (const item of items) {
    if (String(item.upload_status || '').toLowerCase() !== 'uploading') continue;
    const leaseUntil = Date.parse(item.lease_until || '');
    if (Number.isFinite(leaseUntil) && leaseUntil > nowMs) continue;
    await updatePhotoQueueItem(item.id, {
      upload_status: 'local',
      upload_status_label: 'Zapisano na telefonie',
      lease_until: '',
    });
    recovered += 1;
  }
  return recovered;
}

export async function claimPhotoQueueItem(photoId, { leaseMs = 3 * 60 * 1000, force = false } = {}) {
  if (!photoId) return null;
  let db = null;
  try {
    db = await openQueueDb();
  } catch (error) {
    rememberPhotoQueueError(error, PHOTO_QUEUE_ERROR_CODES.OPEN, 'Nie udało się przejąć zdjęcia z lokalnej kolejki.');
    return null;
  }
  if (!db) return null;
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(String(photoId));
      let claimed = null;
      request.onsuccess = () => {
        const current = request.result;
        if (!current) return;
        const nowMs = Date.now();
        const leaseUntil = Date.parse(current.lease_until || '');
        const nextAttempt = Date.parse(current.next_attempt_at || '');
        if (String(current.upload_status || '').toLowerCase() === 'uploading'
          && Number.isFinite(leaseUntil) && leaseUntil > nowMs) return;
        if (!force && Number.isFinite(nextAttempt) && nextAttempt > nowMs) return;
        claimed = {
          ...current,
          upload_status: 'uploading',
          upload_status_label: 'Wysyłanie',
          lease_until: new Date(nowMs + Math.max(30000, Number(leaseMs) || 0)).toISOString(),
        };
        store.put(claimed);
      };
      request.onerror = () => reject(request.error || new Error('Nie udało się przejąć zdjęcia z kolejki.'));
      transaction.oncomplete = () => {
        if (claimed) dispatchQueueChanged();
        resolve(claimed);
      };
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się przejąć zdjęcia z kolejki.'));
      transaction.onabort = transaction.onerror;
    });
  } catch (error) {
    rememberPhotoQueueError(error, PHOTO_QUEUE_ERROR_CODES.WRITE, 'Nie udało się przejąć zdjęcia z lokalnej kolejki.');
    return null;
  } finally {
    db.close();
  }
}

export async function getPhotoQueueSummary(userId = '') {
  const state = await readPhotoQueueState();
  const summary = summarizePhotoDiagnosticQueue(state.items, userId);
  return state.ok ? summary : { ...summary, readError: state.code, readErrorMessage: state.message };
}

async function countPhotoQueueRecordsForReset() {
  const state = await readPhotoQueueState();
  return state.ok ? state.items.length : null;
}

// „Napraw kolejkę zdjęć”: usuwa WYŁĄCZNIE lokalną bazę wawis-mobile-photo-queue (niewysłane zdjęcia
// z tego telefonu) i zakłada ją od nowa. Nie dotyka montaży, urządzeń, protokołów, podpisów, sesji,
// innych kolejek offline ani danych na serwerze. Wywoływać tylko po wyraźnej zgodzie użytkownika.
// Zwraca ok:true wyłącznie po potwierdzonym usunięciu i ponownym otwarciu pustej kolejki.
export async function resetPhotoQueueDatabase({ timeoutMs = RESET_TIMEOUT_MS } = {}) {
  if (!hasIndexedDb()) {
    return { ok: false, code: PHOTO_QUEUE_ERROR_CODES.UNAVAILABLE, message: 'Ta przeglądarka nie udostępnia pamięci IndexedDB.' };
  }
  const deleted = await new Promise((resolve) => {
    let settled = false;
    let blocked = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({
      ok: false,
      code: blocked ? PHOTO_QUEUE_ERROR_CODES.BLOCKED : PHOTO_QUEUE_ERROR_CODES.TIMEOUT,
      message: blocked
        ? 'Czyszczenie czeka na zamknięcie innego okna WAWIS. Zamknij pozostałe okna/karty WAWIS i spróbuj ponownie. Czyszczenie NIE zostało potwierdzone.'
        : 'Czyszczenie kolejki przekroczyło limit czasu. Czyszczenie NIE zostało potwierdzone.',
    }), Math.max(1000, Number(timeoutMs) || RESET_TIMEOUT_MS));
    let request;
    try {
      request = indexedDB.deleteDatabase(DB_NAME);
    } catch (error) {
      finish({ ok: false, code: PHOTO_QUEUE_ERROR_CODES.RESET, message: 'Przeglądarka odrzuciła usunięcie lokalnej kolejki zdjęć.' });
      return;
    }
    request.onblocked = () => { blocked = true; };
    request.onsuccess = () => finish({ ok: true });
    request.onerror = () => finish({ ok: false, code: PHOTO_QUEUE_ERROR_CODES.RESET, message: 'Nie udało się usunąć lokalnej kolejki zdjęć.' });
  });
  if (!deleted.ok) {
    rememberPhotoQueueError(null, deleted.code, 'Czyszczenie lokalnej kolejki zdjęć nie zostało potwierdzone.');
    return deleted;
  }
  // Weryfikacja: nowa, pusta kolejka musi dać się otworzyć i odczytać.
  const remaining = await countPhotoQueueRecordsForReset();
  if (remaining !== 0) {
    const code = getLastPhotoQueueError()?.code || PHOTO_QUEUE_ERROR_CODES.RESET;
    return { ok: false, code, message: 'Kolejka została usunięta, ale nie udało się potwierdzić nowej, pustej kolejki. Spróbuj ponownie.' };
  }
  lastPhotoQueueError = null;
  dispatchQueueChanged();
  return { ok: true, code: '', message: 'Lokalna kolejka zdjęć została wyczyszczona i założona od nowa.' };
}

// Liczba rekordów do komunikatu potwierdzenia (null = nie da się odczytać, np. VersionError).
export async function countPhotoQueueRecords() {
  return countPhotoQueueRecordsForReset();
}

export function hydratePhotoQueueItem(record = {}, createPreviewUrl) {
  const blob = record.local_file || null;
  if (!blob) return null;
  const file = blob instanceof File
    ? blob
    : new File([blob], record.local_file_name || 'zdjecie.jpg', {
      type: record.local_file_type || blob.type || 'image/jpeg',
      lastModified: Number(record.local_file_last_modified || Date.now()),
    });
  const previewUrl = typeof createPreviewUrl === 'function' ? createPreviewUrl(file) : '';
  const preparedBlob = record.prepared_file || null;
  const preparedFile = preparedBlob
    ? (preparedBlob instanceof File
      ? preparedBlob
      : new File([preparedBlob], record.prepared_file_name || 'zdjecie-wysylka.jpg', {
        type: record.prepared_file_type || preparedBlob.type || 'image/jpeg',
        lastModified: Number(record.prepared_file_last_modified || Date.now()),
      }))
    : null;
  return {
    id: String(record.id || ''),
    job_id: record.job_id,
    image_url: previewUrl,
    original_image_url: previewUrl,
    signed_url: previewUrl,
    storage_path: record.planned_storage_path || '',
    planned_storage_path: record.planned_storage_path || '',
    upload_key: record.upload_key || '',
    unit_key: record.unit_key || '',
    file_fingerprint: record.file_fingerprint || '',
    legacy_queue_item: Boolean(record.legacy_queue_item),
    uploaded_by: record.uploaded_by || '',
    user_id: record.user_id || record.uploaded_by || '',
    created_at: record.created_at || new Date().toISOString(),
    uploader_name: record.uploader_name || 'Pracownik',
    upload_status: record.upload_status === 'uploading' ? 'local' : (record.upload_status || 'local'),
    upload_status_label: record.upload_status === 'error' ? 'Błąd wysyłania' : 'Zapisano na telefonie',
    upload_error: record.upload_error || '',
    local_preview_url: previewUrl,
    local_file_name: record.local_file_name || file.name || 'zdjecie.jpg',
    __localFile: file,
    photo_kind: record.photo_kind || '',
    device_index: Number(record.device_index || 0),
    unit_ref: record.unit_ref || '',
    device_ref: record.device_ref || '',
    serial_number: record.serial_number || '',
    documentation_label: record.documentation_label || '',
    ocr_status: record.ocr_status || '',
    ocr_checked_at: record.ocr_checked_at || null,
    retry_count: Number(record.retry_count || 0),
    last_attempt_at: record.last_attempt_at || '',
    next_attempt_at: record.next_attempt_at || '',
    lease_until: record.lease_until || '',
    upload_stage: record.upload_stage || 'queued',
    __preparedFile: preparedFile,
    upload_original_size: Number(record.upload_original_size || file.size || 0),
    upload_file_size: Number(record.upload_file_size || preparedFile?.size || 0),
    upload_saved_percent: Number(record.upload_saved_percent || 0),
    upload_compressed: Boolean(record.upload_compressed),
  };
}
