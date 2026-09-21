import { useCallback, useEffect, useMemo, useState } from "react";
import { listPhotoQueueItems, PHOTO_QUEUE_CHANGED_EVENT } from "../modules/photo-offline-queue.js";
import { JOB_OFFLINE_CHANGED_EVENT, listOfflineJobOperations } from "../modules/job-offline-store.js";

const LAST_PHOTO_SYNC_STORAGE_KEY = "wawis-mobile-last-photo-sync-at";

function readConnectionQuality() {
  if (typeof navigator === "undefined") {
    return { tone: "unknown", label: "Nieznane" };
  }
  if (!navigator.onLine) {
    return { tone: "offline", label: "Brak internetu" };
  }

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  const downlink = Number(connection?.downlink || 0);

  if (effectiveType === "slow-2g" || effectiveType === "2g" || (downlink > 0 && downlink < 1)) {
    return { tone: "weak", label: "Słabe" };
  }
  if (effectiveType === "3g" || (downlink >= 1 && downlink < 3)) {
    return { tone: "medium", label: "Średnie" };
  }
  return { tone: "good", label: "Dobre" };
}

function getLastSyncStorageKey(profileId = "") {
  return `${LAST_PHOTO_SYNC_STORAGE_KEY}:${String(profileId || "anonymous")}`;
}

function readLastSyncedAt(profileId = "") {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(getLastSyncStorageKey(profileId));
    const parsed = saved ? new Date(saved) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  } catch {
    // Brak dostępu do localStorage nie może blokować aplikacji.
  }
  return null;
}

function persistLastSyncedAt(value, profileId = "") {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getLastSyncStorageKey(profileId), value.toISOString());
  } catch {
    // Raport czasu jest pomocniczy — ignorujemy brak miejsca lub tryb prywatny.
  }
}

function summarizeQueue(items = []) {
  return items.reduce((summary, item) => {
    summary.total += 1;
    const status = String(item.upload_status || "local").toLowerCase();
    if (status === "uploading") summary.uploading += 1;
    else if (status === "error") summary.error += 1;
    else summary.local += 1;
    return summary;
  }, { total: 0, local: 0, uploading: 0, error: 0 });
}

function summarizeOperations(items = []) {
  return items.reduce((summary, item) => {
    summary.total += 1;
    const status = String(item.status || 'pending').toLowerCase();
    if (status === 'syncing') summary.syncing += 1;
    else if (status === 'conflict') summary.conflict += 1;
    else if (status === 'error') summary.error += 1;
    else summary.pending += 1;
    return summary;
  }, { total: 0, pending: 0, syncing: 0, conflict: 0, error: 0 });
}

export function usePhotoSyncStatus(profileId = "") {
  const [connection, setConnection] = useState(readConnectionQuality);
  const [syncState, setSyncState] = useState("synced");
  const [lastSyncedAt, setLastSyncedAt] = useState(() => readLastSyncedAt(profileId));
  const [queueItems, setQueueItems] = useState([]);
  const [queueSummary, setQueueSummary] = useState({ total: 0, local: 0, uploading: 0, error: 0 });
  const [operationItems, setOperationItems] = useState([]);
  const [operationSummary, setOperationSummary] = useState({ total: 0, pending: 0, syncing: 0, conflict: 0, error: 0 });

  useEffect(() => {
    setLastSyncedAt(readLastSyncedAt(profileId));
  }, [profileId]);

  const refreshQueueSummary = useCallback(async () => {
    try {
      const normalizedProfileId = String(profileId || '').trim();
      const [allItems, allOperations] = await Promise.all([
        listPhotoQueueItems(),
        listOfflineJobOperations(normalizedProfileId),
      ]);
      const items = allItems.filter((item) => (
        !normalizedProfileId || !item.uploaded_by || String(item.uploaded_by) === normalizedProfileId
      ));
      setQueueItems(items);
      setQueueSummary(summarizeQueue(items));
      setOperationItems(allOperations);
      setOperationSummary(summarizeOperations(allOperations));
      return { photos: items, operations: allOperations };
    } catch (error) {
      console.warn("Nie udało się odświeżyć Centrum synchronizacji zdjęć.", error?.message || error);
      return [];
    }
  }, [profileId]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return undefined;
    const network = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const updateConnection = () => {
      setConnection(readConnectionQuality());
      void refreshQueueSummary();
    };

    void refreshQueueSummary();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener(PHOTO_QUEUE_CHANGED_EVENT, refreshQueueSummary);
    window.addEventListener(JOB_OFFLINE_CHANGED_EVENT, refreshQueueSummary);
    network?.addEventListener?.("change", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener(PHOTO_QUEUE_CHANGED_EVENT, refreshQueueSummary);
      window.removeEventListener(JOB_OFFLINE_CHANGED_EVENT, refreshQueueSummary);
      network?.removeEventListener?.("change", updateConnection);
    };
  }, [refreshQueueSummary]);

  const markPhotoSyncing = useCallback(() => setSyncState("syncing"), []);
  const markPhotoSynced = useCallback(() => {
    const syncedAt = new Date();
    setSyncState("synced");
    setLastSyncedAt(syncedAt);
    persistLastSyncedAt(syncedAt, profileId);
    void refreshQueueSummary();
  }, [profileId, refreshQueueSummary]);
  const markPhotoSyncError = useCallback(() => {
    setSyncState("error");
    void refreshQueueSummary();
  }, [refreshQueueSummary]);

  const sync = useMemo(() => {
    const localCount = queueSummary.local + queueSummary.uploading + operationSummary.pending + operationSummary.syncing;
    const totalErrors = queueSummary.error + operationSummary.error;
    const totalConflicts = operationSummary.conflict;
    if (connection.tone === "offline") {
      return localCount > 0
        ? { tone: "waiting", label: `${localCount} ${localCount === 1 ? "zmiana zapisana" : "zmiany zapisane"} na telefonie` }
        : { tone: "waiting", label: "Brak internetu" };
    }
    if (queueSummary.uploading > 0 || operationSummary.syncing > 0) {
      return { tone: "syncing", label: "Synchronizacja…" };
    }
    if (totalConflicts > 0) {
      return { tone: "error", label: `${totalConflicts} ${totalConflicts === 1 ? "konflikt zmian" : "konflikty zmian"}` };
    }
    if (totalErrors > 0) {
      return { tone: "error", label: `${totalErrors} ${totalErrors === 1 ? "błąd synchronizacji" : "błędy synchronizacji"}` };
    }
    if (localCount > 0) {
      return { tone: "waiting", label: `${localCount} ${localCount === 1 ? "zmiana czeka" : "zmiany czekają"} na wysłanie` };
    }
    if (syncState === "syncing") {
      return { tone: "syncing", label: "Wysyłanie zdjęć…" };
    }
    if (syncState === "error") {
      return { tone: "error", label: "Błąd synchronizacji zdjęć" };
    }
    return { tone: "synced", label: "Wszystko wysłane" };
  }, [connection.tone, operationSummary, queueSummary, syncState]);

  return {
    connection,
    sync,
    queueItems,
    queueSummary,
    operationItems,
    operationSummary,
    lastSyncedAt,
    markPhotoSyncing,
    markPhotoSynced,
    markPhotoSyncError,
    refreshQueueSummary,
  };
}
