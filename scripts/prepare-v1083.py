from pathlib import Path
import textwrap

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')

def replace_exact(path, old, new, expected=1):
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} occurrences, found {count}: {old[:160]!r}')
    write(path, text.replace(old, new))

push_context_guard = r'''(function attachWawisPushContextGuard(root) {
  function normalizeRevision(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function shouldApplyContextCommand(current = {}, incoming = {}) {
    const currentRevision = normalizeRevision(current.revision);
    const incomingRevision = normalizeRevision(incoming.revision);
    if (incomingRevision === 0) return currentRevision === 0;
    return incomingRevision > currentRevision;
  }

  root.WawisPushContextGuard = Object.freeze({
    normalizeRevision,
    shouldApplyContextCommand,
  });
})(typeof self !== 'undefined' ? self : globalThis);
'''
write('public/push-context-guard.js', push_context_guard)

lifecycle = r'''const PUSH_LOGOUT_PENDING_KEY = 'wawis_push_logout_pending_v1078';
const LEGACY_PUSH_LOGOUT_PENDING_KEY = 'wawis_push_logout_pending_v1076';
const PUSH_LIFECYCLE_KEY_PREFIX = 'wawis_push_lifecycle_v1078';
const MAX_PENDING_ITEMS = 8;
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 30 * 60 * 1000;
const PUSH_CONTEXT_ACK_TIMEOUT_MS = 700;
const PUSH_CONTEXT_REGISTRATION_TIMEOUT_MS = 900;

const volatileLifecycleTokens = new Map();
let pushSessionEpoch = 0;
let pushSessionUserId = '';
let pushContextRevision = 0;

function randomToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `v1078:${crypto.randomUUID()}`;
  }
  return `v1078:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSubscription(value) {
  const endpoint = normalizeText(value?.endpoint);
  const p256dh = normalizeText(value?.p256dh);
  const auth = normalizeText(value?.auth);
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

function lifecycleStorageKey(userId) {
  return `${PUSH_LIFECYCLE_KEY_PREFIX}:${normalizeText(userId)}`;
}

function nextPushContextRevision() {
  pushContextRevision = Math.max(0, Number(pushContextRevision) || 0) + 1;
  return pushContextRevision;
}

function withTimeout(promise, timeoutMs, fallback = null) {
  let timerId;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      timerId = setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timerId));
}

export function getOrCreatePushLifecycleToken(sessionUser) {
  const userId = normalizeText(sessionUser?.id);
  if (!userId) return '';
  if (volatileLifecycleTokens.has(userId)) return volatileLifecycleTokens.get(userId);
  if (typeof window !== 'undefined') {
    try {
      const stored = normalizeText(window.localStorage.getItem(lifecycleStorageKey(userId)));
      if (stored) {
        volatileLifecycleTokens.set(userId, stored);
        return stored;
      }
    } catch {}
  }
  const token = randomToken();
  volatileLifecycleTokens.set(userId, token);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(lifecycleStorageKey(userId), token); } catch {}
  }
  return token;
}

export function clearPushLifecycleToken(userId) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return;
  volatileLifecycleTokens.delete(normalizedUserId);
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(lifecycleStorageKey(normalizedUserId)); } catch {}
  }
}

function readJson(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeQueue(queue) {
  if (typeof window === 'undefined') return false;
  try {
    if (!queue.length) window.localStorage.removeItem(PUSH_LOGOUT_PENDING_KEY);
    else window.localStorage.setItem(PUSH_LOGOUT_PENDING_KEY, JSON.stringify(queue.slice(-MAX_PENDING_ITEMS)));
    return true;
  } catch { return false; }
}

function pendingId(subscription, lifecycleToken = '') {
  return `${subscription.endpoint}|${subscription.p256dh}|${subscription.auth}|${normalizeText(lifecycleToken)}`;
}

function normalizePendingItem(item, { legacy = false } = {}) {
  const subscription = normalizeSubscription(item?.subscription || item);
  if (!subscription) return null;
  const lifecycleToken = normalizeText(item?.lifecycleToken);
  const queuedAt = Number(item?.queuedAt || Date.now());
  const attempts = Math.max(0, Number(item?.attempts || 0));
  const nextRetryAt = Math.max(0, Number(item?.nextRetryAt || 0));
  return {
    id: pendingId(subscription, lifecycleToken),
    queuedAt: Number.isFinite(queuedAt) ? queuedAt : Date.now(),
    attempts: Number.isFinite(attempts) ? attempts : 0,
    nextRetryAt: Number.isFinite(nextRetryAt) ? nextRetryAt : 0,
    userId: normalizeText(item?.userId),
    lifecycleToken,
    legacy,
    subscription,
  };
}

export function readPendingPushDisables() {
  const result = [];
  const seen = new Set();
  const current = readJson(PUSH_LOGOUT_PENDING_KEY);
  const items = Array.isArray(current) ? current : current ? [current] : [];
  for (const item of items) {
    const normalized = normalizePendingItem(item);
    if (normalized && !seen.has(normalized.id)) {
      seen.add(normalized.id);
      result.push(normalized);
    }
  }
  const legacy = normalizePendingItem(readJson(LEGACY_PUSH_LOGOUT_PENDING_KEY), { legacy: true });
  if (legacy && !seen.has(legacy.id)) result.push(legacy);
  return result.sort((a, b) => a.queuedAt - b.queuedAt);
}

export function getDuePendingPushDisables({ force = false, now = Date.now() } = {}) {
  return readPendingPushDisables().filter((item) => force || !item.nextRetryAt || item.nextRetryAt <= now);
}

export function persistPendingPushDisable(payload, { sessionUser = null, lifecycleToken = '' } = {}) {
  const subscription = normalizeSubscription(payload);
  if (!subscription) return false;
  const token = normalizeText(lifecycleToken);
  const item = {
    id: pendingId(subscription, token), queuedAt: Date.now(), attempts: 0, nextRetryAt: 0,
    userId: normalizeText(sessionUser?.id), lifecycleToken: token, subscription,
  };
  const queue = readPendingPushDisables().filter((existing) => existing.id !== item.id && !existing.legacy);
  queue.push(item);
  return writeQueue(queue);
}

export function removePendingPushDisable(item) {
  if (!item) return;
  const id = normalizeText(item.id) || pendingId(item.subscription || {}, item.lifecycleToken || '');
  const queue = readPendingPushDisables().filter((existing) => !existing.legacy && existing.id !== id);
  writeQueue(queue);
  if (item.legacy && typeof window !== 'undefined') {
    try { window.localStorage.removeItem(LEGACY_PUSH_LOGOUT_PENDING_KEY); } catch {}
  }
}

export function markPendingPushDisableRetry(item) {
  if (!item || item.legacy) return;
  const queue = readPendingPushDisables().filter((existing) => !existing.legacy);
  const index = queue.findIndex((existing) => existing.id === item.id);
  if (index < 0) return;
  const attempts = Math.max(0, Number(queue[index].attempts || 0)) + 1;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.min(attempts - 1, 7)));
  queue[index] = { ...queue[index], attempts, nextRetryAt: Date.now() + delay };
  writeQueue(queue);
}

async function postMessageWithAck(worker, message) {
  if (!worker?.postMessage) return false;
  if (typeof MessageChannel === 'undefined') {
    try { worker.postMessage(message); return true; } catch { return false; }
  }
  return withTimeout(new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(Boolean(event.data?.ok));
    try { worker.postMessage(message, [channel.port2]); }
    catch { resolve(false); }
  }), PUSH_CONTEXT_ACK_TIMEOUT_MS, false);
}

async function postToWorker(message) {
  const targets = [];
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) targets.push(navigator.serviceWorker.controller);
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return false;
  try {
    const registration = await withTimeout(
      navigator.serviceWorker.getRegistration('/push-sw.js'), PUSH_CONTEXT_REGISTRATION_TIMEOUT_MS, null,
    );
    for (const worker of [registration?.active, registration?.waiting, registration?.installing]) {
      if (worker && !targets.includes(worker)) targets.push(worker);
    }
  } catch {}
  if (!targets.length) return false;
  const results = await Promise.allSettled(targets.map((worker) => postMessageWithAck(worker, message)));
  return results.some((result) => result.status === 'fulfilled' && result.value === true);
}

export async function setPushServiceWorkerContext({ userId, generation, contextRevision = 0 }) {
  const normalizedUserId = normalizeText(userId);
  const normalizedGeneration = Number(generation || 0);
  const revision = Number(contextRevision || 0) || nextPushContextRevision();
  if (!normalizedUserId || !Number.isInteger(normalizedGeneration) || normalizedGeneration <= 0) {
    return clearPushServiceWorkerContext({ contextRevision: revision });
  }
  return postToWorker({ type: 'WAWIS_PUSH_CONTEXT_SET', userId: normalizedUserId, generation: normalizedGeneration, revision });
}

export async function clearPushServiceWorkerContext({ contextRevision = 0 } = {}) {
  const revision = Number(contextRevision || 0) || nextPushContextRevision();
  return postToWorker({ type: 'WAWIS_PUSH_CONTEXT_CLEAR', revision });
}

export function capturePushSessionContext(sessionUser = null) {
  return { epoch: pushSessionEpoch, userId: normalizeText(sessionUser?.id || pushSessionUserId) };
}

export function isPushSessionContextCurrent(token) {
  return Boolean(token)
    && Number(token.epoch) === Number(pushSessionEpoch)
    && normalizeText(token.userId) === normalizeText(pushSessionUserId);
}

export function transitionPushSessionContext(sessionUser = null, { clearWriter = clearPushServiceWorkerContext } = {}) {
  const nextUserId = normalizeText(sessionUser?.id);
  if (nextUserId !== pushSessionUserId) {
    pushSessionEpoch += 1;
    pushSessionUserId = nextUserId;
    const revision = nextPushContextRevision();
    void Promise.resolve(clearWriter({ contextRevision: revision })).catch(() => null);
  }
  return capturePushSessionContext(sessionUser);
}

export async function publishPushServiceWorkerContext({ token, generation, writer = setPushServiceWorkerContext }) {
  if (!isPushSessionContextCurrent(token)) return false;
  const revision = nextPushContextRevision();
  const written = await writer({ userId: token.userId, generation, contextRevision: revision });
  if (!isPushSessionContextCurrent(token)) return false;
  return written !== false;
}

export async function clearCurrentPushServiceWorkerContext({ token = null, writer = clearPushServiceWorkerContext } = {}) {
  if (token && !isPushSessionContextCurrent(token)) return false;
  const revision = nextPushContextRevision();
  const written = await writer({ contextRevision: revision });
  if (token && !isPushSessionContextCurrent(token)) return false;
  return written !== false;
}

export const PUSH_LIFECYCLE_TESTING = Object.freeze({
  PUSH_LOGOUT_PENDING_KEY, LEGACY_PUSH_LOGOUT_PENDING_KEY, RETRY_BASE_MS, RETRY_MAX_MS, normalizePendingItem,
  resetSessionContext() { pushSessionEpoch = 0; pushSessionUserId = ''; pushContextRevision = 0; },
  getSessionContext() { return { epoch: pushSessionEpoch, userId: pushSessionUserId, revision: pushContextRevision }; },
});
'''
write('src/mobile791/modules/push-lifecycle-v1078.js', lifecycle)

sw = read('public/push-sw.js')
sw = sw.replace('importScripts("/push-safety.js");', 'importScripts("/push-safety.js");\nimportScripts("/push-context-guard.js");', 1)
sw = sw.replace('      cache.add("/push-safety.js"),', '      cache.add("/push-safety.js"),\n      cache.add("/push-context-guard.js"),', 1)
replace_old = '''async function writePushContext(value) {\n  const db = await openPushContextDb();\n  try {\n    await new Promise((resolve, reject) => {\n      const tx = db.transaction(PUSH_CONTEXT_STORE, "readwrite");\n      tx.objectStore(PUSH_CONTEXT_STORE).put(value, "active");\n      tx.oncomplete = resolve;\n      tx.onerror = () => reject(tx.error);\n      tx.onabort = () => reject(tx.error || new Error("push context transaction aborted"));\n    });\n  } finally { db.close(); }\n}\n'''
replace_new = '''async function writePushContext(value) {\n  const db = await openPushContextDb();\n  try {\n    return await new Promise((resolve, reject) => {\n      const tx = db.transaction(PUSH_CONTEXT_STORE, "readwrite");\n      const store = tx.objectStore(PUSH_CONTEXT_STORE);\n      const readRequest = store.get("active");\n      let applied = false;\n      let nextValue = null;\n      readRequest.onsuccess = () => {\n        const current = readRequest.result || { userId: "", generation: 0, revision: 0 };\n        const incoming = { userId: String(value?.userId || ""), generation: Number(value?.generation || 0), revision: Number(value?.revision || 0) };\n        if (self.WawisPushContextGuard?.shouldApplyContextCommand(current, incoming)) {\n          store.put(incoming, "active"); applied = true; nextValue = incoming;\n        } else { nextValue = current; }\n      };\n      readRequest.onerror = () => reject(readRequest.error);\n      tx.oncomplete = () => resolve({ applied, context: nextValue });\n      tx.onerror = () => reject(tx.error);\n      tx.onabort = () => reject(tx.error || new Error("push context transaction aborted"));\n    });\n  } finally { db.close(); }\n}\n'''
if replace_old not in sw: raise SystemExit('push-sw writePushContext block not found')
sw = sw.replace(replace_old, replace_new, 1)
old_message = '''self.addEventListener("message", (event) => {\n  if (event.data?.type === "WAWIS_PUSH_CONTEXT_SET") {\n    event.waitUntil(writePushContext({\n      userId: String(event.data.userId || ""),\n      generation: Number(event.data.generation || 0),\n    }));\n    return;\n  }\n  if (event.data?.type === "WAWIS_PUSH_CONTEXT_CLEAR") {\n    event.waitUntil(writePushContext({ userId: "", generation: 0 }));\n    return;\n  }\n'''
new_message = '''self.addEventListener("message", (event) => {\n  if (event.data?.type === "WAWIS_PUSH_CONTEXT_SET" || event.data?.type === "WAWIS_PUSH_CONTEXT_CLEAR") {\n    const value = event.data.type === "WAWIS_PUSH_CONTEXT_SET"\n      ? { userId: String(event.data.userId || ""), generation: Number(event.data.generation || 0), revision: Number(event.data.revision || 0) }\n      : { userId: "", generation: 0, revision: Number(event.data.revision || 0) };\n    event.waitUntil((async () => {\n      try {\n        const result = await writePushContext(value);\n        event.ports?.[0]?.postMessage({ ok: true, applied: Boolean(result?.applied), revision: Number(result?.context?.revision || 0) });\n      } catch (error) {\n        event.ports?.[0]?.postMessage({ ok: false, error: error?.message || String(error) });\n      }\n    })());\n    return;\n  }\n'''
if old_message not in sw: raise SystemExit('push-sw context message block not found')
sw = sw.replace(old_message, new_message, 1)
write('public/push-sw.js', sw)

push = 'src/mobile791/modules/push-subscriptions.js'
replace_exact(push, '''import {\n  clearPushLifecycleToken,\n  clearPushServiceWorkerContext,\n  getDuePendingPushDisables,\n  getOrCreatePushLifecycleToken,\n  markPendingPushDisableRetry,\n  persistPendingPushDisable,\n  readPendingPushDisables,\n  removePendingPushDisable,\n  setPushServiceWorkerContext,\n} from "./push-lifecycle-v1078.js";''', '''import {\n  capturePushSessionContext,\n  clearCurrentPushServiceWorkerContext,\n  clearPushLifecycleToken,\n  getDuePendingPushDisables,\n  getOrCreatePushLifecycleToken,\n  isPushSessionContextCurrent,\n  markPendingPushDisableRetry,\n  persistPendingPushDisable,\n  publishPushServiceWorkerContext,\n  readPendingPushDisables,\n  removePendingPushDisable,\n  transitionPushSessionContext,\n} from "./push-lifecycle-v1078.js";''')
replace_exact(push, 'const PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS = 900;', 'const PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS = 900;\nconst PUSH_LOCAL_STEP_TIMEOUT_MS = 900;')
replace_exact(push, '''function waitForPushLifecycle(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n''', '''function waitForPushLifecycle(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n\nexport function withPushLifecycleTimeout(promise, timeoutMs = PUSH_LOCAL_STEP_TIMEOUT_MS, label = 'push-lifecycle') {\n  let timerId;\n  const timeout = new Promise((_, reject) => {\n    timerId = setTimeout(() => {\n      const error = new Error(`Przekroczono limit czasu operacji PUSH: ${label}.`);\n      error.code = 'PUSH_LIFECYCLE_TIMEOUT';\n      reject(error);\n    }, Math.max(1, Number(timeoutMs) || PUSH_LOCAL_STEP_TIMEOUT_MS));\n  });\n  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timerId));\n}\n''')
old_existing = '''async function getExistingPushSubscription() {\n  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;\n  try {\n    const registration = typeof navigator.serviceWorker.getRegistration === "function"\n      ? await navigator.serviceWorker.getRegistration(PUSH_SW_PATH)\n      : null;\n    if (registration?.pushManager?.getSubscription) return await registration.pushManager.getSubscription();\n    const readyRegistration = navigator.serviceWorker.ready\n      ? await Promise.race([navigator.serviceWorker.ready, waitForPushLifecycle(400).then(() => null)])\n      : null;\n    return readyRegistration?.pushManager?.getSubscription ? await readyRegistration.pushManager.getSubscription() : null;\n  } catch { return null; }\n}\n'''
new_existing = '''async function getExistingPushSubscription() {\n  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;\n  try {\n    const registration = typeof navigator.serviceWorker.getRegistration === "function"\n      ? await withPushLifecycleTimeout(navigator.serviceWorker.getRegistration(PUSH_SW_PATH), PUSH_LOCAL_STEP_TIMEOUT_MS, 'service-worker-registration')\n      : null;\n    if (registration?.pushManager?.getSubscription) return await withPushLifecycleTimeout(registration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-subscription-read');\n    const readyRegistration = navigator.serviceWorker.ready\n      ? await withPushLifecycleTimeout(navigator.serviceWorker.ready, PUSH_LOCAL_STEP_TIMEOUT_MS, 'service-worker-ready').catch(() => null)\n      : null;\n    return readyRegistration?.pushManager?.getSubscription\n      ? await withPushLifecycleTimeout(readyRegistration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-subscription-ready-read').catch(() => null)\n      : null;\n  } catch { return null; }\n}\n'''
replace_exact(push, old_existing, new_existing)
replace_exact(push, '  return navigator.serviceWorker.register(PUSH_SW_PATH);', "  return withPushLifecycleTimeout(navigator.serviceWorker.register(PUSH_SW_PATH), PUSH_LOCAL_STEP_TIMEOUT_MS * 2, 'service-worker-register');")
replace_exact(push, '''export async function savePushSubscription({ supabase, sessionUser, subscription, force = false }) {\n  if (!supabase || !sessionUser || !subscription) return { saved: false, skipped: true, reason: "missing-data" };\n  if (pushLogoutInProgress) return { saved: false, skipped: true, reason: "logout-in-progress" };\n  const basePayload = getSubscriptionPayload(subscription);''', '''export async function savePushSubscription({ supabase, sessionUser, subscription, force = false }) {\n  if (!supabase || !sessionUser || !subscription) return { saved: false, skipped: true, reason: "missing-data" };\n  if (pushLogoutInProgress) return { saved: false, skipped: true, reason: "logout-in-progress" };\n  const sessionContextToken = capturePushSessionContext(sessionUser);\n  if (!isPushSessionContextCurrent(sessionContextToken)) return { saved: false, skipped: true, reason: "stale-session" };\n  const basePayload = getSubscriptionPayload(subscription);''')
replace_exact(push, '''    if (pushLogoutInProgress || epochAtStart !== pushLifecycleEpoch) {\n      return { saved: false, skipped: true, reason: "stale-lifecycle" };\n    }\n    const generation = Number(result?.subscription?.ownership_generation || 0);\n    if (generation > 0) {\n      await setPushServiceWorkerContext({ userId: sessionUser.id, generation });\n    }''', '''    if (pushLogoutInProgress || epochAtStart !== pushLifecycleEpoch || !isPushSessionContextCurrent(sessionContextToken)) {\n      return { saved: false, skipped: true, reason: "stale-lifecycle" };\n    }\n    const generation = Number(result?.subscription?.ownership_generation || 0);\n    if (generation > 0) {\n      const published = await publishPushServiceWorkerContext({ token: sessionContextToken, generation });\n      if (!published) return { saved: false, skipped: true, reason: "stale-session-context" };\n    }''')
replace_exact(push, '''export async function deactivatePushForLogout({ supabase }) {\n  pushLogoutInProgress = true;\n  pushLifecycleEpoch += 1;\n  pushSaveAbortControl?.abort?.();\n  await clearPushServiceWorkerContext().catch(() => null);\n\n  const { data: sessionData } = supabase ? await supabase.auth.getSession().catch(() => ({ data: null })) : { data: null };\n  const sessionUser = sessionData?.session?.user || null;''', '''export async function deactivatePushForLogout({ supabase, sessionUser: suppliedSessionUser = null }) {\n  pushLogoutInProgress = true;\n  pushLifecycleEpoch += 1;\n  pushSaveAbortControl?.abort?.();\n  transitionPushSessionContext(null);\n\n  let sessionUser = suppliedSessionUser || null;\n  if (!sessionUser && supabase) {\n    const sessionResult = await withPushLifecycleTimeout(supabase.auth.getSession(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'logout-auth-session').catch(() => ({ data: null }));\n    sessionUser = sessionResult?.data?.session?.user || null;\n  }''')
replace_exact(push, '''export async function reconcilePendingPushLogout({ supabase, sessionUser, force = false }) {\n  const pendingItems = getDuePendingPushDisables({ force });''', '''export async function reconcilePendingPushLogout({ supabase, sessionUser, force = false }) {\n  const sessionContextToken = capturePushSessionContext(sessionUser);\n  if (!isPushSessionContextCurrent(sessionContextToken)) {\n    return { reconciled: false, pending: readPendingPushDisables().length > 0, reason: "stale-session" };\n  }\n  const pendingItems = getDuePendingPushDisables({ force });''')
replace_exact(push, '''  const currentSubscription = await getExistingPushSubscription();\n  const currentPayload = getSubscriptionPayload(currentSubscription);''', '''  const currentSubscription = await getExistingPushSubscription();\n  if (!isPushSessionContextCurrent(sessionContextToken)) return { reconciled: false, pending: readPendingPushDisables().length > 0, reason: "stale-session" };\n  const currentPayload = getSubscriptionPayload(currentSubscription);''')
replace_exact(push, '''      const result = await invokePushFunction({ supabase, body, signal: requestControl.signal });\n      removePendingPushDisable(item);''', '''      const result = await invokePushFunction({ supabase, body, signal: requestControl.signal });\n      if (!isPushSessionContextCurrent(sessionContextToken)) return { reconciled: false, pending: true, cleaned, failed, reassigned: false, reason: "stale-session" };\n      removePendingPushDisable(item);''')
replace_exact(push, '''export async function getPushStatus({ supabase, sessionUser }) {\n  const diagnostics = getPushDiagnostics();''', '''function buildStalePushStatus(diagnostics) {\n  return { supported: Boolean(diagnostics?.supported), permission: diagnostics?.permission || "unsupported", subscribed: false, serverRegistered: false, serverActive: false, lastSeenAt: null, syncError: null, vapidConfigured: Boolean(diagnostics?.vapidConfigured), ready: false, diagnostics, staleSession: true };\n}\n\nexport async function getPushStatus({ supabase, sessionUser }) {\n  const diagnostics = getPushDiagnostics();\n  const sessionContextToken = capturePushSessionContext(sessionUser);\n  const isCurrentPushSession = () => isPushSessionContextCurrent(sessionContextToken);\n  if (!isCurrentPushSession()) return buildStalePushStatus(diagnostics);''')
replace_exact(push, '''  if (!diagnostics.supported) {\n    await clearPushServiceWorkerContext().catch(() => null);''', '''  if (!diagnostics.supported) {\n    await clearCurrentPushServiceWorkerContext({ token: sessionContextToken }).catch(() => null);''')
replace_exact(push, '''  let subscription = await getCurrentPushSubscription();\n  let serverRegistered = false;''', '''  let subscription = await getCurrentPushSubscription();\n  if (!isCurrentPushSession()) return buildStalePushStatus(diagnostics);\n  let serverRegistered = false;''')
replace_exact(push, '''      const { data: existingServerRow, error: existingServerError } = await supabase\n        .from("push_subscriptions")\n        .select("id, is_active, last_seen_at, ownership_generation")\n        .eq("user_id", sessionUser.id)\n        .eq("endpoint", subscription.endpoint)\n        .maybeSingle();\n\n      if (existingServerError) throw existingServerError;''', '''      const { data: existingServerRow, error: existingServerError } = await supabase\n        .from("push_subscriptions")\n        .select("id, is_active, last_seen_at, ownership_generation")\n        .eq("user_id", sessionUser.id)\n        .eq("endpoint", subscription.endpoint)\n        .maybeSingle();\n\n      if (!isCurrentPushSession()) return buildStalePushStatus(diagnostics);\n      if (existingServerError) throw existingServerError;''')
replace_exact(push, '''  if (serverActive && ownershipGeneration > 0) {\n    await setPushServiceWorkerContext({ userId: sessionUser?.id, generation: ownershipGeneration }).catch(() => null);\n  }''', '''  if (serverActive && ownershipGeneration > 0 && isCurrentPushSession()) {\n    await publishPushServiceWorkerContext({ token: sessionContextToken, generation: ownershipGeneration }).catch(() => false);\n  }\n  if (!isCurrentPushSession()) return buildStalePushStatus(diagnostics);''')
replace_exact(push, '''  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();\n  if (sessionError) throw sessionError;''', '''  const { data: sessionData, error: sessionError } = await withPushLifecycleTimeout(supabase.auth.getSession(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'edge-auth-session');\n  if (sessionError) throw sessionError;''')

mobile_session = 'src/mobile791/hooks/useAppSession.js'
replace_exact(mobile_session, 'import { captureSessionGeneration, createSessionGenerationState, isSessionGenerationCurrent, transitionSessionGeneration } from "../modules/session-generation.js";', 'import { captureSessionGeneration, createSessionGenerationState, isSessionGenerationCurrent, transitionSessionGeneration } from "../modules/session-generation.js";\nimport { transitionPushSessionContext } from "../modules/push-lifecycle-v1078.js";')
replace_exact(mobile_session, '''  const setSessionUserForGeneration = useCallback((nextUser) => {\n  const nextUserId = String(nextUser?.id || '').trim();''', '''  const setSessionUserForGeneration = useCallback((nextUser) => {\n  transitionPushSessionContext(nextUser);\n  const nextUserId = String(nextUser?.id || '').trim();''')
replace_exact(mobile_session, '''    await logoutUser({\n      supabase,\n      logoutFlagKey,\n      clearLocalState: applyLoggedOutState,\n    });''', '''    await logoutUser({\n      supabase,\n      logoutFlagKey,\n      sessionUser,\n      clearLocalState: applyLoggedOutState,\n    });''')

push_hook = 'src/mobile791/hooks/usePushNotificationsState.js'
replace_exact(push_hook, '  const lastSuccessfulSyncAtRef = useRef(0);', '  const lastSuccessfulSyncAtRef = useRef(0);\n  const syncEpochRef = useRef(0);')
replace_exact(push_hook, '''  async function syncPushState({ force = false } = {}) {\n    if (!sessionUser) return INITIAL_PUSH_STATE;\n    if (syncInFlightRef.current) return syncInFlightRef.current;\n\n    const pushModule = await loadPushModule();''', '''  async function syncPushState({ force = false } = {}) {\n    if (!sessionUser) return INITIAL_PUSH_STATE;\n    if (syncInFlightRef.current) return syncInFlightRef.current;\n    const syncEpoch = syncEpochRef.current;\n    const isCurrentSync = () => syncEpoch === syncEpochRef.current;\n\n    const pushModule = await loadPushModule();\n    if (!isCurrentSync()) return readStoredPushState(userId);''')
replace_exact(push_hook, '''    await pushModule.reconcilePendingPushLogout({ supabase, sessionUser, force }).catch((error) => {\n      console.warn("Nie udało się ponowić sprzątania starego PUSH:", error?.message || error);\n    });\n\n    if (!force''', '''    await pushModule.reconcilePendingPushLogout({ supabase, sessionUser, force }).catch((error) => {\n      console.warn("Nie udało się ponowić sprzątania starego PUSH:", error?.message || error);\n    });\n    if (!isCurrentSync()) return readStoredPushState(userId);\n\n    if (!force''')
replace_exact(push_hook, '''      const nextState = await pushModule.getPushStatus({ supabase, sessionUser });\n      setPushState(nextState);''', '''      const nextState = await pushModule.getPushStatus({ supabase, sessionUser });\n      if (!isCurrentSync() || nextState?.staleSession) return readStoredPushState(userId);\n      setPushState(nextState);''')
replace_exact(push_hook, '''  useEffect(() => {\n    if (!sessionUser) {''', '''  useEffect(() => {\n    syncEpochRef.current += 1;\n    if (!sessionUser) {''')
replace_exact(push_hook, '''    return () => {\n      window.removeEventListener("focus", handleVisible);''', '''    return () => {\n      syncEpochRef.current += 1;\n      window.removeEventListener("focus", handleVisible);''')

def patch_auth(path, mobile=False):
    replace_exact(path, '''function delay(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n''', '''function delay(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n\nlet authOperationEpoch = 0;\nfunction captureAuthOperation() { return authOperationEpoch; }\nfunction invalidateAuthOperations() { authOperationEpoch += 1; return authOperationEpoch; }\nfunction isAuthOperationCurrent(token) { return Number(token) === Number(authOperationEpoch); }\nexport const AUTH_OPERATION_TESTING = Object.freeze({ reset() { authOperationEpoch = 0; }, current() { return authOperationEpoch; } });\n''')
    replace_exact(path, '''  if (!supabase) return;\n\n  if (typeof window !== 'undefined' && sessionStorage.getItem(logoutFlagKey) === '1') {''', '''  if (!supabase) return;\n  const authOperationToken = captureAuthOperation();\n\n  if (typeof window !== 'undefined' && sessionStorage.getItem(logoutFlagKey) === '1') {''', expected=1)
    replace_exact(path, '''  let { data, error } = await supabase.auth.getSession();\n  const cachedSession = data?.session || null;''', '''  let { data, error } = await supabase.auth.getSession();\n  if (!isAuthOperationCurrent(authOperationToken)) return { restored: false, ignoredStaleAuth: true };\n  const cachedSession = data?.session || null;''')
    replace_exact(path, '''    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();\n    if (!refreshError && refreshedData?.session) {''', '''    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();\n    if (!isAuthOperationCurrent(authOperationToken)) return { restored: false, ignoredStaleAuth: true };\n    if (!refreshError && refreshedData?.session) {''', expected=1)
    if mobile:
        replace_exact(path, '''  const user = data.session?.user || null;\n  if (user) {\n    await reconcilePendingPushLogout({ supabase, sessionUser: user, force: true }).catch((pushError) => {\n      console.warn('Nie udało się dokończyć poprzedniego wylogowania PUSH:', pushError?.message || pushError);\n    });\n    if (typeof setSessionUser === 'function') setSessionUser(user);\n    setAuthResolved(true);''', '''  const user = data.session?.user || null;\n  if (user) {\n    if (!isAuthOperationCurrent(authOperationToken)) return { restored: false, ignoredStaleAuth: true };\n    if (typeof setSessionUser === 'function') setSessionUser(user);\n    setAuthResolved(true);\n    void reconcilePendingPushLogout({ supabase, sessionUser: user, force: true }).catch((pushError) => {\n      console.warn('Nie udało się dokończyć poprzedniego wylogowania PUSH:', pushError?.message || pushError);\n    });''')
    else:
        replace_exact(path, '''  const user = data?.session?.user || null;\n  if (user) {\n    if (typeof setSessionUser === 'function') setSessionUser(user);''', '''  const user = data?.session?.user || null;\n  if (user) {\n    if (!isAuthOperationCurrent(authOperationToken)) return { restored: false, ignoredStaleAuth: true };\n    if (typeof setSessionUser === 'function') setSessionUser(user);''')
    replace_exact(path, '''    signedOutVerificationInFlight = true;\n    try {\n      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();''', '''    signedOutVerificationInFlight = true;\n    const verificationToken = captureAuthOperation();\n    try {\n      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();\n      if (disposed || !isAuthOperationCurrent(verificationToken)) return;''')
    replace_exact(path, '''      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();\n      const refreshedUser = refreshedData?.session?.user || null;''', '''      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();\n      if (disposed || !isAuthOperationCurrent(verificationToken)) return;\n      const refreshedUser = refreshedData?.session?.user || null;''', expected=1)
    replace_exact(path, '''  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {\n    if (typeof window !== 'undefined' && sessionStorage.getItem(logoutFlagKey) === '1') {''', '''  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {\n    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') invalidateAuthOperations();\n    if (typeof window !== 'undefined' && sessionStorage.getItem(logoutFlagKey) === '1') {''')
    replace_exact(path, '''  return () => {\n    disposed = true;''', '''  return () => {\n    disposed = true;\n    invalidateAuthOperations();''')

patch_auth('src/mobile791/modules/auth.js', mobile=True)
patch_auth('src/modules/auth.js', mobile=False)
replace_exact('src/modules/auth.js', "      if (event === 'USER_UPDATED') {", "      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {")
replace_exact('src/mobile791/modules/auth.js', '''    await reconcilePendingPushLogout({ supabase, sessionUser: data.user, force: true }).catch((pushError) => {\n      console.warn('Nie udało się uzgodnić PUSH po zmianie konta:', pushError?.message || pushError);\n    });\n\n    setLoginForm({ email, password: '' });\n    setSessionUser(data.user || null);\n    setAuthResolved(true);''', '''    setLoginForm({ email, password: '' });\n    setSessionUser(data.user || null);\n    setAuthResolved(true);\n    void reconcilePendingPushLogout({ supabase, sessionUser: data.user, force: true }).catch((pushError) => {\n      console.warn('Nie udało się uzgodnić PUSH po zmianie konta:', pushError?.message || pushError);\n    });''')
replace_exact('src/mobile791/modules/auth.js', '''export async function logoutUser({\n  supabase,\n  logoutFlagKey,\n  clearLocalState,\n}) {''', '''export async function logoutUser({\n  supabase,\n  logoutFlagKey,\n  sessionUser = null,\n  clearLocalState,\n}) {''')
replace_exact('src/mobile791/modules/auth.js', '  await deactivatePushForLogout({ supabase }).catch((pushError) => {', '  await deactivatePushForLogout({ supabase, sessionUser }).catch((pushError) => {')

fuel = 'supabase/functions/send-fuel-entry-push/index.ts'
replace_exact(fuel, '.select("id, user_id, endpoint, p256dh, auth")', '.select("id, user_id, endpoint, p256dh, auth, ownership_generation")')
old_payload = '''    const payload = JSON.stringify({\n      type: "fuel_entry_created",\n      jobId: null,\n      title: "Zatankowano samochód",\n      body: `${employee} • ${vehicleLabel} • ${litersLabel} • licznik ${odometerLabel}`,\n      url: "/",\n      tag: `fuel-entry-${entry.id}`,\n    });\n\n    const results = await Promise.all(subscriptions.map(async (subscription: any) => {\n      try {'''
new_payload = '''    const results = await Promise.all(subscriptions.map(async (subscription: any) => {\n      const payload = JSON.stringify({\n        type: "fuel_entry_created",\n        jobId: null,\n        title: "Nowe tankowanie",\n        body: "Dodano nowe tankowanie. Otwórz aplikację Wawis, aby zobaczyć szczegóły.",\n        url: "/",\n        tag: `fuel-entry-${entry.id}`,\n        recipientUserId: String(subscription.user_id || ""),\n        subscriptionGeneration: Number(subscription.ownership_generation || 0),\n      });\n      try {'''
replace_exact(fuel, old_payload, new_payload)
replace_exact(fuel, '''        if (statusCode === 404 || statusCode === 410) {\n          await adminClient.from("push_subscriptions").update({ is_active: false }).eq("id", subscription.id);\n        }''', '''        if (statusCode === 404 || statusCode === 410) {\n          await adminClient.from("push_subscriptions").update({ is_active: false })\n            .eq("id", subscription.id)\n            .eq("user_id", subscription.user_id)\n            .eq("ownership_generation", subscription.ownership_generation)\n            .eq("is_active", true);\n        }''')

migration = r'''-- WAWIS 10.83 — trwała historia unieważnionych lifecycle PUSH.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.push_subscription_lifecycle_tombstones (
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_id uuid not null,
  lifecycle_token text not null,
  invalidated_at timestamptz not null default now(),
  primary key (endpoint, p256dh, auth, user_id, lifecycle_token),
  constraint push_subscription_lifecycle_token_length check (length(lifecycle_token) between 1 and 200)
);
alter table private.push_subscription_lifecycle_tombstones enable row level security;
revoke all on table private.push_subscription_lifecycle_tombstones from public, anon, authenticated;
create index if not exists push_subscription_lifecycle_tombstones_endpoint_idx
  on private.push_subscription_lifecycle_tombstones (endpoint, invalidated_at desc);

create or replace function public.push_subscription_sync_atomic(
  p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_lifecycle_token text,
  p_user_agent text default null, p_device_label text default null
)
returns table (subscription_id uuid, owner_user_id uuid, is_active boolean, last_seen_at timestamptz, ownership_generation bigint, reassigned boolean, reason text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_row public.push_subscriptions%rowtype;
  v_now timestamptz := now();
  v_reassigned boolean := false;
begin
  if p_user_id is null or nullif(btrim(coalesce(p_endpoint, '')), '') is null
     or nullif(btrim(coalesce(p_p256dh, '')), '') is null or nullif(btrim(coalesce(p_auth, '')), '') is null
     or nullif(btrim(coalesce(p_lifecycle_token, '')), '') is null then
    raise exception 'push_invalid_subscription' using errcode = '22023';
  end if;
  if length(p_lifecycle_token) > 200 then raise exception 'push_invalid_lifecycle_token' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_endpoint, 0));
  if exists (
    select 1 from private.push_subscription_lifecycle_tombstones t
    where t.endpoint = p_endpoint and t.p256dh = p_p256dh and t.auth = p_auth
      and t.user_id = p_user_id and t.lifecycle_token = p_lifecycle_token
  ) then raise exception 'push_lifecycle_disabled' using errcode = 'P0001'; end if;
  select ps.* into v_row from public.push_subscriptions ps where ps.endpoint = p_endpoint for update;
  if not found then
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, device_label, is_active, lifecycle_token, ownership_generation, created_at, updated_at, last_seen_at)
    values (p_user_id, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''),1200), left(coalesce(p_device_label,'Urządzenie'),240), true, p_lifecycle_token, 1, v_now, v_now, v_now)
    returning * into v_row;
    return query select v_row.id,v_row.user_id,v_row.is_active,v_row.last_seen_at,v_row.ownership_generation,false,'created'::text; return;
  end if;
  if v_row.p256dh <> p_p256dh or v_row.auth <> p_auth then raise exception 'push_credentials_mismatch' using errcode='P0001'; end if;
  if v_row.is_active then
    if v_row.user_id=p_user_id and v_row.lifecycle_token=p_lifecycle_token then
      update public.push_subscriptions set user_agent=left(coalesce(p_user_agent,''),1200), device_label=left(coalesce(p_device_label,'Urządzenie'),240), last_seen_at=v_now, updated_at=v_now where id=v_row.id returning * into v_row;
      return query select v_row.id,v_row.user_id,v_row.is_active,v_row.last_seen_at,v_row.ownership_generation,false,'refreshed'::text; return;
    end if;
    if v_row.user_id=p_user_id and v_row.lifecycle_token like 'legacy:%' and p_lifecycle_token not like 'legacy:%' then
      update public.push_subscriptions set lifecycle_token=p_lifecycle_token, ownership_generation=v_row.ownership_generation+1, user_agent=left(coalesce(p_user_agent,''),1200), device_label=left(coalesce(p_device_label,'Urządzenie'),240), last_seen_at=v_now, updated_at=v_now where id=v_row.id returning * into v_row;
      return query select v_row.id,v_row.user_id,v_row.is_active,v_row.last_seen_at,v_row.ownership_generation,false,'upgraded-legacy'::text; return;
    end if;
    raise exception 'push_owner_active' using errcode='P0001';
  end if;
  if v_row.user_id=p_user_id and v_row.lifecycle_token=p_lifecycle_token then raise exception 'push_lifecycle_disabled' using errcode='P0001'; end if;
  v_reassigned := v_row.user_id <> p_user_id;
  update public.push_subscriptions set user_id=p_user_id,lifecycle_token=p_lifecycle_token,ownership_generation=v_row.ownership_generation+1,user_agent=left(coalesce(p_user_agent,''),1200),device_label=left(coalesce(p_device_label,'Urządzenie'),240),is_active=true,last_seen_at=v_now,updated_at=v_now where id=v_row.id returning * into v_row;
  return query select v_row.id,v_row.user_id,v_row.is_active,v_row.last_seen_at,v_row.ownership_generation,v_reassigned,'claimed-inactive'::text;
end;$$;

create or replace function public.push_subscription_disable_atomic(
  p_request_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_lifecycle_token text default '',
  p_allow_foreign_cleanup boolean default false, p_allow_legacy_cleanup boolean default false
)
returns table (subscription_id uuid, disabled boolean, ownership_generation bigint, reason text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_row public.push_subscriptions%rowtype;
  v_now timestamptz := now();
  v_token text := btrim(coalesce(p_lifecycle_token,''));
begin
  if p_request_user_id is null or nullif(btrim(coalesce(p_endpoint,'')),'') is null or nullif(btrim(coalesce(p_p256dh,'')),'') is null or nullif(btrim(coalesce(p_auth,'')),'') is null then raise exception 'push_invalid_subscription' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_endpoint,0));
  select ps.* into v_row from public.push_subscriptions ps where ps.endpoint=p_endpoint for update;
  if not found then
    if v_token <> '' then
      insert into private.push_subscription_lifecycle_tombstones(endpoint,p256dh,auth,user_id,lifecycle_token,invalidated_at) values(p_endpoint,p_p256dh,p_auth,p_request_user_id,v_token,v_now) on conflict do nothing;
      insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,is_active,lifecycle_token,ownership_generation,created_at,updated_at,last_seen_at) values(p_request_user_id,p_endpoint,p_p256dh,p_auth,false,v_token,1,v_now,v_now,v_now) returning * into v_row;
      return query select v_row.id,true,v_row.ownership_generation,'tombstone-created'::text; return;
    end if;
    return query select null::uuid,false,0::bigint,'not-found'::text; return;
  end if;
  if v_row.p256dh<>p_p256dh or v_row.auth<>p_auth then raise exception 'push_credentials_mismatch' using errcode='P0001'; end if;
  if v_token='' then
    if not (p_allow_legacy_cleanup and v_row.lifecycle_token like 'legacy:%') then return query select v_row.id,false,v_row.ownership_generation,'stale-lifecycle'::text; return; end if;
  elsif v_row.lifecycle_token<>v_token then return query select v_row.id,false,v_row.ownership_generation,'stale-lifecycle'::text; return;
  end if;
  if v_row.user_id<>p_request_user_id and not p_allow_foreign_cleanup then return query select v_row.id,false,v_row.ownership_generation,'owner-mismatch'::text; return; end if;
  if v_token<>'' then insert into private.push_subscription_lifecycle_tombstones(endpoint,p256dh,auth,user_id,lifecycle_token,invalidated_at) values(p_endpoint,p_p256dh,p_auth,v_row.user_id,v_token,v_now) on conflict do nothing; end if;
  if not v_row.is_active then return query select v_row.id,false,v_row.ownership_generation,'already-disabled'::text; return; end if;
  update public.push_subscriptions set is_active=false, ownership_generation=v_row.ownership_generation+1, updated_at=v_now where id=v_row.id returning * into v_row;
  return query select v_row.id,true,v_row.ownership_generation,'disabled'::text;
end;$$;
revoke all on function public.push_subscription_sync_atomic(uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.push_subscription_disable_atomic(uuid,text,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.push_subscription_sync_atomic(uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.push_subscription_disable_atomic(uuid,text,text,text,text,boolean,boolean) to service_role;
'''
write('supabase/migrations/20260916115000_push_lifecycle_history_v1083.sql', migration)

pr_runner = r'''const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const impactPath = process.argv[2] || 'release-impact.json';
if (!fs.existsSync(impactPath)) throw new Error(`Brak ${impactPath}`);
const impact = JSON.parse(fs.readFileSync(impactPath, 'utf8'));
if (!impact?.needs_playwright) { console.log('Playwright pominięty zgodnie z klasyfikacją ryzyka.'); process.exit(0); }
const e2e = Array.isArray(impact.e2e) ? impact.e2e : [];
if (!e2e.length) throw new Error('needs_playwright=true bez wskazanego zakresu E2E.');
for (const platform of e2e) {
  const script = platform === 'mobile' ? 'scripts/run-playwright-mobile.cjs' : platform === 'desktop' ? 'scripts/run-playwright-desktop.cjs' : null;
  if (!script) throw new Error(`Nieobsługiwany zakres E2E: ${platform}`);
  console.log(`Uruchamiam wymagane E2E: ${platform}`);
  execFileSync(process.execPath, [script, '--reporter=line'], { stdio: 'inherit', env: process.env });
}
'''
write('scripts/run-pr-playwright.cjs', pr_runner)

pr_workflow = '''name: WAWIS PR checks

on:
  pull_request:
    branches: [main]

concurrency:
  group: wawis-pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  targeted-checks:
    runs-on: ubuntu-latest
    timeout-minutes: 35
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - name: Install dependencies
        run: npm ci --include=optional --registry=https://registry.npmjs.org/
      - name: Detect changed files
        shell: bash
        run: |
          git fetch origin "${{ github.base_ref }}"
          git diff --name-only "origin/${{ github.base_ref }}...HEAD" > changed-files.txt
          cat changed-files.txt
      - name: Classify effective release impact
        id: impact
        shell: bash
        run: node scripts/release-impact.cjs --base-ref "origin/${{ github.base_ref }}" --json release-impact.json --github-output "$GITHUB_OUTPUT"
      - name: Run targeted regression groups
        run: node scripts/run-pr-checks.cjs changed-files.txt release-impact.json
      - name: Install Playwright Chromium when required
        if: steps.impact.outputs.needs_playwright == 'true'
        run: npx playwright install --with-deps chromium
      - name: Run required Playwright E2E
        if: steps.impact.outputs.needs_playwright == 'true'
        run: node scripts/run-pr-playwright.cjs release-impact.json
'''
write('.github/workflows/pr-checks.yml', pr_workflow)

smoke = r'''import assert from 'node:assert/strict';
import fs from 'node:fs';

async function authRace(modulePath, label) {
  const auth = await import(`${modulePath}?v1083=${Date.now()}-${Math.random()}`);
  auth.AUTH_OPERATION_TESTING.reset();
  let authHandler = null;
  let resolveSession;
  const appliedUsers = [];
  const refreshUsers = [];
  const getSessionPromise = new Promise((resolve) => { resolveSession = resolve; });
  const supabase = { auth: {
    getSession: () => getSessionPromise,
    refreshSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange(handler) { authHandler = handler; return { data: { subscription: { unsubscribe() {} } } }; },
  } };
  const common = {
    supabase, logoutFlagKey: `v1083-${label}`,
    applyLoggedOutState() { appliedUsers.push('LOGGED_OUT'); },
    setSessionUser(user) { appliedUsers.push(user?.id || ''); },
    setErrorMsg() {}, setAuthResolved() {},
    refreshAll: async (user) => { refreshUsers.push(user?.id || ''); return { ok: true }; },
  };
  const restorePromise = auth.restoreAuthSession(common);
  const unsubscribe = auth.subscribeToAuthState(common);
  assert.equal(typeof authHandler, 'function');
  authHandler('SIGNED_IN', { user: { id: 'B' } });
  resolveSession({ data: { session: { user: { id: 'A' } } }, error: null });
  const result = await restorePromise;
  await Promise.resolve();
  unsubscribe();
  assert.equal(result?.ignoredStaleAuth, true, `${label}: stale restore not rejected`);
  assert.deepEqual(appliedUsers, ['B'], `${label}: A modified state after B`);
  assert(refreshUsers.includes('B'));
  assert(!refreshUsers.includes('A'));
}
await authRace('../src/mobile791/modules/auth.js', 'mobile');
await authRace('../src/modules/auth.js', 'desktop');

const lifecycle = await import('../src/mobile791/modules/push-lifecycle-v1078.js');
lifecycle.PUSH_LIFECYCLE_TESTING.resetSessionContext();
const writes = [];
const clearWriter = async (payload) => { writes.push({ kind: 'clear', ...payload }); return true; };
const tokenA = lifecycle.transitionPushSessionContext({ id: 'A' }, { clearWriter });
const tokenB = lifecycle.transitionPushSessionContext({ id: 'B' }, { clearWriter });
const stalePublished = await lifecycle.publishPushServiceWorkerContext({ token: tokenA, generation: 1, writer: async (payload) => { writes.push({ kind: 'set-stale', ...payload }); return true; } });
const currentPublished = await lifecycle.publishPushServiceWorkerContext({ token: tokenB, generation: 7, writer: async (payload) => { writes.push({ kind: 'set-current', ...payload }); return true; } });
assert.equal(stalePublished, false);
assert.equal(currentPublished, true);
assert.equal(writes.some((item) => item.kind === 'set-stale'), false);

const { withPushLifecycleTimeout } = await import('../src/mobile791/modules/push-subscriptions.js');
await assert.rejects(withPushLifecycleTimeout(new Promise(() => {}), 25, 'never-finishes'), (error) => error?.code === 'PUSH_LIFECYCLE_TIMEOUT');

const fuel = fs.readFileSync('supabase/functions/send-fuel-entry-push/index.ts', 'utf8');
assert.match(fuel, /recipientUserId/);
assert.match(fuel, /subscriptionGeneration/);
assert.match(fuel, /ownership_generation/);
assert.match(fuel, /\.eq\("ownership_generation", subscription\.ownership_generation\)/);
const sql = fs.readFileSync('supabase/migrations/20260916115000_push_lifecycle_history_v1083.sql', 'utf8');
assert.match(sql, /private\.push_subscription_lifecycle_tombstones/);
const workflow = fs.readFileSync('.github/workflows/pr-checks.yml', 'utf8');
assert.match(workflow, /id: impact/);
assert.match(workflow, /playwright install --with-deps chromium/);
assert.match(workflow, /run-pr-playwright\.cjs release-impact\.json/);
console.log('PASS v10.83 session/push/E2E gate regression.');
'''
write('scripts/smoke-session-push-gate-v1083.mjs', smoke)

e2e = r'''import { expect, test } from '@playwright/test';

async function runAuthRace(page, modulePath) {
  return page.evaluate(async (path) => {
    const auth = await import(`${path}?v1083=${Date.now()}-${Math.random()}`);
    auth.AUTH_OPERATION_TESTING.reset();
    let handler = null;
    let resolveSession;
    const users = [];
    const refreshes = [];
    const pending = new Promise((resolve) => { resolveSession = resolve; });
    const supabase = { auth: {
      getSession: () => pending,
      refreshSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange(callback) { handler = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    } };
    const args = { supabase, logoutFlagKey: `e2e-v1083-${Math.random()}`, applyLoggedOutState() { users.push('LOGGED_OUT'); }, setSessionUser(user) { users.push(user?.id || ''); }, setErrorMsg() {}, setAuthResolved() {}, refreshAll: async (user) => { refreshes.push(user?.id || ''); return { ok: true }; } };
    const restoring = auth.restoreAuthSession(args);
    const unsubscribe = auth.subscribeToAuthState(args);
    handler('SIGNED_IN', { user: { id: 'B' } });
    resolveSession({ data: { session: { user: { id: 'A' } } }, error: null });
    const result = await restoring;
    await Promise.resolve();
    unsubscribe();
    return { users, refreshes, result };
  }, modulePath);
}

test('mobile @mobile — stale restore A is rejected after B', async ({ page }) => {
  await page.goto('/');
  const result = await runAuthRace(page, '/src/mobile791/modules/auth.js');
  expect(result.result.ignoredStaleAuth).toBe(true);
  expect(result.users).toEqual(['B']);
  expect(result.refreshes).toContain('B');
  expect(result.refreshes).not.toContain('A');
});

test('mobile @mobile — stale push token A cannot publish after B', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const lifecycle = await import(`/src/mobile791/modules/push-lifecycle-v1078.js?v1083=${Date.now()}`);
    lifecycle.PUSH_LIFECYCLE_TESTING.resetSessionContext();
    const writes = [];
    const clearWriter = async (payload) => { writes.push({ kind: 'clear', ...payload }); return true; };
    const tokenA = lifecycle.transitionPushSessionContext({ id: 'A' }, { clearWriter });
    const tokenB = lifecycle.transitionPushSessionContext({ id: 'B' }, { clearWriter });
    const stale = await lifecycle.publishPushServiceWorkerContext({ token: tokenA, generation: 2, writer: async (payload) => { writes.push({ kind: 'stale', ...payload }); return true; } });
    const current = await lifecycle.publishPushServiceWorkerContext({ token: tokenB, generation: 9, writer: async (payload) => { writes.push({ kind: 'current', ...payload }); return true; } });
    return { stale, current, writes };
  });
  expect(result.stale).toBe(false);
  expect(result.current).toBe(true);
  expect(result.writes.some((item) => item.kind === 'stale')).toBe(false);
});

test('desktop — stale restore A is rejected after B', async ({ page }) => {
  await page.goto('/');
  const result = await runAuthRace(page, '/src/modules/auth.js');
  expect(result.result.ignoredStaleAuth).toBe(true);
  expect(result.users).toEqual(['B']);
  expect(result.refreshes).toContain('B');
  expect(result.refreshes).not.toContain('A');
});
'''
write('tests/e2e/session-push-isolation-v1083.spec.js', e2e)

test_groups = read('scripts/test-groups.cjs')
test_groups = test_groups.replace("    'npm run test:smoke:push-mandatory',", "    'npm run test:smoke:push-mandatory',\n    'node scripts/smoke-session-push-gate-v1083.mjs',", 1)
test_groups = test_groups.replace("    'npm run test:smoke:no-services-module',", "    'npm run test:smoke:no-services-module',\n    'node scripts/smoke-session-push-gate-v1083.mjs',", 1)
write('scripts/test-groups.cjs', test_groups)

print('v10.83 implementation applied')
