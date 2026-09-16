from pathlib import Path
import json
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"{label}: anchor not found")
    return text.replace(old, new, 1)

push_path = ROOT / "src/mobile791/modules/push-subscriptions.js"
push = push_path.read_text(encoding="utf-8")

constants_anchor = 'const PUSH_SERVER_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;\n'
push = replace_once(push, constants_anchor, constants_anchor + '''const PUSH_LOGOUT_PENDING_KEY = "wawis_push_logout_pending_v1076";\nconst PUSH_LOGOUT_REQUEST_TIMEOUT_MS = 1600;\nconst PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS = 900;\nconst PUSH_LOGOUT_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;\n''', 'push constants')

helpers_anchor = '\nexport function isStandaloneMode() {'
helpers = r'''

function waitForPushLifecycle(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    userAgent: device.userAgent, deviceLabel: device.deviceLabel,
  }};
}

function buildDisableSubscriptionBody(payload, triggeredBy = "push-subscription-disable") {
  return { eventType: "disable_subscription", triggeredBy, subscription: {
    endpoint: payload.endpoint, p256dh: payload.p256dh, auth: payload.auth,
  }};
}

function pushCredentialsMatch(left, right) {
  return Boolean(left?.endpoint && right?.endpoint
    && left.endpoint === right.endpoint
    && left.p256dh === right.p256dh
    && left.auth === right.auth);
}

function persistPendingPushDisable(payload) {
  if (typeof window === "undefined" || !payload?.endpoint || !payload?.p256dh || !payload?.auth) return false;
  try {
    window.localStorage.setItem(PUSH_LOGOUT_PENDING_KEY, JSON.stringify({
      queuedAt: Date.now(), subscription: { endpoint: payload.endpoint, p256dh: payload.p256dh, auth: payload.auth },
    }));
    return true;
  } catch { return false; }
}

function readPendingPushDisable() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PUSH_LOGOUT_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const queuedAt = Number(parsed?.queuedAt || 0);
    const payload = parsed?.subscription || null;
    if (!queuedAt || Date.now() - queuedAt > PUSH_LOGOUT_PENDING_MAX_AGE_MS
      || !payload?.endpoint || !payload?.p256dh || !payload?.auth) {
      window.localStorage.removeItem(PUSH_LOGOUT_PENDING_KEY);
      return null;
    }
    return payload;
  } catch {
    try { window.localStorage.removeItem(PUSH_LOGOUT_PENDING_KEY); } catch {}
    return null;
  }
}

function clearPendingPushDisableIfMatches(payload) {
  if (typeof window === "undefined") return;
  const pending = readPendingPushDisable();
  if (pending && pushCredentialsMatch(pending, payload)) {
    try { window.localStorage.removeItem(PUSH_LOGOUT_PENDING_KEY); } catch {}
  }
}

function createPushLifecycleAbort(timeoutMs = PUSH_LOGOUT_REQUEST_TIMEOUT_MS) {
  if (typeof AbortController === "undefined") return { signal: undefined, cancel: () => {} };
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(new DOMException("Push lifecycle timeout", "AbortError")), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timerId) };
}

async function getExistingPushSubscription() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = typeof navigator.serviceWorker.getRegistration === "function"
      ? await navigator.serviceWorker.getRegistration(PUSH_SW_PATH)
      : null;
    if (registration?.pushManager?.getSubscription) return await registration.pushManager.getSubscription();
    const readyRegistration = navigator.serviceWorker.ready
      ? await Promise.race([navigator.serviceWorker.ready, waitForPushLifecycle(400).then(() => null)])
      : null;
    return readyRegistration?.pushManager?.getSubscription ? await readyRegistration.pushManager.getSubscription() : null;
  } catch { return null; }
}
'''
push = replace_once(push, helpers_anchor, helpers + helpers_anchor, 'push helpers')

save_start = push.index('export async function savePushSubscription(')
disable_start = push.index('export async function disableSavedPushSubscription(', save_start)
common_save = r'''export async function savePushSubscription({ supabase, sessionUser, subscription, force = false }) {
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
    const result = await invokePushFunction({ supabase, body: buildSyncSubscriptionBody(payload) });
    lastSavedSignature = signature;
    clearPendingPushDisableIfMatches(payload);
    return { saved: true, skipped: false, reason: result?.reassigned ? "reassigned" : "ok", reassigned: Boolean(result?.reassigned) };
  })();
  pushSaveInFlight = savePromise;
  try { return await savePromise; }
  finally { if (pushSaveInFlight === savePromise) pushSaveInFlight = null; }
}

'''
push = push[:save_start] + common_save + push[disable_start:]

disable_start = push.index('export async function disableSavedPushSubscription(')
get_current_start = push.index('export async function getCurrentPushSubscription()', disable_start)
lifecycle = r'''export async function disableSavedPushSubscription({ supabase, subscription }) {
  if (!supabase || !subscription) return { disabled: false, skipped: true };
  const payload = getSubscriptionPayload(subscription);
  if (!payload?.endpoint || !payload?.p256dh || !payload?.auth) return { disabled: false, skipped: true };
  const result = await invokePushFunction({ supabase, body: buildDisableSubscriptionBody(payload) });
  clearPendingPushDisableIfMatches(payload);
  return { disabled: Boolean(result?.disabled), skipped: false, result };
}

export async function deactivatePushForLogout({ supabase }) {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return { found: false, serverDisabled: false, unsubscribed: false, pending: Boolean(readPendingPushDisable()) };
  const payload = getSubscriptionPayload(subscription);
  if (!payload?.endpoint || !payload?.p256dh || !payload?.auth) {
    return { found: true, serverDisabled: false, unsubscribed: false, pending: Boolean(readPendingPushDisable()), reason: "missing-keys" };
  }

  persistPendingPushDisable(payload);
  const requestControl = createPushLifecycleAbort();
  let serverDisabled = false;
  let serverError = "";
  const disableTask = supabase
    ? invokePushFunction({ supabase, body: buildDisableSubscriptionBody(payload, "logout"), signal: requestControl.signal })
      .then(() => { serverDisabled = true; clearPendingPushDisableIfMatches(payload); })
      .catch((error) => { serverError = error?.message || String(error); })
    : Promise.resolve();
  const unsubscribeTask = Promise.race([
    Promise.resolve(subscription.unsubscribe()).then(Boolean).catch(() => false),
    waitForPushLifecycle(PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS).then(() => false),
  ]);
  const [, unsubscribed] = await Promise.all([disableTask, unsubscribeTask]);
  requestControl.cancel();
  pushSaveInFlight = null;
  lastSavedSignature = "";
  lastSaveAttemptAt = 0;
  return { found: true, serverDisabled, unsubscribed: Boolean(unsubscribed), pending: Boolean(readPendingPushDisable()), error: serverError || null };
}

export async function reconcilePendingPushLogout({ supabase, sessionUser }) {
  const pending = readPendingPushDisable();
  if (!pending || !supabase || !sessionUser) {
    return { reconciled: false, pending: Boolean(pending), reason: pending ? "missing-session" : "nothing-pending" };
  }
  const currentSubscription = await getExistingPushSubscription();
  const currentPayload = getSubscriptionPayload(currentSubscription);
  const sameSubscription = pushCredentialsMatch(pending, currentPayload);
  const requestControl = createPushLifecycleAbort();
  try {
    const result = await invokePushFunction({
      supabase,
      body: sameSubscription
        ? buildSyncSubscriptionBody(currentPayload, "login-account-handoff")
        : buildDisableSubscriptionBody(pending, "login-stale-cleanup"),
      signal: requestControl.signal,
    });
    clearPendingPushDisableIfMatches(pending);
    if (sameSubscription && currentPayload?.endpoint) {
      lastSavedSignature = buildSubscriptionSignature(sessionUser, currentPayload);
      lastSaveAttemptAt = Date.now();
    }
    return { reconciled: true, pending: false, action: sameSubscription ? "reassigned" : "disabled-stale", reassigned: Boolean(result?.reassigned) };
  } catch (error) {
    return { reconciled: false, pending: true, action: sameSubscription ? "reassign-pending" : "disable-pending", error: error?.message || String(error) };
  } finally { requestControl.cancel(); }
}

'''
push = push[:disable_start] + lifecycle + push[get_current_start:]
push = replace_once(push, 'async function invokePushFunction({ supabase, body }) {', 'async function invokePushFunction({ supabase, body, signal = undefined }) {', 'invoke signature')
push = replace_once(push, '    body: JSON.stringify(body || {}),\n', '    signal,\n    body: JSON.stringify(body || {}),\n', 'invoke signal')
push_path.write_text(push, encoding="utf-8")

auth_path = ROOT / "src/mobile791/modules/auth.js"
auth = auth_path.read_text(encoding="utf-8")
lines = auth.splitlines(True)
insert_at = 0
while insert_at < len(lines) and lines[insert_at].startswith('import '): insert_at += 1
lines.insert(insert_at, "import { deactivatePushForLogout, reconcilePendingPushLogout } from './push-subscriptions.js';\n")
auth = ''.join(lines)
auth = replace_once(auth,
    "  const user = data.session?.user || null;\n  if (user) {\n",
    "  const user = data.session?.user || null;\n  if (user) {\n    await reconcilePendingPushLogout({ supabase, sessionUser: user }).catch((pushError) => {\n      console.warn('Nie udało się dokończyć poprzedniego wylogowania PUSH:', pushError?.message || pushError);\n    });\n",
    'restore reconcile')
auth = replace_once(auth,
    "    const { data, error } = await supabase.auth.signInWithPassword({ email, password });\n    if (error) throw error;\n",
    "    const { data, error } = await supabase.auth.signInWithPassword({ email, password });\n    if (error) throw error;\n\n    await reconcilePendingPushLogout({ supabase, sessionUser: data.user }).catch((pushError) => {\n      console.warn('Nie udało się uzgodnić PUSH po zmianie konta:', pushError?.message || pushError);\n    });\n",
    'login reconcile')
logout_anchor = "  if (typeof window !== 'undefined') {\n    sessionStorage.setItem(logoutFlagKey, '1');\n  }\n\n"
auth = replace_once(auth, logout_anchor,
    logout_anchor + "  await deactivatePushForLogout({ supabase }).catch((pushError) => {\n    console.warn('Nie udało się wyłączyć PUSH przed wylogowaniem:', pushError?.message || pushError);\n  });\n\n",
    'logout deactivate')
auth = auth.replace("if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {", "if (event === 'USER_UPDATED') {", 1)
if auth.index('await deactivatePushForLogout({ supabase })') > auth.index('removeSupabaseStorageKeys();', auth.index('await deactivatePushForLogout({ supabase })')):
    raise RuntimeError('logout order invalid')
auth_path.write_text(auth, encoding="utf-8")

(ROOT / "scripts/smoke-push-logout-handoff-v1076.mjs").write_text(r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
const push = fs.readFileSync('src/mobile791/modules/push-subscriptions.js', 'utf8');
const auth = fs.readFileSync('src/mobile791/modules/auth.js', 'utf8');
const desktopPush = fs.readFileSync('src/modules/push-subscriptions.js', 'utf8');
const desktopAuth = fs.readFileSync('src/modules/auth.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/send-assignment-push/index.ts', 'utf8');
assert.match(push, /wawis_push_logout_pending_v1076/);
assert.match(push, /persistPendingPushDisable\(payload\)/);
assert.match(push, /subscription\.unsubscribe\(\)/);
assert.match(push, /eventType:\s*"disable_subscription"/);
assert.match(push, /eventType:\s*"sync_subscription"/);
assert.match(push, /sameSubscription[\s\S]*buildSyncSubscriptionBody/);
assert.match(push, /signal:\s*requestControl\.signal/);
assert.match(auth, /deactivatePushForLogout, reconcilePendingPushLogout/);
assert.match(auth, /reconcilePendingPushLogout\(\{ supabase, sessionUser: data\.user \}\)/);
const deactivate = auth.indexOf('await deactivatePushForLogout({ supabase })');
const clearStorage = auth.indexOf('removeSupabaseStorageKeys();', deactivate);
assert.ok(deactivate >= 0 && clearStorage > deactivate);
assert.doesNotMatch(auth, /event === 'SIGNED_IN' \|\| event === 'USER_UPDATED'/);
assert.match(edge, /String\(existing\?\.p256dh \|\| ""\) !== p256dh/);
assert.match(edge, /String\(existing\?\.auth \|\| ""\) !== auth/);
assert.match(edge, /credentialsMatch[\s\S]*p256dh[\s\S]*auth/);
assert.doesNotMatch(desktopAuth, /deactivatePushForLogout|reconcilePendingPushLogout/);
assert.doesNotMatch(desktopPush, /wawis_push_logout_pending_v1076/);
console.log('PASS smoke-push-logout-handoff-v1076');
''', encoding='utf-8')

(ROOT / "tests/e2e/mobile-push-logout-handoff-v1076.spec.js").write_text(r'''import { test, expect } from '@playwright/test';
test('@mobile v10.76 — logout offline i konto A→B nie zostawiają starego właściciela endpointu', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const key = 'wawis_push_logout_pending_v1076';
    localStorage.removeItem(key);
    let subscription = null;
    let unsubscribeSucceeds = false;
    let network = 'fail';
    let userId = 'user-a';
    const requests = [];
    const makeSubscription = () => ({ endpoint: 'https://push.example/device-1076',
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p256dh-1076', auth: 'auth-1076' } }; },
      async unsubscribe() { if (unsubscribeSucceeds) subscription = null; return unsubscribeSucceeds; } });
    subscription = makeSubscription();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      async getRegistration() { return { pushManager: { async getSubscription() { return subscription; } } }; },
    }});
    const originalFetch = window.fetch;
    window.fetch = async (_url, options = {}) => {
      const body = JSON.parse(String(options.body || '{}')); requests.push(body);
      if (network === 'fail') throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ ok: true, reassigned: body.eventType === 'sync_subscription', disabled: body.eventType === 'disable_subscription' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const fakeSupabase = { auth: { async getSession() { return { data: { session: { access_token: `token-${userId}`, user: { id: userId } } }, error: null }; } } };
    const push = await import('/src/mobile791/modules/push-subscriptions.js?e2e-v1076');
    const logoutA = await push.deactivatePushForLogout({ supabase: fakeSupabase });
    const pendingAfterLogoutA = Boolean(localStorage.getItem(key));
    userId = 'user-b'; network = 'ok'; requests.length = 0;
    const handoffB = await push.reconcilePendingPushLogout({ supabase: fakeSupabase, sessionUser: { id: 'user-b' } });
    const handoffEvent = requests.at(-1)?.eventType || '';
    const pendingAfterHandoff = Boolean(localStorage.getItem(key));
    subscription = makeSubscription(); unsubscribeSucceeds = true; network = 'fail'; userId = 'user-a';
    await push.deactivatePushForLogout({ supabase: fakeSupabase });
    const pendingAfterUnsubscribedLogout = Boolean(localStorage.getItem(key));
    network = 'ok'; userId = 'user-b'; requests.length = 0;
    const staleCleanup = await push.reconcilePendingPushLogout({ supabase: fakeSupabase, sessionUser: { id: 'user-b' } });
    const staleCleanupEvent = requests.at(-1)?.eventType || '';
    const pendingAfterStaleCleanup = Boolean(localStorage.getItem(key));
    window.fetch = originalFetch;
    return { logoutA, pendingAfterLogoutA, handoffB, handoffEvent, pendingAfterHandoff, pendingAfterUnsubscribedLogout, staleCleanup, staleCleanupEvent, pendingAfterStaleCleanup };
  });
  expect(result.logoutA.serverDisabled).toBe(false);
  expect(result.logoutA.unsubscribed).toBe(false);
  expect(result.pendingAfterLogoutA).toBe(true);
  expect(result.handoffB.reconciled).toBe(true);
  expect(result.handoffB.action).toBe('reassigned');
  expect(result.handoffEvent).toBe('sync_subscription');
  expect(result.pendingAfterHandoff).toBe(false);
  expect(result.pendingAfterUnsubscribedLogout).toBe(true);
  expect(result.staleCleanup.reconciled).toBe(true);
  expect(result.staleCleanup.action).toBe('disabled-stale');
  expect(result.staleCleanupEvent).toBe('disable_subscription');
  expect(result.pendingAfterStaleCleanup).toBe(false);
});
''', encoding='utf-8')

subprocess.run(['node', 'version-bump.cjs'], cwd=ROOT, check=True)
package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['scripts']['test:smoke:push-logout-handoff'] = 'node scripts/smoke-push-logout-handoff-v1076.mjs'
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

groups_path = ROOT / 'scripts/test-groups.cjs'
groups = groups_path.read_text(encoding='utf-8').replace("    'npm run test:smoke:push-mobile-reassignment',\n", "    'npm run test:smoke:push-mobile-reassignment',\n    'npm run test:smoke:push-logout-handoff',\n", 1)
groups_path.write_text(groups, encoding='utf-8')

readme_path = ROOT / 'README.md'
readme = readme_path.read_text(encoding='utf-8').replace('- wersja `10.76` — uzupełnij opis ostatniej poprawki po zakończeniu zmian.', '- wersja `10.76` — mobilny PUSH przy wylogowaniu: dezaktywacja przed usunięciem sesji, lokalny unsubscribe, trwały retry po awarii sieci i bezpieczny handoff endpointu A→B po zgodności kluczy Web Push.')
readme_path.write_text(readme, encoding='utf-8')

changelog_path = ROOT / 'CHANGELOG.md'
changelog = changelog_path.read_text(encoding='utf-8').replace('## 10.76\n- uzupełnij opis zmian dla wersji 10.76', '## 10.76\n- aplikacja mobilna dezaktywuje endpoint PUSH przed usunięciem sesji Auth i wykonuje lokalne `PushSubscription.unsubscribe()`,\n- awaria sieci przy logout zapisuje minimalny retry w `localStorage`; po następnym logowaniu ten sam endpoint może przejść z konta A na B tylko przy zgodności endpointu, `p256dh` i `auth`,\n- jeśli lokalny unsubscribe się udał, stare konto jest czyszczone po sieci zamiast przypisywania starego endpointu do nowego konta,\n- desktop/przeglądarka nie są częścią tej zmiany,\n- dodano test źródłowy i Playwright dla awarii sieci oraz przejścia A→B.')
changelog_path.write_text(changelog, encoding='utf-8')

gate_path = ROOT / 'RELEASE-GATE.json'
gate = json.loads(gate_path.read_text(encoding='utf-8'))
gate.update({'version': '10.76', 'scope': 'mobile', 'release_branch': 'release/v10.76'})
gate['baseline_diagnostics'] = {'checked': True, 'last_24h': True, 'checked_at': datetime.now(timezone.utc).isoformat().replace('+00:00','Z'), 'result': 'INFO', 'notes': 'Start 10.76: 10.75 ma 3 warningi Failed to fetch (contractors/devices/network), bez błędu push. Diagnostyka jest informacyjna.'}
gate['predeploy_diagnostics'] = {'checked': False, 'last_24h': True, 'checked_at': '', 'result': 'PENDING', 'notes': 'Informacyjne; nie blokuje release.'}
gate['drive_backup'] = {'required': True, 'folder_path': 'Aplikacja/Wersje', 'folder_id': '1eufcE1gnbfw7t2IMmJwbcicrkaiaqu0S', 'file_name': 'klima-app-v10.76.zip', 'file_id': '', 'size_bytes': 0, 'uploaded': False, 'uploaded_at': '', 'verified': False}
gate['main_protection'] = {'source_branch': 'release/v10.76', 'ready_for_main': False, 'required_check': 'WAWIS PR checks / targeted-checks', 'final_release_run_id': '', 'final_release_head_sha': ''}
gate['postdeploy_diagnostics'] = {'evidence_required': True, 'result': 'PENDING'}
gate_path.write_text(json.dumps(gate, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

print('bootstrap v10.76 mobile-only OK')
