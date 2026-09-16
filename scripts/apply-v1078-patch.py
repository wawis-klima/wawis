from pathlib import Path
import json, re, subprocess


def read(path):
    return Path(path).read_text(encoding='utf-8')

def write(path, text):
    Path(path).write_text(text, encoding='utf-8')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

def regex_once(text, pattern, repl, label, flags=0):
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'missing/ambiguous regex target {label}: {count}')
    return updated

# ---------------------------------------------------------------------------
# Mobile PUSH lifecycle
# ---------------------------------------------------------------------------
path = 'src/mobile791/modules/push-subscriptions.js'
s = read(path)
s = replace_once(s,
'''import { supabaseAnonKey, supabaseUrl } from "../lib/supabase.js";''',
'''import { supabaseAnonKey, supabaseUrl } from "../lib/supabase.js";
import {
  clearPushLifecycleToken,
  clearPushServiceWorkerContext,
  getDuePendingPushDisables,
  getOrCreatePushLifecycleToken,
  markPendingPushDisableRetry,
  persistPendingPushDisable,
  readPendingPushDisables,
  removePendingPushDisable,
  setPushServiceWorkerContext,
} from "./push-lifecycle-v1078.js";''', 'push lifecycle import')

s = replace_once(s,
'''const PUSH_LOGOUT_PENDING_KEY = "wawis_push_logout_pending_v1076";
const PUSH_LOGOUT_REQUEST_TIMEOUT_MS = 1600;
const PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS = 900;
const PUSH_LOGOUT_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let pushSaveInFlight = null;
let lastSavedSignature = "";
let lastSaveAttemptAt = 0;''',
'''const PUSH_LOGOUT_REQUEST_TIMEOUT_MS = 3200;
const PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS = 900;

let pushSaveInFlight = null;
let pushSaveAbortControl = null;
let pushLifecycleEpoch = 0;
let pushLogoutInProgress = false;
let lastSavedSignature = "";
let lastSaveAttemptAt = 0;''', 'push constants')

s = replace_once(s,
'''function buildSyncSubscriptionBody(payload, triggeredBy = "push-subscription-sync") {
  const device = getPushDeviceMetadata();
  return { eventType: "sync_subscription", triggeredBy, subscription: {
    endpoint: payload.endpoint, p256dh: payload.p256dh, auth: payload.auth,
    userAgent: device.userAgent, deviceLabel: device.deviceLabel,
  }};
}

function buildDisableSubscriptionBody(payload, triggeredBy = "push-subscription-disable") {
  return { eventType: "disable_subscription", triggeredBy, subscription: {
    endpoint: payload.endpoint, p256dh: payload.p256dh, auth: payload.auth,
  }};
}''',
'''function buildSyncSubscriptionBody(payload, triggeredBy = "push-subscription-sync") {
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
}''', 'push request bodies')

s = regex_once(s,
r'''function persistPendingPushDisable\(payload\) \{[\s\S]*?function clearPendingPushDisableIfMatches\(payload\) \{[\s\S]*?\n\}''',
'''function findPendingDisableForPayload(payload) {
  if (!payload?.endpoint) return null;
  return readPendingPushDisables().find((item) => pushCredentialsMatch(item.subscription, payload)
    && (!payload.lifecycleToken || item.lifecycleToken === payload.lifecycleToken)) || null;
}''', 'legacy pending functions')

s = replace_once(s,
'''  return { signal: controller.signal, cancel: () => clearTimeout(timerId) };''',
'''  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timerId),
    abort: () => {
      try { controller.abort(new DOMException("Push lifecycle invalidated", "AbortError")); } catch {}
    },
  };''', 'abort control')

s = replace_once(s,
'''  const needsStandalone = iosDevice;''',
'''  const needsStandalone = true;''', 'standalone all devices')
s = replace_once(s,
'''  else if (needsStandalone && !standalone) reason = "Na iPhonie otwórz aplikację z ikony na ekranie głównym.";''',
'''  else if (needsStandalone && !standalone) reason = "Powiadomienia PUSH działają tylko w zainstalowanej aplikacji Wawis.";''', 'standalone reason')

s = regex_once(s,
r'''export async function savePushSubscription\(\{ supabase, sessionUser, subscription, force = false \}\) \{[\s\S]*?\n\}\n\nexport async function disableSavedPushSubscription''',
'''export async function savePushSubscription({ supabase, sessionUser, subscription, force = false }) {
  if (!supabase || !sessionUser || !subscription) return { saved: false, skipped: true, reason: "missing-data" };
  if (pushLogoutInProgress) return { saved: false, skipped: true, reason: "logout-in-progress" };
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
    if (pushLogoutInProgress || epochAtStart !== pushLifecycleEpoch) {
      return { saved: false, skipped: true, reason: "stale-lifecycle" };
    }
    const generation = Number(result?.subscription?.ownership_generation || 0);
    if (generation > 0) {
      await setPushServiceWorkerContext({ userId: sessionUser.id, generation });
    }
    lastSavedSignature = signature;
    return {
      saved: true,
      skipped: false,
      reason: result?.reassigned ? "reassigned" : (result?.reason || "ok"),
      reassigned: Boolean(result?.reassigned),
      generation,
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

export async function disableSavedPushSubscription''', 'save push subscription', flags=re.M)

s = regex_once(s,
r'''export async function disableSavedPushSubscription\(\{ supabase, subscription \}\) \{[\s\S]*?\n\}\n\nexport async function deactivatePushForLogout''',
'''export async function disableSavedPushSubscription({ supabase, subscription }) {
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

export async function deactivatePushForLogout''', 'disable saved push', flags=re.M)

s = regex_once(s,
r'''export async function deactivatePushForLogout\(\{ supabase \}\) \{[\s\S]*?\n\}\n\nexport async function reconcilePendingPushLogout''',
'''export async function deactivatePushForLogout({ supabase }) {
  pushLogoutInProgress = true;
  pushLifecycleEpoch += 1;
  pushSaveAbortControl?.abort?.();
  await clearPushServiceWorkerContext().catch(() => null);

  const { data: sessionData } = supabase ? await supabase.auth.getSession().catch(() => ({ data: null })) : { data: null };
  const sessionUser = sessionData?.session?.user || null;
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

export async function reconcilePendingPushLogout''', 'deactivate push logout', flags=re.M)

s = regex_once(s,
r'''export async function reconcilePendingPushLogout\(\{ supabase, sessionUser \}\) \{[\s\S]*?\n\}\n\nexport async function getCurrentPushSubscription''',
'''export async function reconcilePendingPushLogout({ supabase, sessionUser, force = false }) {
  const pendingItems = getDuePendingPushDisables({ force });
  if (!pendingItems.length || !supabase || !sessionUser) {
    return { reconciled: false, pending: readPendingPushDisables().length > 0, reason: pendingItems.length ? "missing-session" : "nothing-due" };
  }

  let cleaned = 0;
  let failed = 0;
  let touchedCurrentSubscription = false;
  const currentSubscription = await getExistingPushSubscription();
  const currentPayload = getSubscriptionPayload(currentSubscription);

  for (const item of pendingItems) {
    const requestControl = createPushLifecycleAbort();
    try {
      const body = buildDisableSubscriptionBody({
        ...item.subscription,
        lifecycleToken: item.lifecycleToken || "",
      }, "login-stale-cleanup");
      const result = await invokePushFunction({ supabase, body, signal: requestControl.signal });
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
  if (touchedCurrentSubscription && currentSubscription && !failed) {
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

export async function getCurrentPushSubscription''', 'reconcile pending push logout', flags=re.M)

# Existing server row needs generation so the SW context can be restored without a write.
s = replace_once(s,
'''.select("id, is_active, last_seen_at")''',
'''.select("id, is_active, last_seen_at, ownership_generation")''', 'push status select generation')
s = replace_once(s,
'''  let syncError = null;''',
'''  let syncError = null;
  let ownershipGeneration = 0;''', 'push status generation variable')
s = replace_once(s,
'''      if (existingServerError) throw existingServerError;

      if (existingServerRow?.id && existingServerRow.is_active === false) {''',
'''      if (existingServerError) throw existingServerError;
      ownershipGeneration = Number(existingServerRow?.ownership_generation || 0);

      if (existingServerRow?.id && existingServerRow.is_active === false) {''', 'push status assign generation')
s = replace_once(s,
'''      } else if (!existingServerRow?.id) {
        await savePushSubscription({ supabase, sessionUser, subscription, force: true });
        serverRegistered = true;''',
'''      } else if (!existingServerRow?.id) {
        const saveResult = await savePushSubscription({ supabase, sessionUser, subscription, force: true });
        ownershipGeneration = Number(saveResult?.generation || 0);
        serverRegistered = true;''', 'push status save generation')
s = replace_once(s,
'''        if (!serverActive || shouldTouchServerSubscription(lastSeenAt)) {
          await savePushSubscription({ supabase, sessionUser, subscription, force: true });
          serverActive = true;''',
'''        if (!serverActive || shouldTouchServerSubscription(lastSeenAt)) {
          const saveResult = await savePushSubscription({ supabase, sessionUser, subscription, force: true });
          ownershipGeneration = Number(saveResult?.generation || ownershipGeneration || 0);
          serverActive = true;''', 'push status refresh generation')
s = replace_once(s,
'''  return {
    supported: true,''',
'''  if (serverActive && ownershipGeneration > 0) {
    await setPushServiceWorkerContext({ userId: sessionUser?.id, generation: ownershipGeneration }).catch(() => null);
  }

  return {
    supported: true,''', 'push status SW context')
s = replace_once(s,
'''  if (!diagnostics.supported) {
    return {
      supported: false,''',
'''  if (!diagnostics.supported) {
    await clearPushServiceWorkerContext().catch(() => null);
    return {
      supported: false,''', 'unsupported clears context')
write(path, s)

# Online/healthcheck retry for pending cleanup.
path = 'src/mobile791/hooks/usePushNotificationsState.js'
s = read(path)
s = replace_once(s,
'''    if (syncInFlightRef.current) return syncInFlightRef.current;
    if (!force && Date.now() - lastSuccessfulSyncAtRef.current < PUSH_MIN_SYNC_INTERVAL_MS) {
      return readStoredPushState(userId);
    }

    const syncPromise = (async () => {
      const { getPushStatus } = await loadPushModule();
      const nextState = await getPushStatus({ supabase, sessionUser });''',
'''    if (syncInFlightRef.current) return syncInFlightRef.current;

    const pushModule = await loadPushModule();
    await pushModule.reconcilePendingPushLogout({ supabase, sessionUser, force }).catch((error) => {
      console.warn("Nie udało się ponowić sprzątania starego PUSH:", error?.message || error);
    });

    if (!force && Date.now() - lastSuccessfulSyncAtRef.current < PUSH_MIN_SYNC_INTERVAL_MS) {
      return readStoredPushState(userId);
    }

    const syncPromise = (async () => {
      const nextState = await pushModule.getPushStatus({ supabase, sessionUser });''', 'push hook retry before cooldown')
s = replace_once(s,
'''        void syncPushState();
      }
    }, PUSH_HEALTHCHECK_MS);''',
'''        void syncPushState({ force: true });
      }
    }, PUSH_HEALTHCHECK_MS);''', 'push healthcheck force cleanup')
write(path, s)

# Login/restore should ignore backoff and attempt pending cleanup immediately.
path = 'src/mobile791/modules/auth.js'
s = read(path)
s = s.replace('reconcilePendingPushLogout({ supabase, sessionUser: user })', 'reconcilePendingPushLogout({ supabase, sessionUser: user, force: true })')
s = s.replace('reconcilePendingPushLogout({ supabase, sessionUser: data.user })', 'reconcilePendingPushLogout({ supabase, sessionUser: data.user, force: true })')
write(path, s)

# ---------------------------------------------------------------------------
# Service Worker — persistent active user/generation and stale-message reject.
# ---------------------------------------------------------------------------
path = 'public/push-sw.js'
s = read(path)
if not s.startswith('importScripts("/push-safety.js");'):
    s = 'importScripts("/push-safety.js");\n\n' + s
s = replace_once(s,
'''      cache.add("/logo.png"),''',
'''      cache.add("/logo.png"),
      cache.add("/push-safety.js"),''', 'cache push safety')
old_message = '''self.addEventListener("message", (event) => {
  if (event.data?.type !== "WAWIS_CACHE_LOADED_ASSETS") return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil((async () => {
    const cache = await caches.open("wawis-app-shell-v10.77");
    const safeUrls = urls.filter((value) => {
      try {
        return new URL(value, self.location.origin).origin === self.location.origin;
      } catch {
        return false;
      }
    });
    await Promise.allSettled(safeUrls.map((url) => cache.add(url)));
  })());
});'''
new_message = '''const PUSH_CONTEXT_DB = "wawis-push-context-v1078";
const PUSH_CONTEXT_STORE = "context";

function openPushContextDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_CONTEXT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PUSH_CONTEXT_STORE)) {
        request.result.createObjectStore(PUSH_CONTEXT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writePushContext(value) {
  const db = await openPushContextDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PUSH_CONTEXT_STORE, "readwrite");
      tx.objectStore(PUSH_CONTEXT_STORE).put(value, "active");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("push context transaction aborted"));
    });
  } finally { db.close(); }
}

async function readPushContext() {
  const db = await openPushContextDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PUSH_CONTEXT_STORE, "readonly");
      const request = tx.objectStore(PUSH_CONTEXT_STORE).get("active");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "WAWIS_PUSH_CONTEXT_SET") {
    event.waitUntil(writePushContext({
      userId: String(event.data.userId || ""),
      generation: Number(event.data.generation || 0),
    }));
    return;
  }
  if (event.data?.type === "WAWIS_PUSH_CONTEXT_CLEAR") {
    event.waitUntil(writePushContext({ userId: "", generation: 0 }));
    return;
  }
  if (event.data?.type !== "WAWIS_CACHE_LOADED_ASSETS") return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil((async () => {
    const cache = await caches.open("wawis-app-shell-v10.77");
    const safeUrls = urls.filter((value) => {
      try {
        return new URL(value, self.location.origin).origin === self.location.origin;
      } catch {
        return false;
      }
    });
    await Promise.allSettled(safeUrls.map((url) => cache.add(url)));
  })());
});'''
s = replace_once(s, old_message, new_message, 'service worker message/context')

s = regex_once(s,
r'''self\.addEventListener\("push", \(event\) => \{[\s\S]*?\n\}\);\n\nself\.addEventListener\("notificationclick"''',
'''self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = {};
  }

  event.waitUntil((async () => {
    const context = await readPushContext().catch(() => null);
    if (!self.WawisPushSafety?.shouldDisplayPush(payload, context || {})) return;

    const title = payload.title || "Wawis";
    const options = {
      body: payload.body || "Masz nowe zdarzenie w aplikacji Wawis.",
      icon: "/logo.png",
      badge: "/logo.png",
      tag: payload.tag || `job-${payload.jobId || "event"}`,
      data: {
        url: payload.url || "/",
        jobId: payload.jobId || null,
      },
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick"''', 'service worker push guard', flags=re.M)
write(path, s)

# ---------------------------------------------------------------------------
# Edge Function — all ownership mutations through atomic RPC.
# ---------------------------------------------------------------------------
path = 'supabase/functions/send-assignment-push/index.ts'
s = read(path)
s = replace_once(s,
'''    auth?: string;
    userAgent?: string;
    deviceLabel?: string;''',
'''    auth?: string;
    lifecycleToken?: string;
    clientMode?: string;
    userAgent?: string;
    deviceLabel?: string;''', 'edge subscription type')

s = replace_once(s,
'''      return await handleSyncSubscription({
        adminClient,
        authUserId: authData.user.id,
        subscription: body.subscription || null,
      });''',
'''      return await handleSyncSubscription({
        adminClient,
        authUserId: authData.user.id,
        triggeredBy: String(body.triggeredBy || ""),
        subscription: body.subscription || null,
      });''', 'edge sync call')
s = replace_once(s,
'''      return await handleDisableSubscription({
        adminClient,
        authUserId: authData.user.id,
        subscription: body.subscription || null,
      });''',
'''      return await handleDisableSubscription({
        adminClient,
        authUserId: authData.user.id,
        triggeredBy: String(body.triggeredBy || ""),
        subscription: body.subscription || null,
      });''', 'edge disable call')

s = regex_once(s,
r'''async function handleSyncSubscription\([\s\S]*?\n\}\n\nasync function handleDisableSubscription\([\s\S]*?\n\}\n\nasync function handleJobAssigned''',
'''function legacyLifecycleToken(userId: string, endpoint: string) {
  return `legacy:${userId}:${endpoint}`;
}

function pushLifecycleErrorStatus(error: any) {
  const message = String(error?.message || "");
  if (message.includes("push_credentials_mismatch")) return 409;
  if (message.includes("push_owner_active") || message.includes("push_lifecycle_disabled")) return 409;
  if (message.includes("push_invalid_")) return 400;
  return 500;
}

async function handleSyncSubscription({ adminClient, authUserId, triggeredBy, subscription }: any) {
  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.p256dh || "").trim();
  const auth = String(subscription?.auth || "").trim();
  const userAgent = String(subscription?.userAgent || "").slice(0, 1200);
  const deviceLabel = String(subscription?.deviceLabel || "Urządzenie").slice(0, 240);
  const clientMode = String(subscription?.clientMode || "").trim().toLowerCase();
  const suppliedLifecycleToken = String(subscription?.lifecycleToken || "").trim();
  const lifecycleToken = suppliedLifecycleToken || legacyLifecycleToken(String(authUserId), endpoint);

  if (!endpoint || !p256dh || !auth) return json({ error: "Brak kompletnej subskrypcji push." }, 400);

  const legacyMobileClient = !clientMode && /Android|iPhone|iPad|iPod/i.test(userAgent);
  if (clientMode !== "standalone" && !legacyMobileClient) {
    return json({ error: "PUSH działa wyłącznie w zainstalowanej aplikacji Wawis." }, 409);
  }

  // Kompatybilność 10.76: stary klient podczas login-account-handoff nie zna
  // lifecycleToken A. Atomowo wyłączamy wyłącznie rekord legacy z identycznymi kluczami.
  if (!suppliedLifecycleToken && triggeredBy === "login-account-handoff") {
    const { error: cleanupError } = await adminClient.rpc("push_subscription_disable_atomic", {
      p_request_user_id: authUserId,
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_lifecycle_token: "",
      p_allow_foreign_cleanup: true,
      p_allow_legacy_cleanup: true,
    });
    if (cleanupError && !String(cleanupError.message || "").includes("not-found")) {
      return json({ error: cleanupError.message }, pushLifecycleErrorStatus(cleanupError));
    }
  }

  const { data, error } = await adminClient.rpc("push_subscription_sync_atomic", {
    p_user_id: authUserId,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_lifecycle_token: lifecycleToken,
    p_user_agent: userAgent,
    p_device_label: deviceLabel,
  });
  if (error) return json({ error: error.message }, pushLifecycleErrorStatus(error));

  const row = Array.isArray(data) ? data[0] : data;
  console.log("push subscription synchronized atomically", {
    subscriptionId: row?.subscription_id || null,
    authUserId,
    reassigned: Boolean(row?.reassigned),
    generation: Number(row?.ownership_generation || 0),
  });
  return json({
    ok: true,
    reassigned: Boolean(row?.reassigned),
    reason: row?.reason || "ok",
    subscription: row ? {
      id: row.subscription_id,
      user_id: row.owner_user_id,
      is_active: row.is_active,
      last_seen_at: row.last_seen_at,
      ownership_generation: Number(row.ownership_generation || 0),
    } : null,
  });
}

async function handleDisableSubscription({ adminClient, authUserId, triggeredBy, subscription }: any) {
  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.p256dh || "").trim();
  const auth = String(subscription?.auth || "").trim();
  const suppliedLifecycleToken = String(subscription?.lifecycleToken || "").trim();
  if (!endpoint || !p256dh || !auth) return json({ error: "Brak kompletnej subskrypcji push do wyłączenia." }, 400);

  const staleCleanup = triggeredBy === "login-stale-cleanup";
  const lifecycleToken = suppliedLifecycleToken || (staleCleanup ? "" : legacyLifecycleToken(String(authUserId), endpoint));
  const { data, error } = await adminClient.rpc("push_subscription_disable_atomic", {
    p_request_user_id: authUserId,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_lifecycle_token: lifecycleToken,
    p_allow_foreign_cleanup: staleCleanup,
    p_allow_legacy_cleanup: staleCleanup && !suppliedLifecycleToken,
  });
  if (error) return json({ error: error.message }, pushLifecycleErrorStatus(error));

  const row = Array.isArray(data) ? data[0] : data;
  console.log("push subscription disabled atomically", {
    subscriptionId: row?.subscription_id || null,
    authUserId,
    disabled: Boolean(row?.disabled),
    reason: row?.reason || null,
    generation: Number(row?.ownership_generation || 0),
  });
  return json({
    ok: true,
    disabled: Boolean(row?.disabled),
    reason: row?.reason || "not-found",
    ownership_generation: Number(row?.ownership_generation || 0),
  });
}

async function handleJobAssigned''', 'edge atomic handlers', flags=re.M)

s = replace_once(s,
'''.select("id, user_id, endpoint, p256dh, auth")''',
'''.select("id, user_id, endpoint, p256dh, auth, ownership_generation")''', 'edge subscription generation select')

# Payload is now built per subscription and never carries client/address/comment text.
s = regex_once(s,
r'''\n  const payload = JSON\.stringify\(\{[\s\S]*?\n  \}\);\n\n  const results = await Promise\.all\(subscriptions\.map\(async \(subscription: any\) => \{''',
'''\n  const safeBody = deliveryType === "push_test"
    ? "Powiadomienia PUSH działają."
    : "Masz nowe zdarzenie w aplikacji Wawis. Otwórz aplikację, aby zobaczyć szczegóły.";

  const results = await Promise.all(subscriptions.map(async (subscription: any) => {
    const payload = JSON.stringify({
      type: deliveryType,
      jobId: job?.id || null,
      title,
      body: safeBody,
      url: targetUrl || (job?.id ? `/?jobId=${encodeURIComponent(job.id)}` : "/"),
      tag,
      recipientUserId: String(subscription.user_id || ""),
      subscriptionGeneration: Number(subscription.ownership_generation || 0),
    });''', 'edge per-subscription safe payload', flags=re.M)
write(path, s)

# ---------------------------------------------------------------------------
# Release process: GitHub is source of truth; ZIP/Drive and live evidence do not block.
# ---------------------------------------------------------------------------
path = 'scripts/run-release.cjs'
s = read(path)
s = replace_once(s,
'''    baseRef: valueAfter(args, '--base-ref', process.env.WAWIS_RELEASE_BASE_REF || 'origin/main'),''',
'''    baseRef: valueAfter(args, '--base-ref', process.env.WAWIS_RELEASE_BASE_REF || 'origin/main'),
    packageArtifact: args.includes('--package'),''', 'release package option')
s = regex_once(s,
r'''\n  plan\.push\(\{ label: 'Package', command: 'npm run zip:release' \}\);[\s\S]*?\n  \}\);\n\n  return plan;''',
'''\n  if (options.packageArtifact) {
    plan.push({ label: 'Package', command: 'npm run zip:release' });
    plan.push({
      label: 'Package',
      command: isSandbox
        ? 'node scripts/verify-release.cjs --require-zip --allow-no-build'
        : 'node scripts/verify-release.cjs --require-zip',
    });
  }

  return plan;''', 'optional package plan', flags=re.M)
write(path, s)

path = 'scripts/release-policy-gate.cjs'
s = read(path)
s = re.sub(r"const DRIVE_RELEASE_FOLDER_ID = .*?;\nconst DRIVE_RELEASE_FOLDER_PATH = .*?;\n", '', s)
s = re.sub(r"\nfunction validDriveBackup\([\s\S]*?\n\}\n", '\n', s, count=1)
s = regex_once(s,
r'''\n  const driveBackup = gate\.drive_backup \|\| \{\};[\s\S]*?\n  \}\n\n  if \(postMode\) \{''',
'''\n  if (deployMode || postMode) {
    assert(gate.main_protection?.ready_for_main === true, 'NO-GO: release nie jest oznaczony jako gotowy do main');
    assert(String(gate.main_protection?.source_branch || '') === `release/v${appVersion}`, 'NO-GO: źródło wdrożenia nie jest właściwą gałęzią release');
    assert(typeof gate.main_protection?.final_release_run_id === 'string' && gate.main_protection.final_release_run_id.trim(), 'NO-GO: brak ID zielonego finalnego release run');
  }

  if (postMode) {''', 'remove drive gate', flags=re.M)
write(path, s)

path = 'scripts/micro-ui-deploy-gate.cjs'
s = read(path)
s = re.sub(r"const DRIVE_RELEASE_FOLDER_ID = .*?;\nconst DRIVE_RELEASE_FOLDER_PATH = .*?;\n", '', s)
s = re.sub(r'''\n  assert\(gate\.drive_backup\?\.required === false,[\s\S]*?assert\(gate\.drive_backup\?\.folder_path === DRIVE_RELEASE_FOLDER_PATH, .*?\);''',
'''\n  assert(gate.archive?.blocking === false, 'NO-GO: archiwum GitHub nie może blokować micro-ui');''', s, count=1)
write(path, s)

path = 'scripts/smoke-release-impact-v1063.cjs'
s = read(path).replace("assert.match(microGateSource, /drive_backup/);\nassert.match(microGateSource, /deferred/);", "assert.match(microGateSource, /archive/);\nassert.match(microGateSource, /blocking/);")
write(path, s)

# Rules/checklist are concise authoritative docs; remove Drive as a release dependency.
path = 'WAWIS-RULES.md'
s = read(path)
s = s.replace('Normalne wydanie trafia do `main` dopiero po testach, finalnym ZIP i zweryfikowanym backupie Drive.', 'Normalne wydanie trafia do `main` dopiero po wymaganych testach i zielonym finalnym runie. GitHub (`main` + historia commitów) jest źródłem archiwalnym; ZIP i Google Drive nie są zależnością wydania.')
s = s.replace('ZIP powstaje po merge i nie blokuje produkcji.', 'archiwum nie blokuje produkcji.')
s = s.replace('produkcyjnego builda, `verify:bundle`, `verify:release`, utworzenie ZIP-a i kontrola ZIP-a wykonują się po jednym razie.', 'produkcyjnego builda, `verify:bundle` i `verify:release` wykonują się po jednym razie; ZIP jest opcjonalny (`--package`) i nie jest częścią bramki.')
s = s.replace('Dla MICRO UI ZIP nie blokuje wdrożenia. Po merge workflow `WAWIS micro UI archive` tworzy `klima-app-v<WERSJA>.zip` jako GitHub Artifact. Kopię na Drive można uzupełnić później bez uruchamiania kolejnego deployu produkcyjnego.', 'Dla MICRO UI również nie ma obowiązkowego ZIP-a. GitHub przechowuje źródło i historię; ewentualny artefakt można utworzyć ręcznie bez wpływu na deploy.')
s = s.replace('finalnego ZIP-a, zweryfikowanego backupu Drive oraz `ready_for_main=true`.', '`ready_for_main=true` oraz zielonego finalnego runu przypiętego do gałęzi release.')
s = s.replace('4. `drive_backup.required=false` i `deferred=true`,', '4. `archive.blocking=false`,')
s = regex_once(s, r'''## 6\. Google Drive i archiwum[\s\S]*?\n## 7\.''', '''## 6. GitHub i archiwum\n\n`main` wraz z historią commitów jest źródłem prawdy i archiwum każdej wersji. Google Drive nie jest używany w procesie release. ZIP jest opcjonalny i tworzony tylko na żądanie (`--package`); jego brak nie blokuje testów, merge ani Vercela.\n\n## 7.''', 'rules archive section')
s = s.replace('- Normalny release wymaga finalnego runu i backupu Drive.', '- Normalny release wymaga zielonego finalnego runu; Drive/ZIP nie są warunkiem.')
s = s.replace('finalny runner i Drive nie są wymagane przed merge.', 'finalny runner nie jest wymagany przed merge.')
s = regex_once(s, r'''## 8\. POST-DEPLOY EVIDENCE[\s\S]*?\n## 9\.''', '''## 8. Kontrola po wdrożeniu\n\nPo merge wymagany jest zielony deployment Vercela dla commita `main`. Odczyt `/app-version.json` i cache Service Workera pozostaje szybkim testem pomocniczym, ale nie tworzy drugiej blokującej bramki release. Nie tworzymy per-wersja gałęzi/workflow tylko po to, aby powtórzyć kontrolę po poprawnym deployu. Diagnostyka pozostaje informacyjna.\n\n## 9.''', 'rules postdeploy section')
s = s.replace('DIAGNOSTYKA STARTOWA (INFO) -> RELEASE BRANCH -> ZMIANA -> PR CHECKS -> FINAL RELEASE -> BUILD/VERIFY/ZIP -> DRIVE -> MAIN -> VERCEL -> LIVE VERSION/SW -> DIAGNOSTYKA RAPORTOWA (INFO)', 'DIAGNOSTYKA STARTOWA (INFO) -> RELEASE BRANCH -> ZMIANA -> PR CHECKS -> FINAL RELEASE -> BUILD/VERIFY -> MAIN -> VERCEL -> OPCJONALNY SZYBKI LIVE CHECK')
s = s.replace('RELEASE BRANCH -> CSS ONLY -> VERSION/GATE -> ONE PR CHECK -> MAIN -> ONE VERCEL -> DEFERRED ZIP/POST-CHECK', 'RELEASE BRANCH -> CSS ONLY -> VERSION/GATE -> ONE PR CHECK -> MAIN -> ONE VERCEL')
write(path, s)

path = 'RELEASE-CHECKLIST.md'
s = read(path)
s = s.replace('- [ ] Powstał ZIP, został zweryfikowany i wysłany na Drive.\n', '')
s = s.replace('- `MICRO UI` — tylko CSS aplikacji: bez osobnego workflow przygotowawczego, jeden szybki PR check, jeden merge, jeden Vercel, ZIP po merge.', '- `MICRO UI` — tylko CSS aplikacji: bez osobnego workflow przygotowawczego, jeden szybki PR check, jeden merge, jeden Vercel.')
s = s.replace('- [ ] `drive_backup.required=false` oraz `drive_backup.deferred=true`.', '- [ ] `archive.blocking=false`.')
s = s.replace('- [ ] Nie czekamy na ZIP/Drive przed merge.', '- [ ] Nie czekamy na ZIP ani zewnętrzny backup przed merge.')
s = s.replace('- [ ] Po merge `WAWIS micro UI archive` tworzy ZIP jako GitHub Artifact; Drive można uzupełnić później bez kolejnego deployu.\n', '')
s = regex_once(s, r'''## 7\. Post-deploy[\s\S]*$''', '''## 7. Po wdrożeniu\n\n- [ ] Deployment Vercela dla commita `main` zakończył się sukcesem.\n- [ ] Opcjonalny szybki odczyt `/app-version.json` i Service Workera może potwierdzić wersję, ale nie tworzy osobnej blokującej bramki.\n- [ ] Nie tworzymy per-wersja workflow/gałęzi tylko do post-deploy checku.\n- [ ] Diagnostyka pozostaje raportem informacyjnym.\n''', 'checklist postdeploy')
write(path, s)

# Test group and package script for the new regression.
path = 'scripts/test-groups.cjs'
s = read(path)
s = replace_once(s,
'''    'npm run test:smoke:push-logout-handoff',
    'npm run test:smoke:comment-admin-push',''',
'''    'npm run test:smoke:push-logout-handoff',
    'npm run test:smoke:push-safety-v1078',
    'npm run test:smoke:comment-admin-push',''', 'push group v1078')
write(path, s)

pkg_path = Path('package.json')
pkg = json.loads(pkg_path.read_text())
pkg['scripts']['test:smoke:push-safety-v1078'] = 'node scripts/smoke-push-safety-v1078.mjs'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')

# Bump 10.77 -> 10.78 after all source edits.
subprocess.run(['node', 'version-bump.cjs'], check=True)

# Release metadata.
path = 'README.md'
s = read(path).replace('wersja `10.78` — uzupełnij opis ostatniej poprawki po zakończeniu zmian.', 'wersja `10.78` — atomowa własność endpointu PUSH, lifecycle/generacja A→B, odrzucanie starych wiadomości w Service Workerze, retry cleanup po odzyskaniu sieci oraz uproszczony release bez Google Drive.')
write(path, s)

path = 'CHANGELOG.md'
s = read(path).replace('## 10.78\n- uzupełnij opis zmian dla wersji 10.78', '''## 10.78
- P0/F2: własność endpointu PUSH jest synchronizowana atomowo w PostgreSQL z advisory lock i blokadą aktywnego właściciela.
- P0/F3: każdy push ma odbiorcę i generację endpointu; Service Worker odrzuca wiadomości starego konta/generacji, a treść systemowa nie zawiera adresu ani danych klienta.
- P1/F4: logout unieważnia trwający sync, tworzy tombstone i spóźnione sync/disable nie mogą reaktywować ani wyłączyć endpointu nowego konta.
- P2/F9: pending cleanup ma trwałą kolejkę, backoff i retry przy loginie, online oraz healthcheck.
- P2/F10: dodano regresję 10.78 dla recipient/generation guard, durable retry oraz źródeł atomowego RPC; atomowy model DB został dodatkowo sprawdzony na produkcyjnym PostgreSQL w transakcji ROLLBACK.
- PUSH jest rejestrowany tylko w zainstalowanej aplikacji/PWA; zwykła przeglądarka nie tworzy nowych subskrypcji.
- Release: Google Drive i obowiązkowy ZIP usunięto z bramki; po merge blokuje wyłącznie zielony deployment Vercela, a live version/SW jest kontrolą pomocniczą.''')
write(path, s)

Path('release-notes.json').write_text(json.dumps({
  'version': '10.78',
  'summary': 'Bezpieczny lifecycle PUSH A→B i szybszy release bez zależności Google Drive.',
  'changes': [
    'Atomowy sync/disable endpointu z generacją własności i tombstone po logout.',
    'Service Worker pokazuje push tylko właściwemu użytkownikowi i właściwej generacji endpointu.',
    'Pending cleanup ponawia się po odzyskaniu sieci i healthchecku z backoffem.',
    'PUSH tylko w zainstalowanej aplikacji/PWA.',
    'GitHub jest źródłem archiwalnym; ZIP/Drive oraz osobna blokująca bramka post-deploy zostały usunięte.'
  ]
}, ensure_ascii=False, indent=2) + '\n')

# RELEASE-RESULT must match version before verify-release; CI overwrites content with real run.
path = 'RELEASE-RESULT.md'
s = read(path)
s = re.sub(r'(## Wersja\n- )\d+\.\d{2}', r'\g<1>10.78', s, count=1)
write(path, s)

gate = json.loads(read('RELEASE-GATE.json'))
gate['version'] = '10.78'
gate['scope'] = 'full'
gate['release_branch'] = 'release/v10.78'
gate.pop('drive_backup', None)
gate['archive'] = {
  'source_of_truth': 'github-main',
  'zip_optional': True,
  'blocking': False,
}
gate['main_protection'] = {
  'source_branch': 'release/v10.78',
  'ready_for_main': False,
  'required_check': 'WAWIS PR checks / targeted-checks',
  'final_release_run_id': '',
  'final_release_head_sha': '',
}
gate['postdeploy_diagnostics'] = {
  'evidence_required': False,
  'result': 'INFO_ONLY',
}
write('RELEASE-GATE.json', json.dumps(gate, ensure_ascii=False, indent=2) + '\n')

print('PATCH v10.78 applied')
