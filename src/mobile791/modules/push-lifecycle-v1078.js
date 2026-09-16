const PUSH_LOGOUT_PENDING_KEY = 'wawis_push_logout_pending_v1078';
const LEGACY_PUSH_LOGOUT_PENDING_KEY = 'wawis_push_logout_pending_v1076';
const PUSH_LIFECYCLE_KEY_PREFIX = 'wawis_push_lifecycle_v1078';
const MAX_PENDING_ITEMS = 8;
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 30 * 60 * 1000;
const PUSH_CONTEXT_ACK_TIMEOUT_MS = 700;
const PUSH_CONTEXT_REGISTRATION_TIMEOUT_MS = 900;
const PUSH_CONTEXT_PROTOCOL_VERSION = 2;

const volatileLifecycleTokens = new Map();
let pushSessionEpoch = 0;
let pushSessionUserId = '';
let pushSessionGeneration = 0;

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
  if (!worker?.postMessage) return null;
  if (typeof MessageChannel === 'undefined') {
    try { worker.postMessage(message); return { ok: true, applied: true, legacyNoAck: true }; }
    catch { return null; }
  }
  return withTimeout(new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data || null);
    try { worker.postMessage(message, [channel.port2]); }
    catch { resolve(null); }
  }), PUSH_CONTEXT_ACK_TIMEOUT_MS, null);
}

async function getPushWorkers() {
  const targets = [];
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) targets.push(navigator.serviceWorker.controller);
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return targets;
  try {
    const registration = await withTimeout(
      navigator.serviceWorker.getRegistration('/push-sw.js'), PUSH_CONTEXT_REGISTRATION_TIMEOUT_MS, null,
    );
    for (const worker of [registration?.active, registration?.waiting, registration?.installing]) {
      if (worker && !targets.includes(worker)) targets.push(worker);
    }
  } catch {}
  return targets;
}

async function postToWorkerAck(message) {
  const targets = await getPushWorkers();
  if (!targets.length) return null;
  const results = await Promise.allSettled(targets.map((worker) => postMessageWithAck(worker, message)));
  const acknowledgements = results
    .filter((result) => result.status === 'fulfilled' && result.value?.ok)
    .map((result) => result.value);
  if (!acknowledgements.length) return null;
  return acknowledgements.find((item) => item.applied !== false) || acknowledgements[0];
}

async function postToWorker(message) {
  const acknowledgement = await postToWorkerAck(message);
  return Boolean(acknowledgement?.ok && acknowledgement?.applied !== false);
}

export async function readPushServiceWorkerContext() {
  const acknowledgement = await postToWorkerAck({ type: 'WAWIS_PUSH_CONTEXT_GET', protocolVersion: PUSH_CONTEXT_PROTOCOL_VERSION });
  return acknowledgement?.context || null;
}

export async function setPushServiceWorkerContext({ userId, generation }) {
  const normalizedUserId = normalizeText(userId);
  const normalizedGeneration = Number(generation || 0);
  if (!normalizedUserId || !Number.isInteger(normalizedGeneration) || normalizedGeneration <= 0) return false;
  return postToWorker({
    type: 'WAWIS_PUSH_CONTEXT_SET',
    protocolVersion: PUSH_CONTEXT_PROTOCOL_VERSION,
    userId: normalizedUserId,
    generation: normalizedGeneration,
  });
}

export async function clearPushServiceWorkerContext({ expectedUserId = '', expectedGeneration = 0, terminal = true } = {}) {
  const normalizedExpectedUserId = normalizeText(expectedUserId);
  let normalizedExpectedGeneration = Math.max(0, Number(expectedGeneration) || 0);
  if (!normalizedExpectedUserId) return false;

  // Startup/reload reconciliation: when the page does not know the generation,
  // ask the durable SW before attempting a conditional CLEAR.
  if (normalizedExpectedGeneration <= 0) {
    const durableContext = await readPushServiceWorkerContext().catch(() => null);
    const durableUserId = normalizeText(durableContext?.userId);
    if (durableUserId && durableUserId !== normalizedExpectedUserId) return false;
    if (durableUserId === normalizedExpectedUserId) {
      normalizedExpectedGeneration = Math.max(0, Number(durableContext?.generation) || 0);
    }
  }

  return postToWorker({
    type: 'WAWIS_PUSH_CONTEXT_CLEAR',
    protocolVersion: PUSH_CONTEXT_PROTOCOL_VERSION,
    expectedUserId: normalizedExpectedUserId,
    expectedGeneration: normalizedExpectedGeneration,
    terminal: terminal !== false,
  });
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
    const previousUserId = pushSessionUserId;
    const previousGeneration = pushSessionGeneration;
    pushSessionEpoch += 1;
    pushSessionUserId = nextUserId;
    pushSessionGeneration = 0;
    // Do not clear on a fresh module restore ('' -> A). When leaving A, CLEAR is
    // conditional on A so a delayed old tab cannot erase B.
    if (previousUserId) {
      void Promise.resolve(clearWriter({
        expectedUserId: previousUserId,
        expectedGeneration: previousGeneration,
        terminal: true,
      })).catch(() => null);
    }
  }
  return capturePushSessionContext(sessionUser);
}

export async function publishPushServiceWorkerContext({ token, generation, writer = setPushServiceWorkerContext }) {
  if (!isPushSessionContextCurrent(token)) return false;
  const normalizedGeneration = Math.max(0, Number(generation) || 0);
  if (!Number.isInteger(normalizedGeneration) || normalizedGeneration <= 0) return false;
  const written = await writer({ userId: token.userId, generation: normalizedGeneration });
  if (!isPushSessionContextCurrent(token)) return false;
  if (written === false) return false;
  pushSessionGeneration = normalizedGeneration;
  return true;
}

export async function clearCurrentPushServiceWorkerContext({ token = null, writer = clearPushServiceWorkerContext } = {}) {
  if (token && !isPushSessionContextCurrent(token)) return false;
  const expectedUserId = normalizeText(token?.userId || pushSessionUserId);
  if (!expectedUserId) return false;
  const written = await writer({
    expectedUserId,
    expectedGeneration: pushSessionGeneration,
    terminal: false,
  });
  if (token && !isPushSessionContextCurrent(token)) return false;
  return written !== false;
}

export const PUSH_LIFECYCLE_TESTING = Object.freeze({
  PUSH_LOGOUT_PENDING_KEY, LEGACY_PUSH_LOGOUT_PENDING_KEY, RETRY_BASE_MS, RETRY_MAX_MS, normalizePendingItem,
  resetSessionContext() { pushSessionEpoch = 0; pushSessionUserId = ''; pushSessionGeneration = 0; },
  getSessionContext() { return { epoch: pushSessionEpoch, userId: pushSessionUserId, generation: pushSessionGeneration }; },
});
