from pathlib import Path
import json
import re
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one replacement, got {count}")
    return updated


PUSH_CONSTANTS = '''const PUSH_LOGOUT_PENDING_KEY = "wawis_push_logout_pending_v1076";
const PUSH_LOGOUT_REQUEST_TIMEOUT_MS = 1600;
const PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS = 900;
const PUSH_LOGOUT_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
'''

PUSH_HELPERS = r'''
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
  return {
    eventType: "sync_subscription",
    triggeredBy,
    subscription: {
      endpoint: payload.endpoint,
      p256dh: payload.p256dh,
      auth: payload.auth,
      userAgent: device.userAgent,
      deviceLabel: device.deviceLabel,
    },
  };
}

function buildDisableSubscriptionBody(payload, triggeredBy = "push-subscription-disable") {
  return {
    eventType: "disable_subscription",
    triggeredBy,
    subscription: {
      endpoint: payload.endpoint,
      p256dh: payload.p256dh,
      auth: payload.auth,
    },
  };
}

function pushCredentialsMatch(left, right) {
  return Boolean(
    left?.endpoint
      && right?.endpoint
      && left.endpoint === right.endpoint
      && left.p256dh === right.p256dh
      && left.auth === right.auth
  );
}

function persistPendingPushDisable(payload) {
  if (typeof window === "undefined" || !payload?.endpoint || !payload?.p256dh || !payload?.auth) return false;
  try {
    window.localStorage.setItem(PUSH_LOGOUT_PENDING_KEY, JSON.stringify({
      queuedAt: Date.now(),
      subscription: {
        endpoint: payload.endpoint,
        p256dh: payload.p256dh,
        auth: payload.auth,
      },
    }));
    return true;
  } catch {
    return false;
  }
}

function readPendingPushDisable() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PUSH_LOGOUT_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const queuedAt = Number(parsed?.queuedAt || 0);
    const payload = parsed?.subscription || null;
    if (!queuedAt || Date.now() - queuedAt > PUSH_LOGOUT_PENDING_MAX_AGE_MS) {
      window.localStorage.removeItem(PUSH_LOGOUT_PENDING_KEY);
      return null;
    }
    if (!payload?.endpoint || !payload?.p256dh || !payload?.auth) {
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
  if (!pending || !pushCredentialsMatch(pending, payload)) return;
  try { window.localStorage.removeItem(PUSH_LOGOUT_PENDING_KEY); } catch {}
}

function createPushLifecycleAbort(timeoutMs = PUSH_LOGOUT_REQUEST_TIMEOUT_MS) {
  if (typeof AbortController === "undefined") {
    return { signal: undefined, cancel: () => {} };
  }
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(new DOMException("Push lifecycle timeout", "AbortError")), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timerId),
  };
}

async function getExistingPushSubscription() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = typeof navigator.serviceWorker.getRegistration === "function"
      ? await navigator.serviceWorker.getRegistration(PUSH_SW_PATH)
      : null;
    if (registration?.pushManager?.getSubscription) {
      return await registration.pushManager.getSubscription();
    }
    const readyRegistration = navigator.serviceWorker.ready
      ? await Promise.race([navigator.serviceWorker.ready, waitForPushLifecycle(400).then(() => null)])
      : null;
    return readyRegistration?.pushManager?.getSubscription
      ? await readyRegistration.pushManager.getSubscription()
      : null;
  } catch {
    return null;
  }
}
'''

COMMON_SAVE = r'''export async function savePushSubscription({ supabase, sessionUser, subscription, force = false }) {
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
      body: buildSyncSubscriptionBody(payload),
    });

    lastSavedSignature = signature;
    clearPendingPushDisableIfMatches(payload);
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
}'''

LIFECYCLE = r'''export async function disableSavedPushSubscription({ supabase, subscription }) {
  if (!supabase || !subscription) return { disabled: false, skipped: true };
  const payload = getSubscriptionPayload(subscription);
  if (!payload?.endpoint || !payload?.p256dh || !payload?.auth) return { disabled: false, skipped: true };

  const result = await invokePushFunction({
    supabase,
    body: buildDisableSubscriptionBody(payload),
  });
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

  // Najpierw zapisujemy minimalne dane subskrypcji. Jeżeli sieć padnie albo
  // strona przeładuje się w trakcie logoutu, następne logowanie może bezpiecznie
  // dokończyć wyłączenie starego endpointu albo przepisać ten sam endpoint na
  // nowe konto po potwierdzeniu obu kluczy Web Push.
  persistPendingPushDisable(payload);

  const requestControl = createPushLifecycleAbort();
  let serverDisabled = false;
  let serverError = "";
  const disableTask = supabase
    ? invokePushFunction({
      supabase,
      body: buildDisableSubscriptionBody(payload, "logout"),
      signal: requestControl.signal,
    }).then(() => {
      serverDisabled = true;
      clearPendingPushDisableIfMatches(payload);
    }).catch((error) => {
      serverError = error?.message || String(error);
    })
    : Promise.resolve();

  const unsubscribeTask = Promise.race([
    Promise.resolve(subscription.unsubscribe()).then((value) => Boolean(value)).catch(() => false),
    waitForPushLifecycle(PUSH_LOGOUT_UNSUBSCRIBE_TIMEOUT_MS).then(() => false),
  ]);

  const [, unsubscribed] = await Promise.all([disableTask, unsubscribeTask]);
  requestControl.cancel();
  pushSaveInFlight = null;
  lastSavedSignature = "";
  lastSaveAttemptAt = 0;

  return {
    found: true,
    serverDisabled,
    unsubscribed: Boolean(unsubscribed),
    pending: Boolean(readPendingPushDisable()),
    error: serverError || null,
  };
}

export async function reconcilePendingPushLogout({ supabase, sessionUser }) {
  const pending = readPendingPushDisable();
  if (!pending || !supabase || !sessionUser) return { reconciled: false, pending: Boolean(pending), reason: pending ? "missing-session" : "nothing-pending" };

  const currentSubscription = await getExistingPushSubscription();
  const currentPayload = getSubscriptionPayload(currentSubscription);
  const sameBrowserSubscription = pushCredentialsMatch(pending, currentPayload);
  const requestControl = createPushLifecycleAbort();

  try {
    // Jeżeli przeglądarka nadal ma dokładnie tę samą subskrypcję (unsubscribe
    // podczas logoutu nie doszedł do skutku), nie wyłączamy jej pod nowym kontem.
    // Zamiast tego atomowo przepisujemy endpoint przez Edge Function. Backend
    // zezwala na zmianę właściciela wyłącznie przy zgodności p256dh + auth.
    const result = await invokePushFunction({
      supabase,
      body: sameBrowserSubscription
        ? buildSyncSubscriptionBody(currentPayload, "login-account-handoff")
        : buildDisableSubscriptionBody(pending, "login-stale-cleanup"),
      signal: requestControl.signal,
    });

    clearPendingPushDisableIfMatches(pending);
    if (sameBrowserSubscription && currentPayload?.endpoint) {
      lastSavedSignature = buildSubscriptionSignature(sessionUser, currentPayload);
      lastSaveAttemptAt = Date.now();
    }
    return {
      reconciled: true,
      pending: false,
      action: sameBrowserSubscription ? "reassigned" : "disabled-stale",
      reassigned: Boolean(result?.reassigned),
    };
  } catch (error) {
    return {
      reconciled: false,
      pending: true,
      action: sameBrowserSubscription ? "reassign-pending" : "disable-pending",
      error: error?.message || String(error),
    };
  } finally {
    requestControl.cancel();
  }
}'''


def patch_push(path_str):
    path = ROOT / path_str
    source = path.read_text(encoding="utf-8")
    if "PUSH_LOGOUT_PENDING_KEY" in source:
        return
    source = replace_once(
        source,
        r'(const PUSH_SERVER_TOUCH_INTERVAL_MS = 6 \* 60 \* 60 \* 1000;\n)',
        r'\1' + PUSH_CONSTANTS,
        f"{path_str} constants",
    )
    source = replace_once(
        source,
        r'\nexport function isStandaloneMode\(\) \{',
        '\n' + PUSH_HELPERS + '\nexport function isStandaloneMode() {',
        f"{path_str} helpers",
    )
    source = replace_once(
        source,
        r'export async function savePushSubscription\(\{ supabase, sessionUser, subscription, force = false \}\) \{.*?\n\}\n\nexport async function disableSavedPushSubscription',
        COMMON_SAVE + '\n\nexport async function disableSavedPushSubscription',
        f"{path_str} save",
        flags=re.S,
    )
    source = replace_once(
        source,
        r'export async function disableSavedPushSubscription\(\{.*?\}\) \{.*?\n\}\n\nexport async function getCurrentPushSubscription',
        LIFECYCLE + '\n\nexport async function getCurrentPushSubscription',
        f"{path_str} lifecycle",
        flags=re.S,
    )
    source = replace_once(
        source,
        r'async function invokePushFunction\(\{ supabase, body \}\) \{',
        'async function invokePushFunction({ supabase, body, signal = undefined }) {',
        f"{path_str} invoke signature",
    )
    source = replace_once(
        source,
        r'(      apikey: supabaseAnonKey,\n    \},\n)(    body: JSON\.stringify\(body \|\| \{\}\),)',
        r'\1    signal,\n\2',
        f"{path_str} fetch signal",
    )
    path.write_text(source, encoding="utf-8")


for push_path in ["src/modules/push-subscriptions.js", "src/mobile791/modules/push-subscriptions.js"]:
    patch_push(push_path)


def patch_auth(path_str, mobile=False):
    path = ROOT / path_str
    source = path.read_text(encoding="utf-8")
    if "deactivatePushForLogout" not in source:
        lines = source.splitlines(True)
        insert_at = 0
        while insert_at < len(lines) and lines[insert_at].startswith("import "):
            insert_at += 1
        lines.insert(insert_at, "import { deactivatePushForLogout, reconcilePendingPushLogout } from './push-subscriptions.js';\n")
        source = ''.join(lines)

    if "reconcilePendingPushLogout({ supabase, sessionUser: user })" not in source:
        source = replace_once(
            source,
            r'(  const user = data\?\.session\?\.user \|\| null;\n  if \(user\) \{\n)',
            r'\1    await reconcilePendingPushLogout({ supabase, sessionUser: user }).catch((pushError) => {\n      console.warn("Nie udało się dokończyć poprzedniego wylogowania PUSH:", pushError?.message || pushError);\n    });\n',
            f"{path_str} restore reconcile",
        )

    if "reconcilePendingPushLogout({ supabase, sessionUser: data.user })" not in source:
        source = replace_once(
            source,
            r'(    const \{ data, error \} = await supabase\.auth\.signInWithPassword\(\{ email, password \}\);\n    if \(error\) throw error;\n)',
            r'\1\n    await reconcilePendingPushLogout({ supabase, sessionUser: data.user }).catch((pushError) => {\n      console.warn("Nie udało się uzgodnić PUSH po zmianie konta:", pushError?.message || pushError);\n    });\n',
            f"{path_str} login reconcile",
        )

    if "await deactivatePushForLogout({ supabase })" not in source:
        anchor = "  if (typeof window !== 'undefined') sessionStorage.setItem(logoutFlagKey, '1');\n" if not mobile else "  if (typeof window !== 'undefined') {\n    sessionStorage.setItem(logoutFlagKey, '1');\n  }\n"
        replacement = anchor + "\n  await deactivatePushForLogout({ supabase }).catch((pushError) => {\n    console.warn('Nie udało się wyłączyć PUSH przed wylogowaniem:', pushError?.message || pushError);\n  });\n"
        if anchor not in source:
            raise RuntimeError(f"{path_str}: logout anchor not found")
        source = source.replace(anchor, replacement, 1)

    if mobile:
        source = source.replace("if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {", "if (event === 'USER_UPDATED') {", 1)

    deactivate_index = source.find("await deactivatePushForLogout({ supabase })")
    storage_index = source.find("removeSupabaseStorageKeys();", deactivate_index)
    if deactivate_index < 0 or storage_index < 0 or deactivate_index > storage_index:
        raise RuntimeError(f"{path_str}: PUSH deactivation must happen before auth storage removal")

    path.write_text(source, encoding="utf-8")


patch_auth("src/modules/auth.js", mobile=False)
patch_auth("src/mobile791/modules/auth.js", mobile=True)

# Test źródłowy 10.76: pilnuje kolejności logoutu, retry i braku bezpośredniego
# przepisywania endpointu na desktopie.
smoke = ROOT / "scripts/smoke-push-logout-handoff-v1076.mjs"
smoke.write_text(r'''import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const desktopPush = read('src/modules/push-subscriptions.js');
const mobilePush = read('src/mobile791/modules/push-subscriptions.js');
const desktopAuth = read('src/modules/auth.js');
const mobileAuth = read('src/mobile791/modules/auth.js');
const edge = read('supabase/functions/send-assignment-push/index.ts');

for (const [label, push] of [['desktop', desktopPush], ['mobile', mobilePush]]) {
  assert.match(push, /wawis_push_logout_pending_v1076/, `${label}: brak trwałego retry logout PUSH`);
  assert.match(push, /persistPendingPushDisable\(payload\)/, `${label}: logout nie zapisuje retry przed siecią`);
  assert.match(push, /subscription\.unsubscribe\(\)/, `${label}: brak lokalnego unsubscribe przy logout`);
  assert.match(push, /eventType:\s*"disable_subscription"/, `${label}: brak bezpiecznego disable przez Edge Function`);
  assert.match(push, /eventType:\s*"sync_subscription"/, `${label}: brak bezpiecznego handoffu przez Edge Function`);
  assert.match(push, /sameBrowserSubscription[\s\S]*buildSyncSubscriptionBody/, `${label}: konto B nie przejmuje tego samego endpointu przez weryfikowany sync`);
  assert.match(push, /signal:\s*requestControl\.signal/, `${label}: logout/reconcile nie ma abortowalnego requestu`);
  assert.match(push, /clearPendingPushDisableIfMatches\(payload\)/, `${label}: udany sync nie czyści pending cleanup`);
}

assert.doesNotMatch(desktopPush, /from\("push_subscriptions"\)\.upsert/, 'desktop nadal próbuje bezpośredniego UPSERT push_subscriptions');
assert.doesNotMatch(desktopPush, /from\("push_subscriptions"\)[\s\S]{0,180}update\(\{\s*is_active:\s*false/, 'desktop nadal wyłącza endpoint bezpośrednio przez RLS');

for (const [label, auth] of [['desktop', desktopAuth], ['mobile', mobileAuth]]) {
  assert.match(auth, /deactivatePushForLogout, reconcilePendingPushLogout/, `${label}: auth nie korzysta z lifecycle PUSH`);
  assert.match(auth, /reconcilePendingPushLogout\(\{ supabase, sessionUser: data\.user \}\)/, `${label}: brak uzgodnienia A→B po logowaniu`);
  const deactivate = auth.indexOf('await deactivatePushForLogout({ supabase })');
  const clearStorage = auth.indexOf('removeSupabaseStorageKeys();', deactivate);
  assert.ok(deactivate >= 0 && clearStorage > deactivate, `${label}: sesja Auth jest czyszczona przed wyłączeniem PUSH`);
}

assert.doesNotMatch(mobileAuth, /event === 'SIGNED_IN' \|\| event === 'USER_UPDATED'/, 'mobile listener może ścigać się z handoffem PUSH po SIGNED_IN');
assert.match(edge, /body\.eventType === "sync_subscription"/, 'Edge Function nie obsługuje sync_subscription');
assert.match(edge, /String\(existing\?\.p256dh \|\| ""\) !== p256dh/, 'Edge Function nie porównuje p256dh przed zmianą właściciela');
assert.match(edge, /String\(existing\?\.auth \|\| ""\) !== auth/, 'Edge Function nie porównuje auth przed zmianą właściciela');
assert.match(edge, /credentialsMatch[\s\S]*p256dh[\s\S]*auth/, 'disable_subscription nie weryfikuje obu kluczy urządzenia');

console.log('PASS smoke-push-logout-handoff-v1076');
''', encoding="utf-8")

# E2E: realna kolejność zachowania przy awarii sieci i zmianie konta A -> B.
e2e = ROOT / "tests/e2e/mobile-push-logout-handoff-v1076.spec.js"
e2e.write_text(r'''import { test, expect } from '@playwright/test';

test('@mobile v10.76 — awaria sieci przy logout nie zostawia endpointu na koncie A', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const key = 'wawis_push_logout_pending_v1076';
    localStorage.removeItem(key);

    let currentSubscription = null;
    let unsubscribeShouldSucceed = false;
    const requests = [];
    let networkMode = 'fail';
    let currentUserId = 'user-a';

    const makeSubscription = () => ({
      endpoint: 'https://push.example/device-1076',
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: 'p256dh-1076', auth: 'auth-1076' },
        };
      },
      async unsubscribe() {
        if (unsubscribeShouldSucceed) currentSubscription = null;
        return unsubscribeShouldSucceed;
      },
    });

    currentSubscription = makeSubscription();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        async getRegistration() {
          return {
            pushManager: {
              async getSubscription() { return currentSubscription; },
            },
          };
        },
      },
    });

    const originalFetch = window.fetch;
    window.fetch = async (_url, options = {}) => {
      const body = JSON.parse(String(options.body || '{}'));
      requests.push(body);
      if (networkMode === 'fail') throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ ok: true, reassigned: body.eventType === 'sync_subscription', disabled: body.eventType === 'disable_subscription' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const fakeSupabase = {
      auth: {
        async getSession() {
          return { data: { session: { access_token: `token-${currentUserId}`, user: { id: currentUserId } } }, error: null };
        },
      },
    };

    const push = await import('/src/mobile791/modules/push-subscriptions.js?e2e-v1076');

    // A: serwer jest offline, a browser unsubscribe też nie dochodzi do skutku.
    const logoutA = await push.deactivatePushForLogout({ supabase: fakeSupabase });
    const pendingAfterLogoutA = Boolean(localStorage.getItem(key));

    // B: ten sam endpoint nadal istnieje w przeglądarce. Po odzyskaniu sieci
    // musi zostać przepisany przez sync_subscription, nie wyłączony.
    currentUserId = 'user-b';
    networkMode = 'ok';
    requests.length = 0;
    const handoffB = await push.reconcilePendingPushLogout({ supabase: fakeSupabase, sessionUser: { id: 'user-b' } });
    const handoffEvent = requests.at(-1)?.eventType || '';
    const pendingAfterHandoff = Boolean(localStorage.getItem(key));

    // Drugi scenariusz: sieć pada, ale lokalny unsubscribe się udaje. Po następnym
    // logowaniu stary endpoint ma zostać tylko wyłączony, bo browser już go nie ma.
    currentSubscription = makeSubscription();
    unsubscribeShouldSucceed = true;
    networkMode = 'fail';
    currentUserId = 'user-a';
    await push.deactivatePushForLogout({ supabase: fakeSupabase });
    const pendingAfterUnsubscribedLogout = Boolean(localStorage.getItem(key));

    networkMode = 'ok';
    currentUserId = 'user-b';
    requests.length = 0;
    const staleCleanup = await push.reconcilePendingPushLogout({ supabase: fakeSupabase, sessionUser: { id: 'user-b' } });
    const staleCleanupEvent = requests.at(-1)?.eventType || '';
    const pendingAfterStaleCleanup = Boolean(localStorage.getItem(key));

    window.fetch = originalFetch;
    return {
      logoutA,
      pendingAfterLogoutA,
      handoffB,
      handoffEvent,
      pendingAfterHandoff,
      pendingAfterUnsubscribedLogout,
      staleCleanup,
      staleCleanupEvent,
      pendingAfterStaleCleanup,
    };
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
''', encoding="utf-8")

# Wersja 10.76.
import subprocess
subprocess.run(["node", "version-bump.cjs"], cwd=ROOT, check=True)

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["scripts"]["test:smoke:push-logout-handoff"] = "node scripts/smoke-push-logout-handoff-v1076.mjs"
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# Test group PUSH.
groups_path = ROOT / "scripts/test-groups.cjs"
groups = groups_path.read_text(encoding="utf-8")
if "test:smoke:push-logout-handoff" not in groups:
    groups = groups.replace(
        "    'npm run test:smoke:push-mobile-reassignment',\n",
        "    'npm run test:smoke:push-mobile-reassignment',\n    'npm run test:smoke:push-logout-handoff',\n",
        1,
    )
groups_path.write_text(groups, encoding="utf-8")

# README / CHANGELOG bez placeholderów.
readme_path = ROOT / "README.md"
readme = readme_path.read_text(encoding="utf-8")
readme = readme.replace(
    "- wersja `10.76` — uzupełnij opis ostatniej poprawki po zakończeniu zmian.",
    "- wersja `10.76` — PUSH przy wylogowaniu: wyłączenie endpointu przed usunięciem sesji, lokalny unsubscribe, trwały retry po awarii sieci oraz bezpieczny handoff endpointu A→B wyłącznie przy zgodności kluczy Web Push.",
)
readme_path.write_text(readme, encoding="utf-8")

changelog_path = ROOT / "CHANGELOG.md"
changelog = changelog_path.read_text(encoding="utf-8")
changelog = changelog.replace(
    "## 10.76\n- uzupełnij opis zmian dla wersji 10.76",
    "## 10.76\n- logout najpierw zapisuje i dezaktywuje bieżący endpoint PUSH, a dopiero potem usuwa lokalną sesję Auth,\n- przeglądarka wykonuje lokalne `PushSubscription.unsubscribe()`; awaria sieci zapisuje minimalny retry w `localStorage` na maksymalnie 7 dni,\n- po logowaniu na konto B oczekujący endpoint jest albo bezpiecznie przepisany przez Edge Function (tylko gdy endpoint, `p256dh` i `auth` są identyczne), albo stary endpoint jest wyłączany, jeśli browser ma już nową subskrypcję,\n- desktop przestał wykonywać bezpośredni UPSERT/UPDATE `push_subscriptions`; używa tego samego weryfikowanego backendu co mobile,\n- dodano test źródłowy oraz Playwright dla awarii sieci, nieudanego unsubscribe i przejścia konto A → konto B.",
    1,
)
changelog_path.write_text(changelog, encoding="utf-8")

# Nowa bramka release. Diagnostyka pozostaje informacyjna.
gate_path = ROOT / "RELEASE-GATE.json"
gate = json.loads(gate_path.read_text(encoding="utf-8"))
gate.update({"version": "10.76", "scope": "full", "release_branch": "release/v10.76"})
gate["baseline_diagnostics"] = {
    "checked": True,
    "last_24h": True,
    "checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "result": "INFO",
    "notes": "Start 10.76: 10.75 ma 3 warningi Failed to fetch (contractors/devices/network), bez błędu push. Diagnostyka jest informacyjna i nie blokuje release.",
}
gate["predeploy_diagnostics"] = {
    "checked": False,
    "last_24h": True,
    "checked_at": "",
    "result": "PENDING",
    "notes": "Kontrola informacyjna; nie jest bramką GO/NO-GO.",
}
gate["drive_backup"] = {
    "required": True,
    "folder_path": "Aplikacja/Wersje",
    "folder_id": "1eufcE1gnbfw7t2IMmJwbcicrkaiaqu0S",
    "file_name": "klima-app-v10.76.zip",
    "file_id": "",
    "size_bytes": 0,
    "uploaded": False,
    "uploaded_at": "",
    "verified": False,
}
gate["main_protection"] = {
    "source_branch": "release/v10.76",
    "ready_for_main": False,
    "required_check": "WAWIS PR checks / targeted-checks",
    "final_release_run_id": "",
    "final_release_head_sha": "",
}
gate["postdeploy_diagnostics"] = {"evidence_required": True, "result": "PENDING"}
gate_path.write_text(json.dumps(gate, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# Samokontrola bootstrapu.
for required in [
    "src/modules/auth.js",
    "src/mobile791/modules/auth.js",
    "src/modules/push-subscriptions.js",
    "src/mobile791/modules/push-subscriptions.js",
    "scripts/smoke-push-logout-handoff-v1076.mjs",
    "tests/e2e/mobile-push-logout-handoff-v1076.spec.js",
]:
    if not (ROOT / required).exists():
        raise RuntimeError(f"Missing required 10.76 file: {required}")

print("bootstrap v10.76 OK")
