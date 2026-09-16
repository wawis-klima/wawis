import { supabaseAnonKey, supabaseUrl } from "../lib/supabase.js";

const env = typeof import.meta !== "undefined" && import.meta?.env ? import.meta.env : {};
export const WEB_PUSH_PUBLIC_KEY = String(env.VITE_WEB_PUSH_PUBLIC_KEY || "").trim();
const PUSH_SW_PATH = "/push-sw.js";
const PUSH_SAVE_COOLDOWN_MS = 15000;
const PUSH_SERVER_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PUSH_LOCAL_STEP_TIMEOUT_MS = 900;
const PUSH_LIFECYCLE_KEY_PREFIX = 'wawis_push_lifecycle_v1078';

let pushSaveInFlight = null;
let lastSavedSignature = "";
let lastSaveAttemptAt = 0;
let lastForbiddenAt = 0;
const desktopLifecycleTokens = new Map();

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

function randomLifecycleToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `v1078:${crypto.randomUUID()}`;
  return `v1078:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function getOrCreateDesktopPushLifecycleToken(sessionUser) {
  const userId = String(sessionUser?.id || '').trim();
  if (!userId) return '';
  if (desktopLifecycleTokens.has(userId)) return desktopLifecycleTokens.get(userId);
  const key = `${PUSH_LIFECYCLE_KEY_PREFIX}:${userId}`;
  let token = '';
  try { token = String(window.localStorage.getItem(key) || '').trim(); } catch {}
  if (!token) {
    token = randomLifecycleToken();
    try { window.localStorage.setItem(key, token); } catch {}
  }
  desktopLifecycleTokens.set(userId, token);
  return token;
}

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

function isForbiddenStatus(error) {
  const status = Number(error?.status || error?.code || 0);
  return status === 401 || status === 403;
}

function shouldTouchServerSubscription(lastSeenAt) {
  const lastSeenTimestamp = Date.parse(String(lastSeenAt || ""));
  return !Number.isFinite(lastSeenTimestamp)
    || Date.now() - lastSeenTimestamp >= PUSH_SERVER_TOUCH_INTERVAL_MS;
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

  const needsStandalone = iosDevice;
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
  else if (needsStandalone && !standalone) reason = "Na iPhonie otwórz aplikację z ikony na ekranie głównym.";

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
  const payload = getSubscriptionPayload(subscription);
  if (!payload?.endpoint) return { saved: false, skipped: true, reason: "missing-endpoint" };

  const signature = buildSubscriptionSignature(sessionUser, payload);
  const now = Date.now();

  if (pushSaveInFlight) return pushSaveInFlight;

  if (!force) {
    if (signature === lastSavedSignature && now - lastSaveAttemptAt < PUSH_SAVE_COOLDOWN_MS) {
      return { saved: false, skipped: true, reason: "cooldown" };
    }
    if (now - lastForbiddenAt < PUSH_SAVE_COOLDOWN_MS) {
      return { saved: false, skipped: true, reason: "forbidden-cooldown" };
    }
  }

  lastSaveAttemptAt = now;

  const lifecycleToken = getOrCreateDesktopPushLifecycleToken(sessionUser);
  const savePromise = (async () => {
    const { data, error } = await supabase.rpc("push_subscription_sync_self", {
      p_endpoint: payload.endpoint,
      p_p256dh: payload.p256dh,
      p_auth: payload.auth,
      p_lifecycle_token: lifecycleToken,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      p_device_label: typeof navigator !== "undefined" ? `${navigator.platform || "Urządzenie"} / ${navigator.userAgentData?.platform || navigator.language || "przeglądarka"}` : "Przeglądarka",
    });

    if (error) {
      if (isForbiddenStatus(error)) lastForbiddenAt = Date.now();
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    lastSavedSignature = signature;
    return {
      saved: true,
      skipped: false,
      reason: row?.reason || "ok",
      generation: Number(row?.ownership_generation || 0),
      reassigned: Boolean(row?.reassigned),
    };
  })();

  pushSaveInFlight = savePromise;

  try {
    return await savePromise;
  } finally {
    if (pushSaveInFlight === savePromise) pushSaveInFlight = null;
  }
}

export async function disableSavedPushSubscription({ supabase, endpoint }) {
  if (!supabase || !endpoint) return { disabled: false, skipped: true };
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData?.session?.user || null;
  if (!sessionUser) return { disabled: false, skipped: true };
  const lifecycleToken = getOrCreateDesktopPushLifecycleToken(sessionUser);
  const { data: row, error: rowError } = await supabase
    .from("push_subscriptions")
    .select("p256dh, auth")
    .eq("user_id", sessionUser.id)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row?.p256dh || !row?.auth) return { disabled: false, skipped: true };
  const { data, error } = await supabase.rpc("push_subscription_disable_self", {
    p_endpoint: endpoint,
    p_p256dh: row.p256dh,
    p_auth: row.auth,
    p_lifecycle_token: lifecycleToken,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return { disabled: Boolean(result?.disabled), skipped: false, result };
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
  // PUSH jest obowiązkowy w aplikacji Wawis. Funkcja zostaje wyłącznie dla
  // zgodności ze starszymi, już otwartymi wersjami aplikacji. Nie wyłącza
  // subskrypcji; jeśli system pozwala, zamiast tego ponownie ją aktywuje.
  return ensurePushNotifications({ supabase, sessionUser, requestPermission: false });
}

export async function getPushStatus({ supabase, sessionUser }) {
  const diagnostics = getPushDiagnostics();
  const permission = diagnostics.permission;
  const vapidConfigured = diagnostics.vapidConfigured;

  if (!diagnostics.supported) {
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
  let serverRegistered = false;
  let serverActive = false;
  let lastSeenAt = null;
  let syncError = null;

  if (!subscription && permission === "granted" && supabase && sessionUser) {
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
        .select("id, is_active, last_seen_at")
        .eq("user_id", sessionUser.id)
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();

      if (existingServerError) throw existingServerError;

      if (existingServerRow?.id && existingServerRow.is_active === false) {
        subscription = await replaceExpiredPushSubscription({
          supabase,
          sessionUser,
          subscription,
        });
        if (subscription) {
          serverRegistered = true;
          serverActive = true;
          lastSeenAt = new Date().toISOString();
        }
      } else if (!existingServerRow?.id) {
        await savePushSubscription({ supabase, sessionUser, subscription, force: true });
        serverRegistered = true;
        serverActive = true;
        lastSeenAt = new Date().toISOString();
      } else {
        serverRegistered = true;
        serverActive = Boolean(existingServerRow.is_active);
        lastSeenAt = existingServerRow.last_seen_at || null;
        if (!serverActive || shouldTouchServerSubscription(lastSeenAt)) {
          await savePushSubscription({ supabase, sessionUser, subscription, force: true });
          serverActive = true;
          lastSeenAt = new Date().toISOString();
        }
      }
    } catch (error) {
      syncError = error?.message || String(error);
      console.warn("Nie udało się zsynchronizować subskrypcji push z Supabase:", syncError);
    }
  }

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

async function invokePushFunction({ supabase, body }) {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Brakuje konfiguracji Supabase do wywołania funkcji push.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
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
