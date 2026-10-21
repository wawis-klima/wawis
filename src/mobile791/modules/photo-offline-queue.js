import { summarizePhotoDiagnosticQueue } from '../../modules/diagnostics-package4.js';
const DB_NAME = 'wawis-mobile-photo-queue';
const DB_VERSION = 3;
const STORE_NAME = 'queued-photos';
export const PHOTO_QUEUE_CHANGED_EVENT = 'wawis-photo-queue-changed';

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
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

function openQueueDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Nie udało się otworzyć lokalnej kolejki zdjęć.'));
  });
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
    fingerprint_status: photo.fingerprint_status || '',
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
    attempt_generation: Number(photo.attempt_generation || 0),
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

export async function savePhotoQueueItem(photo) {
  if (!photo?.id || !(photo.__localFile || photo.local_file)) return false;
  const db = await openQueueDb();
  if (!db) return false;
  try {
    const saved = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(String(photo.id));
      let accepted = false;
      request.onsuccess = () => {
        const previous = request.result;
        const next = toSerializableRecord(photo);
        if (previous) {
          // Nawet poprawny duplikat nie może nadpisać aktywnego lease,
          // przygotowanego File ani informacji o nieudanej wysyłce.
          const sameOwner = String(previous.user_id || previous.uploaded_by || '')
            === String(next.user_id || next.uploaded_by || '');
          const sameVerifiedBytes = Boolean(previous.file_fingerprint && next.file_fingerprint)
            && previous.file_fingerprint === next.file_fingerprint
            && previous.fingerprint_status !== 'read_error'
            && next.fingerprint_status !== 'read_error';
          accepted = sameOwner && sameVerifiedBytes;
          return;
        }
        store.add(next);
        accepted = true;
      };
      request.onerror = () => reject(request.error || new Error('Nie udało się sprawdzić istniejącego zdjęcia.'));
      transaction.oncomplete = () => resolve(accepted);
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się zapisać zdjęcia w pamięci telefonu.'));
      transaction.onabort = transaction.onerror;
    });
    if (saved) dispatchQueueChanged();
    return saved;
  } catch (error) {
    console.warn('Nie udało się zapisać zdjęcia w pamięci telefonu.', error?.message || error);
    return false;
  } finally {
    db.close();
  }
}

export async function updatePhotoQueueItem(photoId, patch = {}, guard = {}) {
  if (!photoId) return false;
  const db = await openQueueDb();
  if (!db) return false;
  try {
    const updated = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(String(photoId));
      let didUpdate = false;
      request.onsuccess = () => {
        const current = request.result;
        if (!current) return;
        if (Object.prototype.hasOwnProperty.call(guard, 'expectedLeaseOwner')
          && String(current.lease_owner || '') !== String(guard.expectedLeaseOwner || '')) return;
        if (Object.prototype.hasOwnProperty.call(guard, 'expectedGeneration')
          && Number(current.attempt_generation || 0) !== Number(guard.expectedGeneration || 0)) return;
        // Nie pozwalamy starszej sesji nadpisać postępu aktywnego workera.
        if (!Object.prototype.hasOwnProperty.call(guard, 'expectedLeaseOwner')
          && current.upload_status === 'uploading'
          && Date.parse(current.lease_until || '') > Date.now()) return;
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
    console.warn('Nie udało się zaktualizować lokalnego statusu zdjęcia.', error?.message || error);
    return false;
  } finally {
    db.close();
  }
}

export async function deletePhotoQueueItem(photoId, guard = {}) {
  if (!photoId) return false;
  const db = await openQueueDb();
  if (!db) return false;
  try {
    const deleted = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(String(photoId));
      let didDelete = false;
      request.onsuccess = () => {
        const current = request.result;
        if (!current) return;
        if (Object.prototype.hasOwnProperty.call(guard, 'expectedLeaseOwner')
          && String(current.lease_owner || '') !== String(guard.expectedLeaseOwner || '')) return;
        if (Object.prototype.hasOwnProperty.call(guard, 'expectedGeneration')
          && Number(current.attempt_generation || 0) !== Number(guard.expectedGeneration || 0)) return;
        if (!Object.prototype.hasOwnProperty.call(guard, 'expectedLeaseOwner')
          && current.upload_status === 'uploading'
          && Date.parse(current.lease_until || '') > Date.now()) return;
        store.delete(String(photoId));
        didDelete = true;
      };
      request.onerror = () => reject(request.error || new Error('Nie udało się odczytać zdjęcia do usunięcia.'));
      transaction.oncomplete = () => resolve(didDelete);
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się usunąć zdjęcia.'));
      transaction.onabort = transaction.onerror;
    });
    if (deleted) dispatchQueueChanged();
    return deleted;
  } catch (error) {
    console.warn('Nie udało się usunąć zdjęcia z lokalnej kolejki.', error?.message || error);
    return false;
  } finally {
    db.close();
  }
}

export async function listPhotoQueueItems() {
  try {
    const records = await withStore('readonly', (store) => store.getAll());
    return Array.isArray(records)
      ? records.sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')))
      : [];
  } catch (error) {
    console.warn('Nie udało się odczytać lokalnej kolejki zdjęć.', error?.message || error);
    return [];
  }
}

export async function recoverStalePhotoQueueItems(nowMs = Date.now()) {
  const items = await listPhotoQueueItems();
  let recovered = 0;
  for (const item of items) {
    if (String(item.upload_status || '').toLowerCase() !== 'uploading') continue;
    const leaseUntil = Date.parse(item.lease_until || '');
    if (Number.isFinite(leaseUntil) && leaseUntil > nowMs) continue;
    const restored = await updatePhotoQueueItem(item.id, {
      upload_status: 'local',
      upload_status_label: 'Zapisano na telefonie',
      lease_until: '',
      lease_owner: '',
    }, { expectedLeaseOwner: item.lease_owner || '', expectedGeneration: Number(item.attempt_generation || 0) });
    if (!restored) continue;
    recovered += 1;
  }
  return recovered;
}

export async function claimPhotoQueueItem(photoId, { leaseMs = 3 * 60 * 1000, force = false } = {}) {
  if (!photoId) return null;
  const db = await openQueueDb();
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
        const storedClaim = {
          ...current,
          upload_status: 'uploading',
          upload_status_label: 'Wysyłanie',
          lease_until: new Date(nowMs + Math.max(30000, Number(leaseMs) || 0)).toISOString(),
          lease_owner: typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${nowMs}:${Math.random()}`,
          attempt_generation: Number(current.attempt_generation || 0) + 1,
        };
        store.put(storedClaim);
        // Poprzedni status nie trafia do IndexedDB: jest potrzebny tylko temu workerowi
        // do bezpiecznego wycofania porzuconego przejęcia.
        claimed = { ...storedClaim, __previous_upload_status: current.upload_status || 'local' };
      };
      request.onerror = () => reject(request.error || new Error('Nie udało się przejąć zdjęcia z kolejki.'));
      transaction.oncomplete = () => {
        if (claimed) dispatchQueueChanged();
        resolve(claimed);
      };
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się przejąć zdjęcia z kolejki.'));
      transaction.onabort = transaction.onerror;
    });
  } finally {
    db.close();
  }
}

// Zwolnienie tylko własnego lease. Nigdy nie kasujemy pliku ani rekordu kolejki,
// jeśli odpowiedź serwera nie potwierdziła jeszcze zapisu.
export async function releaseClaimedPhotoQueueItem(photoId, claimed = {}) {
  const leaseOwner = String(claimed.lease_owner || '');
  if (!photoId || !leaseOwner) return false;
  const db = await openQueueDb();
  if (!db) return false;
  try {
    const released = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(String(photoId));
      let didRelease = false;
      request.onsuccess = () => {
        const current = request.result;
        if (!current || current.upload_status !== 'uploading'
          || String(current.lease_owner || '') !== leaseOwner
          || Number(current.attempt_generation || 0) !== Number(claimed.attempt_generation || 0)) return;
        const previousStatus = String(claimed.__previous_upload_status || 'local').toLowerCase();
        const restoreError = previousStatus === 'error';
        store.put({
          ...current,
          upload_status: restoreError ? 'error' : 'local',
          upload_status_label: restoreError ? 'Błąd wysyłania' : 'Zapisano na telefonie',
          lease_until: '',
          lease_owner: '',
        });
        didRelease = true;
      };
      request.onerror = () => reject(request.error || new Error('Nie udało się odczytać blokady zdjęcia.'));
      transaction.oncomplete = () => resolve(didRelease);
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się zwolnić blokady zdjęcia.'));
      transaction.onabort = transaction.onerror;
    });
    if (released) dispatchQueueChanged();
    return released;
  } catch (error) {
    console.warn('Nie udało się zwolnić przerwanego przejęcia zdjęcia.', error?.message || error);
    return false;
  } finally {
    db.close();
  }
}

export async function getPhotoQueueSummary(userId = '') {
  const items = await listPhotoQueueItems();
  return summarizePhotoDiagnosticQueue(items, userId);
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
    fingerprint_status: record.fingerprint_status || '',
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
    attempt_generation: Number(record.attempt_generation || 0),
    lease_owner: record.lease_owner || '',
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
