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
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error || new Error('Nie udało się otworzyć pamięci offline.'));
  });
}

async function withStore(storeName, mode, operation) {
  const db = await openOfflineDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    let transaction;
    try { transaction = db.transaction(storeName, mode); }
    catch (error) { db.close(); reject(error); return; }
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
  let db;
  try {
    db = await openOfflineDb();
    if (!db) return false;
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOT_STORE, 'readwrite');
      const store = transaction.objectStore(SNAPSHOT_STORE);
      const readRequest = store.get(normalizedUserId);
      let found = false;

      readRequest.onsuccess = () => {
        const current = readRequest.result;
        if (!current) return;
        found = true;
        if (Number(current.change_cursor || 0) >= normalizedCursor) return;
        store.put({
          ...current,
          user_id: normalizedUserId,
          change_cursor: normalizedCursor,
          saved_at: new Date().toISOString(),
        });
      };
      readRequest.onerror = () => reject(readRequest.error || new Error('Nie udało się odczytać punktu wznowienia synchronizacji.'));
      transaction.oncomplete = () => resolve(found);
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się zapisać punktu wznowienia synchronizacji.'));
      transaction.onabort = transaction.onerror;
    });
  } catch (error) {
    console.warn('Nie udało się zapisać punktu wznowienia synchronizacji.', error?.message || error);
    return false;
  } finally {
    db?.close();
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

async function putOfflineJobOperationAtomically(record) {
  let db;
  try {
    db = await openOfflineDb();
    if (!db) return record;
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(OPERATION_STORE, 'readwrite');
      const objectStore = transaction.objectStore(OPERATION_STORE);
      let finalRecord = record;
      let failure = null;
      let settled = false;

      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const abortWith = (error) => {
        failure = error || failure || new Error('Nie udało się atomowo zapisać zmiany offline.');
        try {
          transaction.abort();
        } catch {
          rejectOnce(failure);
        }
      };
      const putFinalRecord = () => {
        try {
          objectStore.put(finalRecord);
        } catch (error) {
          abortWith(error);
        }
      };

      if (record.type === 'comment') {
        putFinalRecord();
      } else {
        const readRequest = objectStore.getAll();
        readRequest.onsuccess = () => {
          try {
            const superseded = (Array.isArray(readRequest.result) ? readRequest.result : [])
              .filter((item) => String(item.user_id) === record.user_id)
              .filter((item) => String(item.job_id) === record.job_id && String(item.type) === record.type)
              .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
            if (superseded.some(item => item.status === 'syncing' && Date.parse(item.lease_until || '') > Date.now())) {
              abortWith(new Error('Trwa synchronizacja poprzedniej zmiany. Zachowaj formularz i ponów zapis po jej zakończeniu.'));
              return;
            }
            if (superseded[0]?.base) {
              finalRecord = { ...record, base: superseded[0].base };
              if (record.type === 'device') {
                const requiredPaths = new Set([
                  ...superseded.flatMap(item => item.payload?.required_nameplate_paths || []),
                  ...(record.payload?.required_nameplate_paths || []),
                ].map((value) => String(value || '').trim()).filter(Boolean));
                finalRecord.payload = {
                  ...record.payload,
                  required_nameplate_paths: [...requiredPaths],
                  documentation: [...new Map([
                    ...superseded.flatMap(item => item.payload?.documentation || []),
                    ...(record.payload?.documentation || []),
                  ].map(doc => [doc.uploadIdentity?.plannedStoragePath, doc])).values()],
                };
              }
            }
            for (const item of superseded) objectStore.delete(item.id);
            putFinalRecord();
          } catch (error) {
            abortWith(error);
          }
        };
        readRequest.onerror = () => abortWith(readRequest.error || new Error('Nie udało się odczytać poprzedniej zmiany offline.'));
      }

      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        dispatchOfflineChanged();
        resolve(finalRecord);
      };
      transaction.onerror = () => rejectOnce(failure || transaction.error || new Error('Nie udało się atomowo zapisać zmiany offline.'));
      transaction.onabort = () => rejectOnce(failure || transaction.error || new Error('Atomowy zapis zmiany offline został przerwany.'));
    });
  } finally {
    db?.close();
  }
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
    lease_owner: '',
    attempt_generation: 0,
  };

  try {
    // Status i dane urządzenia zastępujemy w JEDNEJ transakcji IndexedDB.
    // Jeśli put nowego wpisu nie powiedzie się (np. QuotaExceededError),
    // cała transakcja jest wycofywana i poprzednia operacja pozostaje w kolejce.
    return await putOfflineJobOperationAtomically(record);
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
      error: '', lease_owner: '',
    }, { ...offlineOperationGuard(record), expectedLeaseUntil: record.lease_until || '' });
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
          lease_owner: createOfflineOperationId('lease'),
          attempt_generation: Number(current.attempt_generation || 0) + 1,
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

export async function listOfflineJobOperations(userId = '', { strict = false } = {}) {
  if (strict && !hasIndexedDb()) throw new Error('Pamięć zmian na telefonie jest niedostępna.');
  try {
    const records = await withStore(OPERATION_STORE, 'readonly', (store) => store.getAll());
    const normalizedUserId = String(userId || '').trim();
    return (Array.isArray(records) ? records : [])
      .filter((item) => !normalizedUserId || String(item.user_id) === normalizedUserId)
      .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
  } catch (error) {
    if (strict) throw error;
    console.warn('Nie udało się odczytać kolejki zmian offline.', error?.message || error);
    return [];
  }
}

export async function makeOfflineJobOperationsRetryableNow(userId = '', options = {}) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedJobId = String(options.jobId || '').trim();
  const allowedTypes = Array.isArray(options.allowedTypes)
    ? new Set(options.allowedTypes.map((value) => String(value || '').trim()).filter(Boolean))
    : null;
  if (!normalizedUserId) return 0;

  let db;
  try {
    db = await openOfflineDb();
    if (!db) return 0;
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(OPERATION_STORE, 'readwrite');
      const store = transaction.objectStore(OPERATION_STORE);
      const request = store.getAll();
      let changed = 0;
      request.onsuccess = () => {
        for (const operation of Array.isArray(request.result) ? request.result : []) {
          if (String(operation?.user_id || '') !== normalizedUserId) continue;
          if (normalizedJobId && String(operation?.job_id || '') !== normalizedJobId) continue;
          if (allowedTypes && !allowedTypes.has(String(operation?.type || ''))) continue;
          const status = String(operation?.status || 'pending').toLowerCase();
          // Aktywnego workera oraz konfliktu nie przejmujemy. Ręczna akcja ma
          // jedynie pominąć backoff operacji, która bezpiecznie czeka lub ma błąd.
          if (status === 'syncing' || status === 'conflict') continue;
          store.put({
            ...operation,
            status: 'pending',
            error: '',
            next_attempt_at: '',
            lease_until: '',
          });
          changed += 1;
        }
      };
      request.onerror = () => reject(request.error || new Error('Nie udało się przygotować zmian do ponownej synchronizacji.'));
      transaction.oncomplete = () => {
        if (changed) dispatchOfflineChanged();
        resolve(changed);
      };
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się przygotować zmian do ponownej synchronizacji.'));
      transaction.onabort = transaction.onerror;
    });
  } catch (error) {
    console.warn('Nie udało się wymusić ponowienia zmian offline.', error?.message || error);
    return 0;
  } finally {
    db?.close();
  }
}

export function offlineOperationGuard(record) {
  return { expectedLeaseOwner: record.lease_owner || '', expectedGeneration: Number(record.attempt_generation || 0) };
}

function permitsOperationWrite(current, guard) {
  if ('expectedLeaseOwner' in guard && String(current.lease_owner || '') !== String(guard.expectedLeaseOwner)) return false;
  if ('expectedGeneration' in guard && Number(current.attempt_generation || 0) !== guard.expectedGeneration) return false;
  if ('expectedLeaseUntil' in guard && String(current.lease_until || '') !== guard.expectedLeaseUntil) return false;
  return 'expectedLeaseOwner' in guard || !(current.status === 'syncing' && Date.parse(current.lease_until || '') > Date.now());
}

export async function updateOfflineJobOperation(operationId, patch = {}, guard = {}) {
  if (!operationId) return false;
  let db;
  try {
    db = await openOfflineDb();
    if (!db) return false;
    const updated = await new Promise((resolve, reject) => {
      const transaction = db.transaction(OPERATION_STORE, 'readwrite');
      const store = transaction.objectStore(OPERATION_STORE);
      const request = store.get(String(operationId));
      let changed = false;
      request.onsuccess = () => {
        const current = request.result;
        if (!current || !permitsOperationWrite(current, guard)) return;
        changed = true;
        store.put({ ...current, ...patch, id: String(operationId) });
      };
      request.onerror = () => reject(request.error || new Error('Nie udało się odczytać zmiany offline do aktualizacji.'));
      transaction.oncomplete = () => resolve(changed);
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się atomowo zaktualizować zmiany offline.'));
      transaction.onabort = transaction.onerror;
    });
    if (updated) dispatchOfflineChanged();
    return updated;
  } catch (error) {
    console.warn('Nie udało się zaktualizować zmiany offline.', error?.message || error);
    return false;
  } finally {
    db?.close();
  }
}

export async function deleteOfflineJobOperation(operationId, guard = {}) {
  if (!operationId) return false;
  const db = await openOfflineDb();
  if (!db) return false;
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(OPERATION_STORE, 'readwrite');
      const store = tx.objectStore(OPERATION_STORE);
      const req = store.get(String(operationId));
      let deleted = false;
      req.onsuccess = () => {
        if (!req.result || !permitsOperationWrite(req.result, guard)) return;
        store.delete(String(operationId)); deleted = true;
      };
      tx.oncomplete = () => { if (deleted) dispatchOfflineChanged(); resolve(deleted); };
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Nie usunięto zmiany offline.'));
    });
  } finally { db.close(); }
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
    if (!jobOperations.length) {
      if (!job?.offline_conflict && !job?.offline_sync_error) return job;
      return {
        ...job,
        offline_conflict: false,
        offline_conflict_message: '',
        offline_sync_error: false,
      };
    }

    let nextJob = {
      ...job,
      offline_pending: false,
      offline_conflict: false,
      offline_conflict_message: '',
      offline_sync_error: false,
    };
    let hasPendingProjection = false;

    for (const operation of jobOperations) {
      const operationStatus = String(operation?.status || 'pending').toLowerCase();
      if (operation.type === 'device' && operationStatus === 'error') {
        nextJob = { ...nextJob, ...(operation.payload?.device_fields || {}),
          offline_pending: true, offline_sync_error: true };
        hasPendingProjection = true;
        continue;
      }
      const terminalStatusOperation = (operation.type === 'status' || operation.type === 'device')
        && (operationStatus === 'conflict' || operationStatus === 'error');

      if (terminalStatusOperation) {
        if (operation.type === 'status') {
          const confirmedStatus = operation?.server_state?.status || operation?.base?.status || '';
          if (confirmedStatus) nextJob = { ...nextJob, status: confirmedStatus };
        } else {
          nextJob = {
            ...nextJob,
            ...(operation?.server_state || {
              device_model: operation?.base?.device_model || '',
              device_serial_number: operation?.base?.device_serial_number || '',
            }),
          };
        }
        if (operationStatus === 'conflict') {
          nextJob = {
            ...nextJob,
            offline_conflict: true,
            offline_conflict_message: String(operation?.error || 'Konflikt synchronizacji. Zmiana statusu nie została zapisana na serwerze.'),
          };
        } else {
          nextJob = { ...nextJob, offline_sync_error: true };
        }
        continue;
      }

      hasPendingProjection = true;
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

    nextJob.offline_pending = hasPendingProjection;
    return nextJob;
  });
}
