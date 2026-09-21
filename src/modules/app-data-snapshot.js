const DB_NAME = 'wawis-app-read-cache';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'session-snapshots';

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function openSnapshotDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'user_id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Nie udało się otworzyć lokalnej kopii danych.'));
  });
}

function sanitizeJobsForSnapshot(jobs = []) {
  return (Array.isArray(jobs) ? jobs : []).map((job) => {
    const {
      photos: _photos,
      comments: _comments,
      detailsLoaded: _detailsLoaded,
      detailsLoadedAt: _detailsLoadedAt,
      ...listData
    } = job || {};
    return {
      ...listData,
      photos: [],
      comments: [],
      detailsLoaded: false,
      detailsLoadedAt: null,
    };
  });
}

export async function loadAppDataSnapshot(userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;

  let db;
  try {
    db = await openSnapshotDb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOT_STORE, 'readonly');
      const request = transaction.objectStore(SNAPSHOT_STORE).get(normalizedUserId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Nie udało się odczytać lokalnej kopii danych.'));
    });
  } catch (error) {
    console.warn('Nie udało się odczytać lokalnej kopii danych.', error?.message || error);
    return null;
  } finally {
    db?.close();
  }
}

export async function saveAppDataSnapshot({
  userId,
  profile,
  profiles = [],
  jobs = [],
  notifications = [],
  serverFetchedAtMs = Date.now(),
  changeCursor = null,
}) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedServerFetchedAtMs = Math.max(0, Number(serverFetchedAtMs) || 0);
  if (!normalizedUserId || !normalizedServerFetchedAtMs) return false;

  let db;
  try {
    db = await openSnapshotDb();
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
        const requestedCursor = Math.max(0, Number(changeCursor) || 0);
        store.put({
          user_id: normalizedUserId,
          profile: profile || null,
          profiles: Array.isArray(profiles) ? profiles : [],
          jobs: sanitizeJobsForSnapshot(jobs),
          notifications: Array.isArray(notifications) ? notifications : [],
          server_fetched_at_ms: normalizedServerFetchedAtMs,
          change_cursor: hasRequestedCursor
            ? Math.max(Number(readRequest.result?.change_cursor || 0), requestedCursor)
            : Number(readRequest.result?.change_cursor || 0),
          saved_at: new Date().toISOString(),
        });
      };
      readRequest.onerror = () => reject(readRequest.error || new Error('Nie udało się porównać lokalnej kopii danych.'));
      transaction.oncomplete = () => resolve(shouldWrite);
      transaction.onerror = () => reject(transaction.error || new Error('Nie udało się zapisać lokalnej kopii danych.'));
      transaction.onabort = transaction.onerror;
    });
  } catch (error) {
    console.warn('Nie udało się zapisać lokalnej kopii danych.', error?.message || error);
    return false;
  } finally {
    db?.close();
  }
}
