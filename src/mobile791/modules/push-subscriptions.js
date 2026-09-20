import { supabaseAnonKey, supabaseUrl } from "../lib/supabase.js";
import {
  capturePushSessionContext,
  clearCurrentPushServiceWorkerContext,
  clearPushLifecycleToken,
  getDuePendingPushDisables,
  getOrCreatePushLifecycleToken,
  isPushSessionContextCurrent,
  markPendingPushDisableRetry,
  persistPendingPushDisable,
  publishPushServiceWorkerContext,
  readPendingPushDisables,
  removePendingPushDisable,
  transitionPushSessionContext,
} from "./push-lifecycle-v1078.js";

const env = typeof import.meta !== "undefined" && import.meta?.env ? import.meta.env : {};
export const WEB_PUSH_PUBLIC_KEY = String(env.VITE_WEB_PUSH_PUBLIC_KEY || "").trim();
const PUSH_SW_PATH = "/push-sw.js";
const PUSH_SAVE_COOLDOWN_MS = 15000;
const PUSH_SERVER_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PUSH_LOGOUT_REQUEST_TIMEOUT_MS = 3200;
const PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS = 900;
const PUSH_LOCAL_STEP_TIMEOUT_MS = 900;

let pushSaveInFlight = null;
let pushSaveAbortControl = null;
let pushLifecycleEpoch = 0;
let pushLogoutInProgress = false;
let lastSavedSignature = "";
let lastSaveAttemptAt = 0;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function getSubscriptionPayload(subscription) {
  if (!subscription) return null;
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh || "",
    auth: json.keys?.auth || "",
  };
}

function buildSubscriptionSignature(sessionUser, payload) {
  return `${sessionUser?.id || "anon"}:${payload?.endpoint || ""}`;
}

function shouldTouchServerSubscription(lastSeenAt) {
  const lastSeenTimestamp = Date.parse(String(lastSeenAt || ""));
  return !Number.isFinite(lastSeenTimestamp)
    || Date.now() - lastSeenTimestamp >= PUSH_SERVER_TOUCH_INTERVAL_MS;
}



function waitForPushLifecycle(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withPushLifecycleTimeout(promise, timeoutMs = PUSH_LOCAL_STEP_TIMEOUT_MS, label = 'push-lifecycle') {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const error = new Error(`Przekroczono limit czasu operacji PUSH: ${label}.`);
      error.code = 'PUSH_LIFECYCLE_TIMEOUT';
      reject(error);
    }, Math.max(1, Number(timeoutMs) || PUSH_LOCAL_STEP_TIMEOUT_MS));
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timerId));
}

function getPushDeviceMetadata() {
  return {
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    deviceLabel: typeof navigator !== "undefined"
      ? `${navigator.platform || "Urządzenie"} / ${navigator.userAgentData?.platform || navigator.language || "przeglądarka"}`
      : "Przeglądarka",
  };
}

function buildSyncSubscriptionBody(payload, triggeredBy = "push-subscription-sync") {
  const device = getPushDeviceMetadata();
  return { eventType: "sync_subscription", triggeredBy, subscription: {
    endpoint: payload.endpoint, p256dh: payload.p256dh, auth: payload.auth,
    lifecycleToken: payload.lifecycleToken || "",
    clientMode: isStandaloneMode() ? "standalone" : "browser",
    userAgent: device.userAgent, deviceLabel: device.deviceLabel,
  }};
}

function buildDisableSubscriptionBody(payload, triggeredBy = "push-subscription-disable") {
  return { eventType: "disable_subscription", triggeredBy, subscription: {
    endpoint: payload.endpoint, p256dh: payload.p256dh, auth: payload.auth,
    lifecycleToken: payload.lifecycleToken || "",
  }};
}

function pushCredentialsMatch(left, right) {
  return Boolean(left?.endpoint && right?.endpoint
    && left.endpoint === right.endpoint
    && left.p256dh === right.p256dh
    && left.auth === right.auth);
}

function findPendingDisableForPayload(payload) {
  if (!payload?.endpoint) return null;
  return readPendingPushDisables().find((item) => pushCredentialsMatch(item.subscription, payload)
    && (!payload.lifecycleToken || item.lifecycleToken === payload.lifecycleToken)) || null;
}

function createPushLifecycleAbort(timeoutMs = PUSH_LOGOUT_REQUEST_TIMEOUT_MS) {
  if (typeof AbortController === "undefined") return { signal: undefined, cancel: () => {} };
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(new DOMException("Push lifecycle timeout", "AbortError")), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timerId),
    abort: () => {
      try { controller.abort(new DOMException("Push lifecycle invalidated", "AbortError")); } catch {}
    },
  };
}

async function getExistingPushSubscription() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = typeof navigator.serviceWorker.getRegistration === "function"
      ? await withPushLifecycleTimeout(navigator.serviceWorker.getRegistration(PUSH_SW_PATH), PUSH_LOCAL_STEP_TIMEOUT_MS, 'service-worker-registration')
      : null;
    if (registration?.pushManager?.getSubscription) return await withPushLifecycleTimeout(registration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-subscription-read');
    const readyRegistration = navigator.serviceWorker.ready
      ? await withPushLifecycleTimeout(navigator.serviceWorker.ready, PUSH_LOCAL_STEP_TIMEOUT_MS, 'service-worker-ready').catch(() => null)
      : null;
    return readyRegistration?.pushManager?.getSubscription
      ? await withPushLifecycleTimeout(readyRegistration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-subscription-ready-read').catch(() => null)
      : null;
  } catch { return null; }
}

export function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  const mediaMatch = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone = typeof window.navigator !== "undefined" && window.navigator.standalone === true;
  return Boolean(mediaMatch || navigatorStandalone);
}

export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua);
}

export function getPushDiagnostics() {
  const secureContext = typeof window !== "undefined" ? window.isSecureContext : false;
  const notificationsSupported = typeof window !== "undefined" && "Notification" in window;
  const serviceWorkerSupported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const pushManagerSupported = typeof window !== "undefined" && "PushManager" in window;
  const standalone = isStandaloneMode();
  const iosDevice = isIosDevice();
  const permission = notificationsSupported ? Notification.permission : "unsupported";
  const vapidConfigured = Boolean(WEB_PUSH_PUBLIC_KEY);

  const needsStandalone = true;
  const supported = Boolean(
    secureContext
      && notificationsSupported
      && serviceWorkerSupported
      && pushManagerSupported
      && vapidConfigured
      && (!needsStandalone || standalone)
  );

  let reason = "ok";
  if (!secureContext) reason = "Aplikacja musi działać po HTTPS.";
  else if (!notificationsSupported) reason = "Urządzenie nie obsługuje webowych powiadomień systemowych.";
  else if (!serviceWorkerSupported) reason = "Brak wsparcia Service Workera w tej przeglądarce.";
  else if (!pushManagerSupported) reason = "Brak wsparcia Push API w tej przeglądarce.";
  else if (!vapidConfigured) reason = "Brakuje publicznego klucza push w konfiguracji aplikacji.";
  else if (needsStandalone && !standalone) reason = "Powiadomienia PUSH działają tylko w zainstalowanej aplikacji Wawis.";

  return {
    supported,
    reason,
    permission,
    secureContext,
    notificationsSupported,
    serviceWorkerSupported,
    pushManagerSupported,
    standalone,
    iosDevice,
    vapidConfigured,
  };
}

export function isPushSupported() {
  return getPushDiagnostics().supported;
}

export function getPushPermission() {
  return getPushDiagnostics().permission;
}

export async function registerPushServiceWorker() {
  if (!isPushSupported()) return null;
  return withPushLifecycleTimeout(navigator.serviceWorker.register(PUSH_SW_PATH), PUSH_LOCAL_STEP_TIMEOUT_MS * 2, 'service-worker-register');
}

export async function savePushSubscription({ supabase, sessionUser, subscription, force = false }) {
  if (!supabase || !sessionUser || !subscription) return { saved: false, skipped: true, reason: "missing-data" };
  if (pushLogoutInProgress) return { saved: false, skipped: true, reason: "logout-in-progress" };
  const sessionContextToken = capturePushSessionContext(sessionUser);
  if (!isPushSessionContextCurrent(sessionContextToken)) return { saved: false, skipped: true, reason: "stale-session" };
  const basePayload = getSubscriptionPayload(subscription);
  if (!basePayload?.endpoint) return { saved: false, skipped: true, reason: "missing-endpoint" };
  const lifecycleToken = getOrCreatePushLifecycleToken(sessionUser);
  const payload = { ...basePayload, lifecycleToken };
  const signature = `${buildSubscriptionSignature(sessionUser, payload)}:${lifecycleToken}`;
  const now = Date.now();
  if (pushSaveInFlight) return pushSaveInFlight;
  if (!force && signature === lastSavedSignature && now - lastSaveAttemptAt < PUSH_SAVE_COOLDOWN_MS) {
    return { saved: false, skipped: true, reason: "cooldown" };
  }
  lastSaveAttemptAt = now;
  const epochAtStart = pushLifecycleEpoch;
  const requestControl = createPushLifecycleAbort(PUSH_LOGOUT_REQUEST_TIMEOUT_MS * 2);
  pushSaveAbortControl = requestControl;
  const savePromise = (async () => {
    const result = await invokePushFunction({ supabase, body: buildSyncSubscriptionBody(payload), signal: requestControl.signal });
    if (pushLogoutInProgress || epochAtStart !== pushLifecycleEpoch || !isPushSessionContextCurrent(sessionContextToken)) {
      return { saved: false, skipped: true, reason: "stale-lifecycle" };
    }
    const generation = Number(result?.subscription?.ownership_generation || 0);
    if (generation > 0) {
      const published = await publishPushServiceWorkerContext({ token: sessionContextToken, generation, endpoint: payload.endpoint, contextEpoch: Number(result?.subscription?.context_epoch || 0) });
      if (!published) return { saved: false, skipped: true, reason: "stale-session-context" };
    }
    lastSavedSignature = signature;
    return {
      saved: true,
      skipped: false,
      reason: result?.reassigned ? "reassigned" : (result?.reason || "ok"),
      reassigned: Boolean(result?.reassigned),
      generation,
      contextEpoch: Number(result?.subscription?.context_epoch || 0),
    };
  })();
  pushSaveInFlight = savePromise;
  try { return await savePromise; }
  finally {
    requestControl.cancel();
    if (pushSaveAbortControl === requestControl) pushSaveAbortControl = null;
    if (pushSaveInFlight === savePromise) pushSaveInFlight = null;
  }
}

export async function disableSavedPushSubscription({ supabase, subscription }) {
  if (!supabase || !subscription) return { disabled: false, skipped: true };
  const payload = getSubscriptionPayload(subscription);
  if (!payload?.endpoint || !payload?.p256dh || !payload?.auth) return { disabled: false, skipped: true };
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData?.session?.user || null;
  const lifecycleToken = getOrCreatePushLifecycleToken(sessionUser);
  const result = await invokePushFunction({
    supabase,
    body: buildDisableSubscriptionBody({ ...payload, lifecycleToken }),
  });
  return { disabled: Boolean(result?.disabled), skipped: false, result };
}

export async function deactivatePushForLogout({ supabase, sessionUser: suppliedSessionUser = null }) {
  pushLogoutInProgress = true;
  pushLifecycleEpoch += 1;
  pushSaveAbortControl?.abort?.();
  transitionPushSessionContext(null);

  let sessionUser = suppliedSessionUser || null;
  if (!sessionUser && supabase) {
    const sessionResult = await withPushLifecycleTimeout(supabase.auth.getSession(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'logout-auth-session').catch(() => ({ data: null }));
    sessionUser = sessionResult?.data?.session?.user || null;
  }
  const lifecycleToken = getOrCreatePushLifecycleToken(sessionUser);
  const subscription = await getExistingPushSubscription();
  if (!subscription) {
    clearPushLifecycleToken(sessionUser?.id);
    return { found: false, serverDisabled: false, unsubscribed: false, pending: readPendingPushDisables().length > 0 };
  }

  const basePayload = getSubscriptionPayload(subscription);
  if (!basePayload?.endpoint || !basePayload?.p256dh || !basePayload?.auth) {
    clearPushLifecycleToken(sessionUser?.id);
    return { found: true, serverDisabled: false, unsubscribed: false, pending: readPendingPushDisables().length > 0, reason: "missing-keys" };
  }
  const payload = { ...basePayload, lifecycleToken };
  persistPendingPushDisable(payload, { sessionUser, lifecycleToken });
  const pendingItem = findPendingDisableForPayload(payload);

  const requestControl = createPushLifecycleAbort();
  let serverDisabled = false;
  let serverError = "";
  const disableTask = supabase
    ? invokePushFunction({ supabase, body: buildDisableSubscriptionBody(payload, "logout"), signal: requestControl.signal })
      .then((result) => {
        serverDisabled = Boolean(result?.disabled || ["already-disabled", "not-found", "stale-lifecycle"].includes(result?.reason));
        if (pendingItem) removePendingPushDisable(pendingItem);
      })
      .catch((error) => {
        serverError = error?.message || String(error);
        if (pendingItem) markPendingPushDisableRetry(pendingItem);
      })
    : Promise.resolve();
  const unsubscribeTask = Promise.race([
    Promise.resolve(subscription.unsubscribe()).then(Boolean).catch(() => false),
    waitForPushLifecycle(PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS).then(() => false),
  ]);
  const [, unsubscribed] = await Promise.all([disableTask, unsubscribeTask]);
  requestControl.cancel();
  clearPushLifecycleToken(sessionUser?.id);
  pushSaveInFlight = null;
  lastSavedSignature = "";
  lastSaveAttemptAt = 0;
  return { found: true, serverDisabled, unsubscribed: Boolean(unsubscribed), pending: readPendingPushDisables().length > 0, error: serverError || null };
}

export async function reconcilePendingPushLogout({ supabase, sessionUser, force = false, allowReassign = true }) {
  const sessionContextToken = capturePushSessionContext(sessionUser);
  if (!isPushSessionContextCurrent(sessionContextToken)) {
    return { reconciled: false, pending: readPendingPushDisables().length > 0, reason: "stale-session" };
  }
  const pendingItems = getDuePendingPushDisables({ force });
  if (!pendingItems.length || !supabase || !sessionUser) {
    return { reconciled: false, pending: readPendingPushDisables().length > 0, reason: pendingItems.length ? "missing-session" : "nothing-due" };
  }

  let cleaned = 0;
  let failed = 0;
  let touchedCurrentSubscription = false;
  const currentSubscription = await getExistingPushSubscription();
  if (!isPushSessionContextCurrent(sessionContextToken)) return { reconciled: false, pending: readPendingPushDisables().length > 0, reason: "stale-session" };
  const currentPayload = getSubscriptionPayload(currentSubscription);

  for (const item of pendingItems) {
    const requestControl = createPushLifecycleAbort();
    try {
      const body = buildDisableSubscriptionBody({
        ...item.subscription,
        lifecycleToken: item.lifecycleToken || "",
      }, "login-stale-cleanup");
      const result = await invokePushFunction({ supabase, body, signal: requestControl.signal });
      if (!isPushSessionContextCurrent(sessionContextToken)) return { reconciled: false, pending: true, cleaned, failed, reassigned: false, reason: "stale-session" };
      removePendingPushDisable(item);
      cleaned += 1;
      if (currentPayload && pushCredentialsMatch(item.subscription, currentPayload)) touchedCurrentSubscription = true;
      if (!result?.ok) throw new Error(result?.error || "Nie udało się posprzątać starego PUSH.");
    } catch (error) {
      markPendingPushDisableRetry(item);
      failed += 1;
    } finally {
      requestControl.cancel();
    }
  }

  let reassigned = false;
  if (allowReassign && touchedCurrentSubscription && currentSubscription && !failed) {
    const saveResult = await savePushSubscription({ supabase, sessionUser, subscription: currentSubscription, force: true });
    reassigned = Boolean(saveResult?.reassigned || saveResult?.saved);
  }

  return {
    reconciled: cleaned > 0 && failed === 0,
    pending: readPendingPushDisables().length > 0,
    cleaned,
    failed,
    reassigned,
  };
}

export async function getCurrentPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await registerPushServiceWorker();
  if (!registration?.pushManager?.getSubscription) return null;
  return withPushLifecycleTimeout(registration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-current-subscription');
}

async function replaceExpiredPushSubscription({ supabase, sessionUser, subscription }) {
  const registration = await registerPushServiceWorker();
  if (!registration?.pushManager) return null;

  if (subscription) {
    await withPushLifecycleTimeout(subscription.unsubscribe(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-expired-unsubscribe').catch(() => false);
  }

  const replacement = await withPushLifecycleTimeout(registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
  }), PUSH_LOCAL_STEP_TIMEOUT_MS * 2, 'push-expired-subscribe');

  await savePushSubscription({ supabase, sessionUser, subscription: replacement, force: true });
  return replacement;
}

export async function ensurePushNotifications({ supabase, sessionUser, requestPermission = false }) {
  const diagnostics = getPushDiagnostics();
  if (!diagnostics.supported) {
    throw new Error(diagnostics.reason || "Ta przeglądarka nie obsługuje powiadomień push.");
  }

  let permission = diagnostics.permission;
  if (permission === "default" && requestPermission) {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return null;
  }

  const registration = await registerPushServiceWorker();
  if (!registration?.pushManager) return null;

  let subscription = await withPushLifecycleTimeout(registration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-ensure-read');
  if (!subscription) {
    subscription = await withPushLifecycleTimeout(registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    }), PUSH_LOCAL_STEP_TIMEOUT_MS * 2, 'push-ensure-subscribe');
  }

  await savePushSubscription({ supabase, sessionUser, subscription, force: true });
  return subscription;
}

export async function enablePushNotifications({ supabase, sessionUser }) {
  const subscription = await ensurePushNotifications({
    supabase,
    sessionUser,
    requestPermission: true,
  });

  if (!subscription) {
    const permission = getPushPermission();
    if (permission === "denied") {
      throw new Error("Powiadomienia są zablokowane w ustawieniach systemowych. Odblokuj je dla aplikacji Wawis.");
    }
    throw new Error("Do działania PUSH potrzebna jest jednorazowa zgoda systemowa.");
  }

  return subscription;
}

export async function disablePushNotifications({ supabase, sessionUser = null }) {
  const sessionContextToken = capturePushSessionContext(sessionUser);
  const subscription = await getCurrentPushSubscription();
  if (!subscription) {
    await clearCurrentPushServiceWorkerContext({ token: sessionContextToken }).catch(() => null);
    lastSavedSignature = "";
    lastSaveAttemptAt = 0;
    return { disabled: true, unsubscribed: false, skipped: true, reason: "no-local-subscription" };
  }

  const serverResult = await disableSavedPushSubscription({ supabase, subscription });
  const reason = String(serverResult?.result?.reason || "");
  const serverDisabled = Boolean(
    serverResult?.disabled
      || serverResult?.skipped
      || ["already-disabled", "not-found", "stale-lifecycle"].includes(reason)
  );
  if (!serverDisabled) {
    throw new Error("Serwer nie potwierdził wyłączenia powiadomień PUSH.");
  }

  const unsubscribed = await withPushLifecycleTimeout(
    subscription.unsubscribe(),
    PUSH_LOCAL_STEP_TIMEOUT_MS,
    "push-user-disable-unsubscribe",
  ).catch(() => false);
  await clearCurrentPushServiceWorkerContext({ token: sessionContextToken }).catch(() => null);

  lastSavedSignature = "";
  lastSaveAttemptAt = 0;
  return { disabled: true, unsubscribed: Boolean(unsubscribed), skipped: false, reason: reason || "disabled" };
}

function buildStalePushStatus(diagnostics) {
  return { supported: Boolean(diagnostics?.supported), permission: diagnostics?.permission || "unsupported", subscribed: false, serverRegistered: false, serverActive: false, lastSeenAt: null, syncError: null, vapidConfigured: Boolean(diagnostics?.vapidConfigured), ready: false, diagnostics, staleSession: true };
}

export async function getPushStatus({ supabase, sessionUser, allowAutoRepair = true }) {
  const diagnostics = getPushDiagnostics();
  const sessionContextToken = capturePushSessionContext(sessionUser);
  const isCurrentPushSession = () => isPushSessionContextCurrent(sessionContextToken);
  if (!isCurrentPushSession()) return buildStalePushStatus(diagnostics);
  const permission = diagnostics.permission;
  const vapidConfigured = diagnostics.vapidConfigured;

  if (!diagnostics.supported) {
    await clearCurrentPushServiceWorkerContext({ token: sessionContextToken }).catch(() => null);
    return {
      supported: false,
      permission,
      subscribed: false,
      serverRegistered: false,
      serverActive: false,
      lastSeenAt: null,
      syncError: null,
      vapidConfigured,
      ready: false,
      diagnostics,
    };
  }

  let subscription = await getCurrentPushSubscription();
  if (!isCurrentPushSession()) return buildStalePushStatus(diagnostics);
  let serverRegistered = false;
  let serverActive = false;
  let lastSeenAt = null;
  let syncError = null;
  let ownershipGeneration = 0;
  let contextEpoch = 0;

  if (allowAutoRepair && !subscription && permission === "granted" && supabase && sessionUser) {
    try {
      // Samonaprawa v9.70: jeśli przeglądarka zgubiła subskrypcję, ale zgoda
      // systemowa nadal jest aktywna, odtwarzamy endpoint bez pytania użytkownika.
      subscription = await ensurePushNotifications({
        supabase,
        sessionUser,
        requestPermission: false,
      });
    } catch (error) {
      syncError = error?.message || String(error);
      console.warn("Nie udało się automatycznie odtworzyć subskrypcji push:", syncError);
    }
  }

  if (subscription && permission === "granted" && supabase && sessionUser) {
    try {
      // Najpierw sprawdzamy stan endpointu zapisany na serwerze. Jeśli Edge Function
      // oznaczyła go jako nieaktywny po 404/410, nie reaktywujemy martwego endpointu.
      // Zamiast tego tworzymy nową subskrypcję przeglądarki.
      const { data: existingServerRow, error: existingServerError } = await supabase
        .from("push_subscriptions")
        .select("id, is_active, last_seen_at, ownership_generation, context_epoch")
        .eq("user_id", sessionUser.id)
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();

      if (!isCurrentPushSession()) return buildStalePushStatus(diagnostics);
      if (existingServerError) throw existingServerError;
      contextEpoch = Number(existingServerRow?.context_epoch || 0);
      ownershipGeneration = Number(existingServerRow?.ownership_generation || 0);

      if (existingServerRow?.id && existingServerRow.is_active === false) {
        serverRegistered = true;
        serverActive = false;
        lastSeenAt = existingServerRow.last_seen_at || null;
        if (allowAutoRepair) {
          subscription = await replaceExpiredPushSubscription({
            supabase,
            sessionUser,
            subscription,
          });
          if (subscription) {
            // Replacement save already published its own verified context.
            ownershipGeneration = 0; contextEpoch = 0;
            serverActive = true;
            lastSeenAt = new Date().toISOString();
          }
        }
      } else if (!existingServerRow?.id) {
        if (allowAutoRepair) {
          const saveResult = await savePushSubscription({ supabase, sessionUser, subscription, force: true });
          contextEpoch = Number(saveResult?.contextEpoch || contextEpoch || 0);
          ownershipGeneration = Number(saveResult?.generation || 0);
          serverRegistered = true;
          serverActive = true;
          lastSeenAt = new Date().toISOString();
        }
      } else {
        serverRegistered = true;
        serverActive = Boolean(existingServerRow.is_active);
        lastSeenAt = existingServerRow.last_seen_at || null;
        if (allowAutoRepair && (!serverActive || shouldTouchServerSubscription(lastSeenAt))) {
          const saveResult = await savePushSubscription({ supabase, sessionUser, subscription, force: true });
          contextEpoch = Number(saveResult?.contextEpoch || contextEpoch || 0);
          ownershipGeneration = Number(saveResult?.generation || ownershipGeneration || 0);
          serverActive = true;
          lastSeenAt = new Date().toISOString();
        }
      }
    } catch (error) {
      syncError = error?.message || String(error);
      console.warn("Nie udało się zsynchronizować subskrypcji push z Supabase:", syncError);
    }
  }

  if (allowAutoRepair && serverActive && ownershipGeneration > 0 && isCurrentPushSession()) {
    await publishPushServiceWorkerContext({ token: sessionContextToken, generation: ownershipGeneration, endpoint: subscription.endpoint, contextEpoch }).catch(() => false);
  }
  if (!isCurrentPushSession()) return buildStalePushStatus(diagnostics);

  return {
    supported: true,
    permission,
    subscribed: Boolean(subscription),
    serverRegistered,
    serverActive,
    lastSeenAt,
    syncError,
    vapidConfigured,
    ready: Boolean(subscription) && permission === "granted" && serverActive,
    diagnostics,
  };
}

async function invokePushFunction({ supabase, body, signal = undefined }) {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Brakuje konfiguracji Supabase do wywołania funkcji push.");
  }

  const { data: sessionData, error: sessionError } = await withPushLifecycleTimeout(supabase.auth.getSession(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'edge-auth-session');
  if (sessionError) throw sessionError;

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Brak aktywnej sesji administratora.");

  const response = await fetch(`${supabaseUrl}/functions/v1/send-assignment-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
    },
    signal,
    body: JSON.stringify(body || {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || response.statusText || "Nie udało się wywołać funkcji push.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function sendTestPush({ supabase, sessionUser = null, targetCurrentDevice = false }) {
  let subscriptionEndpoint = "";

  if (targetCurrentDevice) {
    if (!sessionUser) throw new Error("Brak zalogowanego administratora.");
    const status = await getPushStatus({ supabase, sessionUser });
    if (!status.ready) {
      throw new Error(status.syncError || "Powiadomienia push na tym urządzeniu nie są w pełni zsynchronizowane.");
    }
    const subscription = await getCurrentPushSubscription();
    subscriptionEndpoint = subscription?.endpoint || "";
    if (!subscriptionEndpoint) throw new Error("Nie znaleziono aktywnej subskrypcji tego urządzenia.");
  }

  return invokePushFunction({
    supabase,
    body: {
      eventType: "push_test",
      triggeredBy: "diagnostics",
      subscriptionEndpoint: subscriptionEndpoint || undefined,
    },
  });
}

export function buildJobPushUrl(jobId) {
  if (!jobId) return `${supabaseUrl || ""}`;
  const origin = typeof window !== "undefined" ? window.location.origin : supabaseUrl;
  return `${origin || ""}/?jobId=${encodeURIComponent(jobId)}`;
}
