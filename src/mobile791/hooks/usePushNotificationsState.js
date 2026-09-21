import { useEffect, useRef, useState } from "react";
import { INITIAL_PUSH_STATE, isPushDisplayOn } from "../utils/pushState.js";

const PUSH_STATE_STORAGE_PREFIX = "wawis:push-state:v3";
const LEGACY_PUSH_STATE_SESSION_STORAGE_PREFIX = "wawis:push-state:v2";
const PUSH_ENABLED_STORAGE_PREFIX = "wawis:push-enabled:v1097";
const PUSH_HEALTHCHECK_MS = 5 * 60 * 1000;
const PUSH_MIN_SYNC_INTERVAL_MS = 10 * 60 * 1000;

function getPushStateStorageKey(userId = "", prefix = PUSH_STATE_STORAGE_PREFIX) {
  const normalizedUserId = String(userId || "anonymous").trim() || "anonymous";
  return `${prefix}:${normalizedUserId}`;
}

function getPushEnabledStorageKey(userId = "") {
  const normalizedUserId = String(userId || "anonymous").trim() || "anonymous";
  return `${PUSH_ENABLED_STORAGE_PREFIX}:${normalizedUserId}`;
}

function readPushEnabledPreference(userId = "") {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(getPushEnabledStorageKey(userId));
    if (stored === null) return true;
    return stored !== "0" && stored !== "false";
  } catch {
    return true;
  }
}

function persistPushEnabledPreference(userId = "", enabled = true) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getPushEnabledStorageKey(userId), enabled ? "1" : "0");
  } catch {
    // Brak localStorage nie może blokować samej obsługi PUSH.
  }
}

function readStoredPushState(userId = "") {
  const userEnabled = readPushEnabledPreference(userId);
  const fallbackState = {
    ...INITIAL_PUSH_STATE,
    userEnabled,
    statusKnown: userEnabled === false,
  };
  if (typeof window === "undefined") return fallbackState;
  try {
    const persistentRaw = window.localStorage.getItem(getPushStateStorageKey(userId));
    const legacyRaw = window.sessionStorage.getItem(
      getPushStateStorageKey(userId, LEGACY_PUSH_STATE_SESSION_STORAGE_PREFIX),
    );
    const raw = persistentRaw || legacyRaw;
    if (!raw) return fallbackState;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallbackState;
    return {
      ...INITIAL_PUSH_STATE,
      ...parsed,
      userEnabled,
      statusKnown: parsed.statusKnown !== false,
    };
  } catch {
    return fallbackState;
  }
}

function persistPushState(userId = "", nextState = INITIAL_PUSH_STATE) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify({
    ...INITIAL_PUSH_STATE,
    ...nextState,
    statusKnown: true,
  });
  try {
    window.localStorage.setItem(getPushStateStorageKey(userId), serialized);
  } catch {
    // Brak localStorage nie może blokować synchronizacji PUSH.
  }
  try {
    window.sessionStorage.setItem(
      getPushStateStorageKey(userId, LEGACY_PUSH_STATE_SESSION_STORAGE_PREFIX),
      serialized,
    );
  } catch {
    // sessionStorage pozostaje tylko cache'em kompatybilności.
  }
}

async function loadPushModule() {
  return import("../modules/push-subscriptions.js");
}

export function usePushNotificationsState({ supabase, sessionUser }) {
  const userId = String(sessionUser?.id || "").trim();
  const [pushState, setPushState] = useState(() => readStoredPushState(userId));
  const [pushBusy, setPushBusy] = useState(false);
  const syncInFlightRef = useRef(null);
  const lastSuccessfulSyncAtRef = useRef(0);
  const syncEpochRef = useRef(0);

  async function syncPushState({ force = false } = {}) {
    if (!sessionUser) return INITIAL_PUSH_STATE;
    if (syncInFlightRef.current) return syncInFlightRef.current;
    const syncEpoch = syncEpochRef.current;
    const isCurrentSync = () => syncEpoch === syncEpochRef.current;
    if (!force && Date.now() - lastSuccessfulSyncAtRef.current < PUSH_MIN_SYNC_INTERVAL_MS) {
      return readStoredPushState(userId);
    }

    const syncPromise = (async () => {
      const pushModule = await loadPushModule();
      const userEnabled = readPushEnabledPreference(userId);
      await pushModule.reconcilePendingPushLogout({
        supabase,
        sessionUser,
        force,
        allowReassign: userEnabled,
      }).catch((error) => {
        console.warn("Nie udało się ponowić sprzątania starego PUSH:", error?.message || error);
      });
      if (!isCurrentSync()) return readStoredPushState(userId);
      const status = await pushModule.getPushStatus({ supabase, sessionUser, allowAutoRepair: userEnabled });
      if (!isCurrentSync()) return readStoredPushState(userId);
      const nextState = { ...status, userEnabled, statusKnown: true };
      setPushState(nextState);
      persistPushState(userId, nextState);
      if (!nextState?.syncError) lastSuccessfulSyncAtRef.current = Date.now();
      return nextState;
    })();

    syncInFlightRef.current = syncPromise;
    try {
      return await syncPromise;
    } catch (error) {
      console.warn("Nie udało się sprawdzić stanu PUSH:", error?.message || error);
      return readStoredPushState(userId);
    } finally {
      if (syncInFlightRef.current === syncPromise) syncInFlightRef.current = null;
    }
  }

  async function waitForCurrentPushSync() {
    const pendingSync = syncInFlightRef.current;
    if (!pendingSync) return;
    await pendingSync.catch(() => null);
  }

  async function enablePush({ silent = false } = {}) {
    if (!sessionUser) return false;
    setPushBusy(true);
    try {
      await waitForCurrentPushSync();
      const { enablePushNotifications } = await loadPushModule();
      await enablePushNotifications({ supabase, sessionUser });
      persistPushEnabledPreference(userId, true);
      await syncPushState({ force: true });
      return true;
    } catch (error) {
      if (!silent) {
        alert(error.message || "Nie udało się włączyć powiadomień PUSH.");
      } else {
        console.warn("PUSH wymaga działania użytkownika lub ustawień systemowych:", error?.message || error);
      }
      await syncPushState({ force: true });
      return false;
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush({ silent = false } = {}) {
    if (!sessionUser) return false;
    const previousPreference = readPushEnabledPreference(userId);
    setPushBusy(true);
    persistPushEnabledPreference(userId, false);
    try {
      // OFF ma pierwszeństwo nad synchronizacją, która mogła wystartować chwilę wcześniej.
      // Najpierw pozwalamy jej się zakończyć, a dopiero potem wyłączamy endpoint.
      await waitForCurrentPushSync();
      const { disablePushNotifications } = await loadPushModule();
      await disablePushNotifications({ supabase, sessionUser });
      lastSuccessfulSyncAtRef.current = 0;
      await syncPushState({ force: true });
      return true;
    } catch (error) {
      persistPushEnabledPreference(userId, previousPreference);
      if (!silent) alert(error.message || "Nie udało się wyłączyć powiadomień PUSH.");
      else console.warn("Nie udało się wyłączyć PUSH:", error?.message || error);
      lastSuccessfulSyncAtRef.current = 0;
      await syncPushState({ force: true });
      return false;
    } finally {
      setPushBusy(false);
    }
  }

  async function togglePush() {
    if (pushBusy) return false;
    const isOn = isPushDisplayOn(pushState);
    return isOn ? disablePush() : enablePush();
  }

  useEffect(() => {
    syncEpochRef.current += 1;
    syncInFlightRef.current = null;
    if (!sessionUser) {
      setPushState(INITIAL_PUSH_STATE);
      lastSuccessfulSyncAtRef.current = 0;
      return undefined;
    }

    setPushState(readStoredPushState(userId));
    lastSuccessfulSyncAtRef.current = 0;
    void syncPushState({ force: true });

    const handleVisible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void syncPushState();
      }
    };

    const handleOnline = () => {
      void syncPushState({ force: true });
    };

    window.addEventListener("focus", handleVisible);
    window.addEventListener("pageshow", handleVisible);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisible);

    const healthcheckTimer = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void syncPushState({ force: true });
      }
    }, PUSH_HEALTHCHECK_MS);

    return () => {
      syncEpochRef.current += 1;
      window.removeEventListener("focus", handleVisible);
      window.removeEventListener("pageshow", handleVisible);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisible);
      window.clearInterval(healthcheckTimer);
    };
  }, [sessionUser?.id]);

  return {
    pushState,
    pushBusy,
    syncPushState,
    enablePush,
    disablePush,
    togglePush,
  };
}
