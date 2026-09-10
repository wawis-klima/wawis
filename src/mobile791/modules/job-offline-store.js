const DB_NAME = 'wawis-mobile-offline-data';
const DB_VERSION = 2;
const SNAPSHOT_STORE = 'app-snapshots';
const OPERATION_STORE = 'job-operations';

export const JOB_OFFLINE_CHANGED_EVENT = 'wawis-job-offline-changed';

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function dispatchOfflineChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(JOB_OFFLINE_CHANGED_EVENT));
  } catch {
    window.dispatchEvent(new Event(JOB_OFFLINE_CHANGED_EVENT));
  }
}

function ensureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
}

function openOfflineDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'user_id' });
      }
      const operationStore = db.objectStoreNames.contains(OPERATION_STORE)
        ? request.transaction.objectStore(OPERATION_STORE)
        : db.createObjectStore(OPERATION_STORE, { keyPath: 'id' });
      ensureIndex(operationStore, 'user_id', 'user_id');
      ensureIndex(operationStore, 'job_id', 'job_id');
      ensureIndex(operationStore, 'created_at', 'created_at');
      ensureIndex(operationStore, 'status', 'status');
      ensureIndex(operationStore, 'next_attempt_at', 'next_attempt_at');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Nie udało się otworzyć pamięci offline.'));
  });
}

async function withStore(storeName, mode, operation) {
  const db = await openOfflineDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
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
      const error = transaction.error || request?.error || new Error('Błąd pamięci offline.');
      db.close();
      reject(error);
    };
    transaction.onabort = transaction.onerror;
  });
}

function stripTemporaryPhotoData(photo = {}) {
  const values = [photo.image_url, photo.signed_url, photo.original_image_url];
  if (values.some((value) => String(value || '').startsWith('blob:'))) return null;
  const { __localFile, local_file, ...safePhoto } = photo;
  return safePhoto;
}

function sanitizeJobs(jobs = []) {
  return (Array.isArray(jobs) ? jobs : []).map((job) => ({
    ...job,
    photos: (Array.isArray(job?.photos) ? job.photos : [])
      .map(stripTemporaryPhotoData)
      .filter(Boolean),
  }));
}

export async function saveOfflineAppSnapshot({
  userId,
  profile,
  profiles = [],
  jobs = [],
  serverFetchedAtMs = Date.now(),
  changeCursor = null,
}) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedServerFetchedAtMs = Math.max(0, Number(serverFetchedAtMs) || 0);
  if (!normalizedUserId || !normalizedServerFetchedAtMs) return false;

  let db;
  try {
    db = await openOfflineDb();
    if (!db) return false;
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOT_STORE, 'readwrite');
      const store = transaction.objectStore(SNAPSHOT_STORE);
      const readRequest = store.get(normalizedUserId);
      let shouldWrite = false;

      readRequest.onsuccess = () => {
        const currentVersion = Number(readRequest.result?.server_fetched_at_ms || 0);
        if (currentVersion > normalizedServerFetchedAtMs) return;
        shouldWrite = true;
        const hasRequestedCursor = changeCursor !== null && changeCursor !== undefined && changeCursor !== '';
        const requestedCursor = Number(changeCursor);
        store.put({
          user_id: normalizedUserId,
          profile: profile || null,
          profiles: Array.isArray(profiles) ? profiles : [],
          jobs: sanitizeJobs(jobs),
          server_fetched_at_ms: normalizedServerFetchedAtMs,
          change_cursor: hasRequestedCursor && Number.isFinite(requestedCursor) && requestedCursor >= 0
            ? Math.max(Number(readRequest.result?.change_cursor || 0), requestedCursor)
            : Number(readRequest.result?.change_cursor || 0),
          saved_at: new Date().toISOString(),
        });
      };
      readRequest.onerror = () => reject(readRequest.error || new Error('Nie udało się porównać lokalnej kopii kart.'));
      transaction.oncomplete = () => resolve(shouldWrite);
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się zapisać lokalnej kopii kart.'));
      transaction.onabort = transaction.onerror;
    });
  } catch (error) {
    console.warn('Nie udało się zapisać kart montażu offline.', error?.message || error);
    return false;
  } finally {
    db?.close();
  }
}

export async function updateOfflineSyncCursor(userId, changeCursor) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedCursor = Math.max(0, Number(changeCursor) || 0);
  if (!normalizedUserId) return false;
  try {
    const current = await withStore(SNAPSHOT_STORE, 'readonly', (store) => store.get(normalizedUserId));
    if (!current) return false;
    if (Number(current.change_cursor || 0) >= normalizedCursor) return true;
    await withStore(SNAPSHOT_STORE, 'readwrite', (store) => store.put({
      ...current,
      user_id: normalizedUserId,
      change_cursor: normalizedCursor,
      saved_at: new Date().toISOString(),
    }));
    return true;
  } catch (error) {
    console.warn('Nie udało się zapisać punktu wznowienia synchronizacji.', error?.message || error);
    return false;
  }
}

export async function loadOfflineAppSnapshot(userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  try {
    return await withStore(SNAPSHOT_STORE, 'readonly', (store) => store.get(normalizedUserId));
  } catch (error) {
    console.warn('Nie udało się odczytać kart montażu offline.', error?.message || error);
    return null;
  }
}

export async function clearOfflineAppSnapshot(userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return false;
  try {
    await withStore(SNAPSHOT_STORE, 'readwrite', (store) => store.delete(normalizedUserId));
    return true;
  } catch (error) {
    console.warn('Nie udało się wyczyścić lokalnej kopii kart.', error?.message || error);
    return false;
  }
}

export function createOfflineOperationId(prefix = 'operation') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createOfflineUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function queueOfflineJobOperation(operation = {}) {
  if (!operation.user_id || !operation.job_id || !operation.type) return null;
  const record = {
    id: String(operation.id || createOfflineOperationId(operation.type)),
    user_id: String(operation.user_id),
    job_id: String(operation.job_id),
    type: String(operation.type),
    payload: operation.payload || {},
    base: operation.base || {},
    status: 'pending',
    error: '',
    retry_count: 0,
    created_at: operation.created_at || new Date().toISOString(),
    last_attempt_at: '',
    next_attempt_at: '',
    lease_until: '',
  };

  try {
    // Dla danych urządzenia i statusu liczy się ostatnia decyzja pracownika.
    // Komentarzy nie łączymy, bo każdy jest osobnym wpisem.
    if (record.type !== 'comment') {
      const existing = await listOfflineJobOperations(record.user_id);
      const superseded = existing.filter((item) => item.job_id === record.job_id && item.type === record.type);
      if (superseded[0]?.base) record.base = superseded[0].base;
      for (const item of superseded) {
        await withStore(OPERATION_STORE, 'readwrite', (store) => store.delete(item.id));
      }
    }
    await withStore(OPERATION_STORE, 'readwrite', (store) => store.put(record));
    dispatchOfflineChanged();
    return record;
  } catch (error) {
    console.warn('Nie udało się zapisać zmiany w kolejce offline.', error?.message || error);
    throw error;
  }
}

export async function recoverStaleOfflineJobOperations(userId = '', nowMs = Date.now()) {
  const records = await listOfflineJobOperations(userId);
  let recovered = 0;
  for (const record of records) {
    if (record.status !== 'syncing') continue;
    const leaseUntil = Date.parse(record.lease_until || '');
    if (Number.isFinite(leaseUntil) && leaseUntil > nowMs) continue;
    await updateOfflineJobOperation(record.id, {
      status: 'pending',
      lease_until: '',
      error: '',
    });
    recovered += 1;
  }
  return recovered;
}

export async function claimOfflineJobOperation(operationId, leaseMs = 2 * 60 * 1000) {
  if (!operationId) return null;
  let db;
  try {
    db = await openOfflineDb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(OPERATION_STORE, 'readwrite');
      const store = transaction.objectStore(OPERATION_STORE);
      const request = store.get(String(operationId));
      let claimed = null;
      request.onsuccess = () => {
        const current = request.result;
        if (!current || current.status === 'conflict') return;
        const nowMs = Date.now();
        const leaseUntil = Date.parse(current.lease_until || '');
        const nextAttempt = Date.parse(current.next_attempt_at || '');
        if (current.status === 'syncing' && Number.isFinite(leaseUntil) && leaseUntil > nowMs) return;
        if (Number.isFinite(nextAttempt) && nextAttempt > nowMs) return;
        claimed = {
          ...current,
          status: 'syncing',
          error: '',
          last_attempt_at: new Date(nowMs).toISOString(),
          next_attempt_at: '',
          lease_until: new Date(nowMs + Math.max(30000, Number(leaseMs) || 0)).toISOString(),
          retry_count: Number(current.retry_count || 0) + 1,
        };
        store.put(claimed);
      };
      request.onerror = () => reject(request.error || new Error('Nie udało się przejąć zmiany offline.'));
      transaction.oncomplete = () => {
        if (claimed) dispatchOfflineChanged();
        resolve(claimed);
      };
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się przejąć zmiany offline.'));
      transaction.onabort = transaction.onerror;
    });
  } finally {
    db?.close();
  }
}

export async function listOfflineJobOperations(userId = '') {
  try {
    const records = await withStore(OPERATION_STORE, 'readonly', (store) => store.getAll());
    const normalizedUserId = String(userId || '').trim();
    return (Array.isArray(records) ? records : [])
      .filter((item) => !normalizedUserId || String(item.user_id) === normalizedUserId)
      .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
  } catch (error) {
    console.warn('Nie udało się odczytać kolejki zmian offline.', error?.message || error);
    return [];
  }
}

export async function updateOfflineJobOperation(operationId, patch = {}) {
  if (!operationId) return false;
  try {
    const current = await withStore(OPERATION_STORE, 'readonly', (store) => store.get(String(operationId)));
    if (!current) return false;
    await withStore(OPERATION_STORE, 'readwrite', (store) => store.put({ ...current, ...patch, id: String(operationId) }));
    dispatchOfflineChanged();
    return true;
  } catch (error) {
    console.warn('Nie udało się zaktualizować zmiany offline.', error?.message || error);
    return false;
  }
}

export async function deleteOfflineJobOperation(operationId) {
  if (!operationId) return false;
  try {
    await withStore(OPERATION_STORE, 'readwrite', (store) => store.delete(String(operationId)));
    dispatchOfflineChanged();
    return true;
  } catch (error) {
    console.warn('Nie udało się usunąć zmiany z kolejki offline.', error?.message || error);
    return false;
  }
}

export function applyOfflineOperationsToJobs(jobs = [], operations = [], profile = {}) {
  const operationsByJob = new Map();
  for (const operation of operations || []) {
    const jobId = String(operation?.job_id || '');
    if (!jobId) continue;
    if (!operationsByJob.has(jobId)) operationsByJob.set(jobId, []);
    operationsByJob.get(jobId).push(operation);
  }

  return (jobs || []).map((job) => {
    const jobOperations = operationsByJob.get(String(job?.id || '')) || [];
    if (!jobOperations.length) return job;
    let nextJob = { ...job, offline_pending: true };
    for (const operation of jobOperations) {
      if (operation.type === 'device') {
        nextJob = { ...nextJob, ...(operation.payload?.device_fields || {}) };
      } else if (operation.type === 'status') {
        nextJob = { ...nextJob, status: operation.payload?.status || nextJob.status };
      } else if (operation.type === 'comment') {
        const commentId = operation.payload?.comment_id || operation.id;
        const comments = Array.isArray(nextJob.comments) ? nextJob.comments : [];
        if (!comments.some((comment) => String(comment.id) === String(commentId))) {
          nextJob = {
            ...nextJob,
            detailsLoaded: true,
            comments: [...comments, {
              id: commentId,
              job_id: nextJob.id,
              author_id: profile.id || operation.user_id,
              author_name: profile.full_name || profile.email || 'Pracownik',
              type: operation.payload?.type || 'Komentarz',
              text: operation.payload?.text || '',
              created_at: operation.created_at,
              offline_pending: true,
            }],
          };
        }
      }
    }
    return nextJob;
  });
}
