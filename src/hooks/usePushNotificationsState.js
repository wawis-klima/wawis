import { useEffect, useRef, useState } from "react";
import { INITIAL_PUSH_STATE } from "../utils/pushState.js";

const PUSH_STATE_STORAGE_PREFIX = "wawis:push-state:v2";
const PUSH_HEALTHCHECK_MS = 5 * 60 * 1000;
const PUSH_MIN_SYNC_INTERVAL_MS = 10 * 60 * 1000;

function getPushStateStorageKey(userId = "") {
  const normalizedUserId = String(userId || "anonymous").trim() || "anonymous";
  return `${PUSH_STATE_STORAGE_PREFIX}:${normalizedUserId}`;
}

function readStoredPushState(userId = "") {
  if (typeof window === "undefined") return INITIAL_PUSH_STATE;
  try {
    const raw = window.sessionStorage.getItem(getPushStateStorageKey(userId));
    if (!raw) return INITIAL_PUSH_STATE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return INITIAL_PUSH_STATE;
    return { ...INITIAL_PUSH_STATE, ...parsed };
  } catch {
    return INITIAL_PUSH_STATE;
  }
}

function persistPushState(userId = "", nextState = INITIAL_PUSH_STATE) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      getPushStateStorageKey(userId),
      JSON.stringify({ ...INITIAL_PUSH_STATE, ...nextState }),
    );
  } catch {
    // sessionStorage jest wyłącznie cache'em stanu PUSH.
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

  async function syncPushState({ force = false } = {}) {
    if (!sessionUser) return INITIAL_PUSH_STATE;
    if (syncInFlightRef.current) return syncInFlightRef.current;
    if (!force && Date.now() - lastSuccessfulSyncAtRef.current < PUSH_MIN_SYNC_INTERVAL_MS) {
      return readStoredPushState(userId);
    }

    const syncPromise = (async () => {
      const { getPushStatus } = await loadPushModule();
      const nextState = await getPushStatus({ supabase, sessionUser });
      setPushState(nextState);
      persistPushState(userId, nextState);
      if (!nextState?.syncError) lastSuccessfulSyncAtRef.current = Date.now();
      return nextState;
    })();

    syncInFlightRef.current = syncPromise;
    try {
      return await syncPromise;
    } catch (error) {
      console.warn("Nie udało się sprawdzić obowiązkowego PUSH:", error?.message || error);
      return readStoredPushState(userId);
    } finally {
      if (syncInFlightRef.current === syncPromise) syncInFlightRef.current = null;
    }
  }

  async function enablePush({ silent = false } = {}) {
    if (!sessionUser) return false;
    setPushBusy(true);
    try {
      const { enablePushNotifications } = await loadPushModule();
      await enablePushNotifications({ supabase, sessionUser });
      await syncPushState({ force: true });
      return true;
    } catch (error) {
      if (!silent) {
        alert(error.message || "Nie udało się aktywować obowiązkowych powiadomień PUSH.");
      } else {
        console.warn("Obowiązkowy PUSH wymaga działania użytkownika lub ustawień systemowych:", error?.message || error);
      }
      await syncPushState({ force: true });
      return false;
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    if (!sessionUser) {
      setPushState(INITIAL_PUSH_STATE);
      syncInFlightRef.current = null;
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

    const handleMandatoryPermissionGesture = () => {
      if (typeof Notification === "undefined" || Notification.permission !== "default") return;
      window.removeEventListener("pointerdown", handleMandatoryPermissionGesture);
      window.removeEventListener("keydown", handleMandatoryPermissionGesture);
      window.removeEventListener("touchend", handleMandatoryPermissionGesture);
      // iOS wymaga wywołania prośby o zgodę bezpośrednio z gestu użytkownika.
      void enablePush({ silent: true });
    };

    window.addEventListener("focus", handleVisible);
    window.addEventListener("pageshow", handleVisible);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("pointerdown", handleMandatoryPermissionGesture, { passive: true });
    window.addEventListener("keydown", handleMandatoryPermissionGesture);
    window.addEventListener("touchend", handleMandatoryPermissionGesture, { passive: true });

    const healthcheckTimer = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void syncPushState();
      }
    }, PUSH_HEALTHCHECK_MS);

    return () => {
      window.removeEventListener("focus", handleVisible);
      window.removeEventListener("pageshow", handleVisible);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("pointerdown", handleMandatoryPermissionGesture);
      window.removeEventListener("keydown", handleMandatoryPermissionGesture);
      window.removeEventListener("touchend", handleMandatoryPermissionGesture);
      window.clearInterval(healthcheckTimer);
    };
  }, [sessionUser?.id]);

  return {
    pushState,
    pushBusy,
    syncPushState,
    enablePush,
  };
}
