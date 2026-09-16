const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, 'utf8');

function replaceOne(file, search, replacement, label) {
  const source = read(file);
  const count = typeof search === 'string'
    ? source.split(search).length - 1
    : [...source.matchAll(new RegExp(search.source, search.flags.includes('g') ? search.flags : `${search.flags}g`))].length;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${file}, got ${count}`);
  write(file, source.replace(search, replacement));
}

function replaceAllChecked(file, search, replacement, minCount, label) {
  const source = read(file);
  const regex = search instanceof RegExp ? new RegExp(search.source, search.flags.includes('g') ? search.flags : `${search.flags}g`) : null;
  const count = regex ? [...source.matchAll(regex)].length : source.split(search).length - 1;
  if (count < minCount) throw new Error(`${label}: expected at least ${minCount} matches in ${file}, got ${count}`);
  write(file, regex ? source.replace(regex, replacement) : source.split(search).join(replacement));
}

// F4: durable Service Worker ordering is based on backend ownership_generation,
// not on a page-local revision counter that resets after reload.
write('public/push-context-guard.js', `(function attachWawisPushContextGuard(root) {
  const PROTOCOL_VERSION = 2;

  function normalizeRevision(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function normalizeGeneration(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function normalizeProtocolVersion(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 1 ? number : 1;
  }

  // Kept only for mixed 10.86/10.87 SW-page compatibility. New protocol commands
  // never use a page-local revision as their source of truth.
  function shouldApplyContextCommand(current = {}, incoming = {}) {
    const currentRevision = normalizeRevision(current.revision);
    const incomingRevision = normalizeRevision(incoming.revision);
    if (incomingRevision === 0) return currentRevision === 0;
    return incomingRevision > currentRevision;
  }

  function shouldApplySet(current = {}, incoming = {}) {
    const incomingUserId = String(incoming.userId || '').trim();
    const incomingGeneration = normalizeGeneration(incoming.generation);
    if (!incomingUserId || incomingGeneration <= 0) return false;

    const currentProtocol = normalizeProtocolVersion(current.protocolVersion);
    const incomingProtocol = normalizeProtocolVersion(incoming.protocolVersion);
    if (incomingProtocol < PROTOCOL_VERSION) {
      if (currentProtocol >= PROTOCOL_VERSION) return false;
      return shouldApplyContextCommand(current, incoming);
    }
    if (currentProtocol < PROTOCOL_VERSION) return true;

    const currentUserId = String(current.userId || '').trim();
    const currentGeneration = normalizeGeneration(current.generation);
    if (incomingGeneration > currentGeneration) return true;
    if (incomingGeneration < currentGeneration) return false;
    if (currentUserId) return currentUserId === incomingUserId;

    // A terminal CLEAR keeps a generation floor so a late SET from the old
    // session cannot resurrect it before the next owner claims generation+1.
    return current.terminalClear === false
      && String(current.clearedUserId || '').trim() === incomingUserId;
  }

  function shouldApplyClear(current = {}, incoming = {}) {
    const currentProtocol = normalizeProtocolVersion(current.protocolVersion);
    const incomingProtocol = normalizeProtocolVersion(incoming.protocolVersion);
    if (incomingProtocol < PROTOCOL_VERSION) {
      if (currentProtocol >= PROTOCOL_VERSION) return false;
      return shouldApplyContextCommand(current, incoming);
    }

    const currentUserId = String(current.userId || '').trim();
    const currentGeneration = normalizeGeneration(current.generation);
    const expectedUserId = String(incoming.expectedUserId || '').trim();
    const expectedGeneration = normalizeGeneration(incoming.expectedGeneration);
    if (!currentUserId) return false;
    if (!expectedUserId || currentUserId !== expectedUserId) return false;
    if (expectedGeneration > 0 && currentGeneration !== expectedGeneration) return false;
    return true;
  }

  root.WawisPushContextGuard = Object.freeze({
    PROTOCOL_VERSION,
    normalizeRevision,
    normalizeGeneration,
    normalizeProtocolVersion,
    shouldApplyContextCommand,
    shouldApplySet,
    shouldApplyClear,
  });
})(typeof self !== 'undefined' ? self : globalThis);
`);

replaceOne(
  'src/mobile791/modules/push-lifecycle-v1078.js',
  "const PUSH_CONTEXT_REGISTRATION_TIMEOUT_MS = 900;\n",
  "const PUSH_CONTEXT_REGISTRATION_TIMEOUT_MS = 900;\nconst PUSH_CONTEXT_PROTOCOL_VERSION = 2;\n",
  'F4 protocol constant',
);
replaceOne(
  'src/mobile791/modules/push-lifecycle-v1078.js',
  "let pushSessionEpoch = 0;\nlet pushSessionUserId = '';\nlet pushContextRevision = 0;\n",
  "let pushSessionEpoch = 0;\nlet pushSessionUserId = '';\nlet pushSessionGeneration = 0;\n",
  'F4 remove local revision',
);
replaceOne(
  'src/mobile791/modules/push-lifecycle-v1078.js',
  /function nextPushContextRevision\(\) \{[\s\S]*?\n\}\n\n/,
  '',
  'F4 remove revision allocator',
);
replaceOne(
  'src/mobile791/modules/push-lifecycle-v1078.js',
  /async function postMessageWithAck\(worker, message\) \{[\s\S]*?\n\}\n\nexport function capturePushSessionContext/,
`async function postMessageWithAck(worker, message) {
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

export function capturePushSessionContext`,
  'F4 SW handshake section',
);
replaceOne(
  'src/mobile791/modules/push-lifecycle-v1078.js',
  /export function transitionPushSessionContext\(sessionUser = null, \{ clearWriter = clearPushServiceWorkerContext \} = \{\}\) \{[\s\S]*?\n\}\n\nexport async function publishPushServiceWorkerContext[\s\S]*?\n\}\n\nexport async function clearCurrentPushServiceWorkerContext[\s\S]*?\n\}\n/,
`export function transitionPushSessionContext(sessionUser = null, { clearWriter = clearPushServiceWorkerContext } = {}) {
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
`,
  'F4 transition/publish/clear',
);
replaceOne(
  'src/mobile791/modules/push-lifecycle-v1078.js',
  "  resetSessionContext() { pushSessionEpoch = 0; pushSessionUserId = ''; pushContextRevision = 0; },\n  getSessionContext() { return { epoch: pushSessionEpoch, userId: pushSessionUserId, revision: pushContextRevision }; },\n",
  "  resetSessionContext() { pushSessionEpoch = 0; pushSessionUserId = ''; pushSessionGeneration = 0; },\n  getSessionContext() { return { epoch: pushSessionEpoch, userId: pushSessionUserId, generation: pushSessionGeneration }; },\n",
  'F4 test state',
);

replaceOne(
  'public/push-sw.js',
  /async function writePushContext\(value\) \{[\s\S]*?\n\}\n\nasync function readPushContext/,
`async function writePushContextCommand(command) {
  const db = await openPushContextDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PUSH_CONTEXT_STORE, "readwrite");
      const store = tx.objectStore(PUSH_CONTEXT_STORE);
      const readRequest = store.get("active");
      let applied = false;
      let nextValue = null;
      readRequest.onsuccess = () => {
        const current = readRequest.result || { userId: "", generation: 0, revision: 0, protocolVersion: 1 };
        if (command?.type === "WAWIS_PUSH_CONTEXT_SET") {
          const incoming = {
            userId: String(command.userId || ""),
            generation: Number(command.generation || 0),
            revision: Number(command.revision || 0),
            protocolVersion: Number(command.protocolVersion || 1),
          };
          if (self.WawisPushContextGuard?.shouldApplySet(current, incoming)) {
            nextValue = { ...incoming, terminalClear: false, clearedUserId: "" };
            store.put(nextValue, "active");
            applied = true;
          } else nextValue = current;
        } else if (command?.type === "WAWIS_PUSH_CONTEXT_CLEAR") {
          const incoming = {
            expectedUserId: String(command.expectedUserId || ""),
            expectedGeneration: Number(command.expectedGeneration || 0),
            revision: Number(command.revision || 0),
            protocolVersion: Number(command.protocolVersion || 1),
            terminal: command.terminal !== false,
          };
          if (self.WawisPushContextGuard?.shouldApplyClear(current, incoming)) {
            nextValue = {
              userId: "",
              generation: Number(current.generation || 0),
              revision: Math.max(Number(current.revision || 0), Number(incoming.revision || 0)),
              protocolVersion: Math.max(2, Number(incoming.protocolVersion || 1)),
              terminalClear: incoming.terminal !== false,
              clearedUserId: String(current.userId || ""),
            };
            store.put(nextValue, "active");
            applied = true;
          } else nextValue = current;
        }
      };
      readRequest.onerror = () => reject(readRequest.error);
      tx.oncomplete = () => resolve({ applied, context: nextValue });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("push context transaction aborted"));
    });
  } finally { db.close(); }
}

async function readPushContext`,
  'F4 SW durable write',
);
replaceOne(
  'public/push-sw.js',
  /self\.addEventListener\("message", \(event\) => \{\n  if \(event\.data\?\.type === "WAWIS_PUSH_CONTEXT_SET" \|\| event\.data\?\.type === "WAWIS_PUSH_CONTEXT_CLEAR"\) \{[\s\S]*?\n    return;\n  \}\n  if \(event\.data\?\.type !== "WAWIS_CACHE_LOADED_ASSETS"\) return;/,
`self.addEventListener("message", (event) => {
  if (event.data?.type === "WAWIS_PUSH_CONTEXT_GET") {
    event.waitUntil((async () => {
      try {
        const context = await readPushContext();
        event.ports?.[0]?.postMessage({ ok: true, applied: true, context });
      } catch (error) {
        event.ports?.[0]?.postMessage({ ok: false, error: error?.message || String(error) });
      }
    })());
    return;
  }
  if (event.data?.type === "WAWIS_PUSH_CONTEXT_SET" || event.data?.type === "WAWIS_PUSH_CONTEXT_CLEAR") {
    event.waitUntil((async () => {
      try {
        const result = await writePushContextCommand(event.data);
        event.ports?.[0]?.postMessage({ ok: true, applied: Boolean(result?.applied), context: result?.context || null });
      } catch (error) {
        event.ports?.[0]?.postMessage({ ok: false, error: error?.message || String(error) });
      }
    })());
    return;
  }
  if (event.data?.type !== "WAWIS_CACHE_LOADED_ASSETS") return;`,
  'F4 SW message protocol',
);

// F10 mobile: bound all remaining PushManager operations.
replaceOne(
  'src/mobile791/modules/push-subscriptions.js',
  "  return registration?.pushManager.getSubscription() || null;",
  "  if (!registration?.pushManager?.getSubscription) return null;\n  return withPushLifecycleTimeout(registration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-current-subscription');",
  'F10 mobile getCurrent',
);
replaceOne(
  'src/mobile791/modules/push-subscriptions.js',
  "    await subscription.unsubscribe().catch(() => false);",
  "    await withPushLifecycleTimeout(subscription.unsubscribe(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-expired-unsubscribe').catch(() => false);",
  'F10 mobile expired unsubscribe',
);
replaceOne(
  'src/mobile791/modules/push-subscriptions.js',
  "  const replacement = await registration.pushManager.subscribe({\n    userVisibleOnly: true,\n    applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),\n  });",
  "  const replacement = await withPushLifecycleTimeout(registration.pushManager.subscribe({\n    userVisibleOnly: true,\n    applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),\n  }), PUSH_LOCAL_STEP_TIMEOUT_MS * 2, 'push-expired-subscribe');",
  'F10 mobile replacement subscribe',
);
replaceOne(
  'src/mobile791/modules/push-subscriptions.js',
  "  let subscription = await registration.pushManager.getSubscription();\n  if (!subscription) {\n    subscription = await registration.pushManager.subscribe({\n      userVisibleOnly: true,\n      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),\n    });\n  }",
  "  let subscription = await withPushLifecycleTimeout(registration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-ensure-read');\n  if (!subscription) {\n    subscription = await withPushLifecycleTimeout(registration.pushManager.subscribe({\n      userVisibleOnly: true,\n      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),\n    }), PUSH_LOCAL_STEP_TIMEOUT_MS * 2, 'push-ensure-subscribe');\n  }",
  'F10 mobile ensure',
);

// F10/F11 desktop: bounded lifecycle + lifecycle token + controlled RPC writes.
replaceOne(
  'src/modules/push-subscriptions.js',
  "const PUSH_SERVER_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;\n",
  "const PUSH_SERVER_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;\nconst PUSH_LOCAL_STEP_TIMEOUT_MS = 900;\nconst PUSH_LIFECYCLE_KEY_PREFIX = 'wawis_push_lifecycle_v1078';\n",
  'desktop push constants',
);
replaceOne(
  'src/modules/push-subscriptions.js',
  "let lastForbiddenAt = 0;\n",
  `let lastForbiddenAt = 0;
const desktopLifecycleTokens = new Map();

export function withPushLifecycleTimeout(promise, timeoutMs = PUSH_LOCAL_STEP_TIMEOUT_MS, label = 'push-lifecycle') {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const error = new Error(\`Przekroczono limit czasu operacji PUSH: \${label}.\`);
      error.code = 'PUSH_LIFECYCLE_TIMEOUT';
      reject(error);
    }, Math.max(1, Number(timeoutMs) || PUSH_LOCAL_STEP_TIMEOUT_MS));
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timerId));
}

function randomLifecycleToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return \`v1078:\${crypto.randomUUID()}\`;
  return \`v1078:\${Date.now().toString(36)}:\${Math.random().toString(36).slice(2)}\`;
}

function getOrCreateDesktopPushLifecycleToken(sessionUser) {
  const userId = String(sessionUser?.id || '').trim();
  if (!userId) return '';
  if (desktopLifecycleTokens.has(userId)) return desktopLifecycleTokens.get(userId);
  const key = \`\${PUSH_LIFECYCLE_KEY_PREFIX}:\${userId}\`;
  let token = '';
  try { token = String(window.localStorage.getItem(key) || '').trim(); } catch {}
  if (!token) {
    token = randomLifecycleToken();
    try { window.localStorage.setItem(key, token); } catch {}
  }
  desktopLifecycleTokens.set(userId, token);
  return token;
}
`,
  'desktop lifecycle helpers',
);
replaceOne(
  'src/modules/push-subscriptions.js',
  "  return navigator.serviceWorker.register(PUSH_SW_PATH);",
  "  return withPushLifecycleTimeout(navigator.serviceWorker.register(PUSH_SW_PATH), PUSH_LOCAL_STEP_TIMEOUT_MS * 2, 'service-worker-register');",
  'F10 desktop SW register',
);
replaceOne(
  'src/modules/push-subscriptions.js',
  /  const savePromise = \(async \(\) => \{\n    const \{ error \} = await supabase\.from\("push_subscriptions"\)\.upsert\(\{[\s\S]*?\n    return \{ saved: true, skipped: false, reason: "ok" \};\n  \}\)\(\);/,
`  const lifecycleToken = getOrCreateDesktopPushLifecycleToken(sessionUser);
  const savePromise = (async () => {
    const { data, error } = await supabase.rpc("push_subscription_sync_self", {
      p_endpoint: payload.endpoint,
      p_p256dh: payload.p256dh,
      p_auth: payload.auth,
      p_lifecycle_token: lifecycleToken,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      p_device_label: typeof navigator !== "undefined" ? \`\${navigator.platform || "Urządzenie"} / \${navigator.userAgentData?.platform || navigator.language || "przeglądarka"}\` : "Przeglądarka",
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
  })();`,
  'F11 desktop sync RPC',
);
replaceOne(
  'src/modules/push-subscriptions.js',
  /export async function disableSavedPushSubscription\(\{ supabase, endpoint \}\) \{[\s\S]*?\n\}\n\nexport async function getCurrentPushSubscription/,
`export async function disableSavedPushSubscription({ supabase, endpoint }) {
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

export async function getCurrentPushSubscription`,
  'F11 desktop disable RPC',
);
replaceOne(
  'src/modules/push-subscriptions.js',
  "  return registration?.pushManager.getSubscription() || null;",
  "  if (!registration?.pushManager?.getSubscription) return null;\n  return withPushLifecycleTimeout(registration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-current-subscription');",
  'F10 desktop getCurrent',
);
replaceOne(
  'src/modules/push-subscriptions.js',
  "    await subscription.unsubscribe().catch(() => false);",
  "    await withPushLifecycleTimeout(subscription.unsubscribe(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-expired-unsubscribe').catch(() => false);",
  'F10 desktop unsubscribe',
);
replaceOne(
  'src/modules/push-subscriptions.js',
  "  const replacement = await registration.pushManager.subscribe({\n    userVisibleOnly: true,\n    applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),\n  });",
  "  const replacement = await withPushLifecycleTimeout(registration.pushManager.subscribe({\n    userVisibleOnly: true,\n    applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),\n  }), PUSH_LOCAL_STEP_TIMEOUT_MS * 2, 'push-expired-subscribe');",
  'F10 desktop replacement subscribe',
);
replaceOne(
  'src/modules/push-subscriptions.js',
  "  let subscription = await registration.pushManager.getSubscription();\n  if (!subscription) {\n    subscription = await registration.pushManager.subscribe({\n      userVisibleOnly: true,\n      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),\n    });\n  }",
  "  let subscription = await withPushLifecycleTimeout(registration.pushManager.getSubscription(), PUSH_LOCAL_STEP_TIMEOUT_MS, 'push-ensure-read');\n  if (!subscription) {\n    subscription = await withPushLifecycleTimeout(registration.pushManager.subscribe({\n      userVisibleOnly: true,\n      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),\n    }), PUSH_LOCAL_STEP_TIMEOUT_MS * 2, 'push-ensure-subscribe');\n  }",
  'F10 desktop ensure',
);

replaceOne(
  'src/hooks/usePushNotificationsState.js',
  "  const lastSuccessfulSyncAtRef = useRef(0);\n",
  "  const lastSuccessfulSyncAtRef = useRef(0);\n  const syncEpochRef = useRef(0);\n",
  'F10 desktop hook epoch ref',
);
replaceOne(
  'src/hooks/usePushNotificationsState.js',
  "    if (!sessionUser) return INITIAL_PUSH_STATE;\n    if (syncInFlightRef.current) return syncInFlightRef.current;\n    if (!force && Date.now() - lastSuccessfulSyncAtRef.current < PUSH_MIN_SYNC_INTERVAL_MS) {",
  "    if (!sessionUser) return INITIAL_PUSH_STATE;\n    if (syncInFlightRef.current) return syncInFlightRef.current;\n    const syncEpoch = syncEpochRef.current;\n    const isCurrentSync = () => syncEpoch === syncEpochRef.current;\n    if (!force && Date.now() - lastSuccessfulSyncAtRef.current < PUSH_MIN_SYNC_INTERVAL_MS) {",
  'F10 desktop hook capture epoch',
);
replaceOne(
  'src/hooks/usePushNotificationsState.js',
  "      const nextState = await getPushStatus({ supabase, sessionUser });\n      setPushState(nextState);",
  "      const nextState = await getPushStatus({ supabase, sessionUser });\n      if (!isCurrentSync()) return readStoredPushState(userId);\n      setPushState(nextState);",
  'F10 desktop hook stale result guard',
);
replaceOne(
  'src/hooks/usePushNotificationsState.js',
  "  useEffect(() => {\n    if (!sessionUser) {",
  "  useEffect(() => {\n    syncEpochRef.current += 1;\n    syncInFlightRef.current = null;\n    if (!sessionUser) {",
  'F10 desktop hook effect epoch',
);
replaceOne(
  'src/hooks/usePushNotificationsState.js',
  "    return () => {\n      window.removeEventListener(\"focus\", handleVisible);",
  "    return () => {\n      syncEpochRef.current += 1;\n      window.removeEventListener(\"focus\", handleVisible);",
  'F10 desktop hook cleanup epoch',
);

// F11 RPC layer. Migration A can be deployed before Edge; Migration B revokes
// direct writes only after new frontend/Edge are live.
write('supabase/migrations/20260916184000_push_lifecycle_rpc_v1087.sql', `-- WAWIS 10.87 — controlled PUSH mutation API + atomic expired cleanup.
create or replace function public.push_subscription_sync_self(
  p_endpoint text, p_p256dh text, p_auth text, p_lifecycle_token text,
  p_user_agent text default null, p_device_label text default null
)
returns table (subscription_id uuid, owner_user_id uuid, is_active boolean, last_seen_at timestamptz, ownership_generation bigint, reassigned boolean, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'push_auth_required' using errcode='42501'; end if;
  return query select * from public.push_subscription_sync_atomic(
    v_user_id, p_endpoint, p_p256dh, p_auth, p_lifecycle_token, p_user_agent, p_device_label
  );
end;$$;

create or replace function public.push_subscription_disable_self(
  p_endpoint text, p_p256dh text, p_auth text, p_lifecycle_token text
)
returns table (subscription_id uuid, disabled boolean, ownership_generation bigint, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'push_auth_required' using errcode='42501'; end if;
  return query select * from public.push_subscription_disable_atomic(
    v_user_id, p_endpoint, p_p256dh, p_auth, p_lifecycle_token, false, false
  );
end;$$;

create or replace function public.push_subscription_expire_atomic(
  p_request_user_id uuid, p_endpoint text, p_p256dh text, p_auth text,
  p_lifecycle_token text, p_expected_generation bigint
)
returns table (subscription_id uuid, disabled boolean, ownership_generation bigint, reason text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.push_subscriptions%rowtype;
  v_now timestamptz := now();
  v_token text := btrim(coalesce(p_lifecycle_token,''));
begin
  if p_request_user_id is null or nullif(btrim(coalesce(p_endpoint,'')),'') is null
     or nullif(btrim(coalesce(p_p256dh,'')),'') is null or nullif(btrim(coalesce(p_auth,'')),'') is null
     or v_token = '' or coalesce(p_expected_generation,0) <= 0 then
    raise exception 'push_invalid_expire_request' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_endpoint,0));
  select ps.* into v_row from public.push_subscriptions ps where ps.endpoint=p_endpoint for update;
  if not found then return query select null::uuid,false,0::bigint,'not-found'::text; return; end if;
  if v_row.user_id <> p_request_user_id then return query select v_row.id,false,v_row.ownership_generation,'owner-mismatch'::text; return; end if;
  if v_row.p256dh <> p_p256dh or v_row.auth <> p_auth then return query select v_row.id,false,v_row.ownership_generation,'credentials-mismatch'::text; return; end if;
  if v_row.lifecycle_token <> v_token then return query select v_row.id,false,v_row.ownership_generation,'stale-lifecycle'::text; return; end if;
  if v_row.ownership_generation <> p_expected_generation then return query select v_row.id,false,v_row.ownership_generation,'generation-mismatch'::text; return; end if;
  if not v_row.is_active then return query select v_row.id,false,v_row.ownership_generation,'already-disabled'::text; return; end if;

  insert into private.push_subscription_lifecycle_tombstones(endpoint,p256dh,auth,user_id,lifecycle_token,invalidated_at)
  values(v_row.endpoint,v_row.p256dh,v_row.auth,v_row.user_id,v_row.lifecycle_token,v_now)
  on conflict do nothing;

  update public.push_subscriptions
  set is_active=false, ownership_generation=v_row.ownership_generation+1, updated_at=v_now
  where id=v_row.id returning * into v_row;
  return query select v_row.id,true,v_row.ownership_generation,'expired-disabled'::text;
end;$$;

revoke all on function public.push_subscription_sync_self(text,text,text,text,text,text) from public,anon;
revoke all on function public.push_subscription_disable_self(text,text,text,text) from public,anon;
revoke all on function public.push_subscription_expire_atomic(uuid,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.push_subscription_sync_self(text,text,text,text,text,text) to authenticated;
grant execute on function public.push_subscription_disable_self(text,text,text,text) to authenticated;
grant execute on function public.push_subscription_expire_atomic(uuid,text,text,text,text,bigint) to service_role;
`);
write('supabase/migrations/20260916184100_push_subscription_acl_v1087.sql', `-- WAWIS 10.87 — clients may read their RLS-filtered PUSH row, but all mutation goes through controlled RPC/Edge paths.
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select on table public.push_subscriptions to authenticated;
`);

// Edge expired cleanup: include lifecycle token and use the generation-aware RPC.
for (const file of ['supabase/functions/send-assignment-push/index.ts', 'supabase/functions/send-fuel-entry-push/index.ts']) {
  replaceAllChecked(file,
    '.select("id, user_id, endpoint, p256dh, auth, ownership_generation")',
    '.select("id, user_id, endpoint, p256dh, auth, lifecycle_token, ownership_generation")',
    1,
    'F11 Edge select lifecycle token');
  replaceAllChecked(file,
    /await adminClient\s*\.from\("push_subscriptions"\)\s*\.update\(\{ is_active: false \}\)\s*\.eq\("id", subscription\.id\)\s*\.eq\("user_id", subscription\.user_id\)\s*\.eq\("ownership_generation", subscription\.ownership_generation\)\s*\.eq\("is_active", true\);/g,
`await adminClient.rpc("push_subscription_expire_atomic", {
          p_request_user_id: subscription.user_id,
          p_endpoint: subscription.endpoint,
          p_p256dh: subscription.p256dh,
          p_auth: subscription.auth,
          p_lifecycle_token: subscription.lifecycle_token || "",
          p_expected_generation: subscription.ownership_generation,
        });`,
    1,
    'F11 Edge atomic expire');
}

// Existing v10.83 smoke expected the old direct UPDATE. Keep the safety assertion,
// but point it at the new tombstone RPC contract.
replaceOne(
  'scripts/smoke-session-push-gate-v1083.mjs',
  "assert.match(fuel, /ownership_generation/);\nassert.match(fuel, /\\.eq\\(\\\"ownership_generation\\\", subscription\\.ownership_generation\\)/);",
  "assert.match(fuel, /ownership_generation/);\nassert.match(fuel, /lifecycle_token/);\nassert.match(fuel, /rpc\\(\\\"push_subscription_expire_atomic\\\"/);",
  'update historical F11 smoke',
);

// 10.87 regression must run in both PUSH-specific and infra/full gates.
replaceOne(
  'scripts/test-groups.cjs',
  "    'node scripts/smoke-session-push-gate-v1083.mjs',\n  ],\n  fuel:",
  "    'node scripts/smoke-session-push-gate-v1083.mjs',\n    'node scripts/smoke-audit-fixes-v1087.mjs',\n  ],\n  fuel:",
  'add 10.87 to push group',
);
replaceOne(
  'scripts/test-groups.cjs',
  "    'node scripts/smoke-audit-fixes-v1086.mjs',\n    'npm run test:smoke:e2e-mobile',",
  "    'node scripts/smoke-audit-fixes-v1086.mjs',\n    'node scripts/smoke-audit-fixes-v1087.mjs',\n    'npm run test:smoke:e2e-mobile',",
  'add 10.87 to infra group',
);

console.log('Applied deterministic 10.87 F4/F10/F11 changes.');
