import { supabaseAnonKey, supabaseUrl } from "../lib/supabase.js";

const env = typeof import.meta !== "undefined" && import.meta?.env ? import.meta.env : {};
export const WEB_PUSH_PUBLIC_KEY = String(env.VITE_WEB_PUSH_PUBLIC_KEY || "").trim();
const PUSH_SW_PATH = "/push-sw.js";
const PUSH_SAVE_COOLDOWN_MS = 15000;
const PUSH_SERVER_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;

let pushSaveInFlight = null;
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
  return navigator.serviceWorker.register(PUSH_SW_PATH);
}

export async function savePushSubscription({ supabase, sessionUser, subscription, force = false }) {
  if (!supabase || !sessionUser || !subscription) return { saved: false, skipped: true, reason: "missing-data" };
  const payload = getSubscriptionPayload(subscription);
  if (!payload?.endpoint) return { saved: false, skipped: true, reason: "missing-endpoint" };

  const signature = buildSubscriptionSignature(sessionUser, payload);
  const now = Date.now();

  if (pushSaveInFlight) return pushSaveInFlight;

  if (!force && signature === lastSavedSignature && now - lastSaveAttemptAt < PUSH_SAVE_COOLDOWN_MS) {
    return { saved: false, skipped: true, reason: "cooldown" };
  }

  lastSaveAttemptAt = now;

  const savePromise = (async () => {
    const result = await invokePushFunction({
      supabase,
      body: {
        eventType: "sync_subscription",
        triggeredBy: "push-subscription-sync",
        subscription: {
          endpoint: payload.endpoint,
          p256dh: payload.p256dh,
          auth: payload.auth,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          deviceLabel: typeof navigator !== "undefined"
            ? `${navigator.platform || "Urządzenie"} / ${navigator.userAgentData?.platform || navigator.language || "przeglądarka"}`
            : "Przeglądarka",
        },
      },
    });

    lastSavedSignature = signature;
    return {
      saved: true,
      skipped: false,
      reason: result?.reassigned ? "reassigned" : "ok",
      reassigned: Boolean(result?.reassigned),
    };
  })();

  pushSaveInFlight = savePromise;

  try {
    return await savePromise;
  } finally {
    if (pushSaveInFlight === savePromise) pushSaveInFlight = null;
  }
}

export async function disableSavedPushSubscription({ supabase, subscription }) {
  if (!supabase || !subscription) return;
  const payload = getSubscriptionPayload(subscription);
  if (!payload?.endpoint || !payload?.p256dh || !payload?.auth) return;

  await invokePushFunction({
    supabase,
    body: {
      eventType: "disable_subscription",
      triggeredBy: "push-subscription-disable",
      subscription: {
        endpoint: payload.endpoint,
        p256dh: payload.p256dh,
        auth: payload.auth,
      },
    },
  });
}

export async function getCurrentPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await registerPushServiceWorker();
  return registration?.pushManager.getSubscription() || null;
}

async function replaceExpiredPushSubscription({ supabase, sessionUser, subscription }) {
  const registration = await registerPushServiceWorker();
  if (!registration?.pushManager) return null;

  if (subscription) {
    await subscription.unsubscribe().catch(() => false);
  }

  const replacement = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
  });

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

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    });
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
