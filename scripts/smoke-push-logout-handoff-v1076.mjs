import assert from 'node:assert/strict';
import fs from 'node:fs';

const push = fs.readFileSync('src/mobile791/modules/push-subscriptions.js', 'utf8');
const lifecycle = fs.readFileSync('src/mobile791/modules/push-lifecycle-v1078.js', 'utf8');
const auth = fs.readFileSync('src/mobile791/modules/auth.js', 'utf8');
const desktopPush = fs.readFileSync('src/modules/push-subscriptions.js', 'utf8');
const desktopAuth = fs.readFileSync('src/modules/auth.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/send-assignment-push/index.ts', 'utf8');

// Gwarancje 10.76 pozostają zachowane, choć implementacja jest już w lifecycle 10.78.
assert.match(lifecycle, /wawis_push_logout_pending_v1076/, '10.78 musi odczytać pending cleanup pozostawiony przez 10.76');
assert.match(push, /persistPendingPushDisable\(payload,/);
assert.match(push, /subscription\.unsubscribe\(\)/);
assert.match(push, /eventType:\s*"disable_subscription"/);
assert.match(push, /eventType:\s*"sync_subscription"/);
assert.match(push, /pushCredentialsMatch/);
assert.match(push, /signal:\s*requestControl\.signal/);
assert.match(push, /pushSaveAbortControl\?\.abort/);
assert.match(push, /pushLogoutInProgress\s*=\s*true/);

assert.match(auth, /deactivatePushForLogout, reconcilePendingPushLogout/);
assert.match(auth, /reconcilePendingPushLogout\(\{ supabase, sessionUser: data\.user, force: true \}\)/);
const deactivate = auth.indexOf('await deactivatePushForLogout({ supabase, sessionUser })');
const clearStorage = auth.indexOf('removeSupabaseStorageKeys();', deactivate);
assert.ok(deactivate >= 0 && clearStorage > deactivate, 'PUSH nadal musi być dezaktywowany przed czyszczeniem sesji');
assert.match(auth, /deactivatePushForLogout\(\{ supabase, sessionUser \}\)/, 'Logout 10.83 musi przekazać bieżącego użytkownika bez dodatkowego getSession.');
assert.match(auth, /event === 'SIGNED_IN' \|\| event === 'USER_UPDATED'/, 'Nie wolno zmieniać istniejącego odświeżenia danych po SIGNED_IN');

// 10.78 wzmacnia 10.76: własność/klucze są sprawdzane atomowo po stronie DB zamiast SELECT+UPSERT.
assert.match(edge, /push_subscription_sync_atomic/);
assert.match(edge, /push_subscription_disable_atomic/);
assert.match(edge, /p_p256dh:\s*p256dh/);
assert.match(edge, /p_auth:\s*auth/);
assert.doesNotMatch(edge.match(/async function handleSyncSubscription[\s\S]*?async function handleDisableSubscription/)?.[0] || '', /\.upsert\(/);

// Desktop/przeglądarka nie dostaje mobilnego lifecycle logout.
assert.doesNotMatch(desktopAuth, /deactivatePushForLogout|reconcilePendingPushLogout/);
assert.doesNotMatch(desktopPush, /wawis_push_logout_pending_v1076|wawis_push_logout_pending_v1078/);

console.log('PASS smoke-push-logout-handoff-v1076');
