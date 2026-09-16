import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// 1) Service Worker recipient + ownership-generation guard.
{
  const source = fs.readFileSync('public/push-safety.js', 'utf8');
  const context = { globalThis: {} };
  vm.runInNewContext(source, context, { filename: 'push-safety.js' });
  const shouldDisplay = context.globalThis.WawisPushSafety.shouldDisplayPush;

  assert.equal(shouldDisplay({ recipientUserId: 'A', subscriptionGeneration: 3 }, { userId: 'A', generation: 3 }), true);
  assert.equal(shouldDisplay({ recipientUserId: 'A', subscriptionGeneration: 3 }, { userId: 'B', generation: 3 }), false, 'Push A nie może być pokazany po zalogowaniu B.');
  assert.equal(shouldDisplay({ recipientUserId: 'A', subscriptionGeneration: 2 }, { userId: 'A', generation: 3 }), false, 'Stara generacja endpointu nie może być pokazana.');
  assert.equal(shouldDisplay({ title: 'legacy' }, { userId: 'A', generation: 3 }), false, 'Legacy push bez odbiorcy ma być odrzucony.');
}

// 2) Durable pending logout queue + retry/backoff + wiele zmian kont.
{
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) { return map.has(key) ? map.get(key) : null; },
      setItem(key, value) { map.set(key, String(value)); },
      removeItem(key) { map.delete(key); },
    },
  };

  const lifecycle = await import('../src/mobile791/modules/push-lifecycle-v1078.js?smoke-v1078');
  const a = { endpoint: 'https://push.test/a', p256dh: 'pa', auth: 'aa' };
  const b = { endpoint: 'https://push.test/b', p256dh: 'pb', auth: 'ab' };
  const tokenA = lifecycle.getOrCreatePushLifecycleToken({ id: 'user-a' });
  assert.match(tokenA, /^v1078:/);
  assert.equal(lifecycle.persistPendingPushDisable(a, { sessionUser: { id: 'user-a' }, lifecycleToken: tokenA }), true);
  assert.equal(lifecycle.persistPendingPushDisable(b, { sessionUser: { id: 'user-b' }, lifecycleToken: 'v1078:B' }), true);
  assert.equal(lifecycle.readPendingPushDisables().length, 2, 'Kolejka musi zachować kilka kolejnych zmian kont.');

  const first = lifecycle.readPendingPushDisables()[0];
  lifecycle.markPendingPushDisableRetry(first);
  const afterRetry = lifecycle.readPendingPushDisables().find((item) => item.id === first.id);
  assert.equal(afterRetry.attempts, 1);
  assert.ok(afterRetry.nextRetryAt > Date.now());
  assert.equal(lifecycle.getDuePendingPushDisables().some((item) => item.id === first.id), false, 'Backoff ma blokować natychmiastowe ponowienie.');
  assert.equal(lifecycle.getDuePendingPushDisables({ force: true }).some((item) => item.id === first.id), true, 'Powrót internetu/login może wymusić retry.');

  lifecycle.removePendingPushDisable(first);
  assert.equal(lifecycle.readPendingPushDisables().length, 1);
}

// 3) SQL naprawdę serializuje endpoint i nie udostępnia wewnętrznych RPC klientom.
{
  const sql = fs.readFileSync('supabase/migrations/20260916095000_push_subscription_atomic_lifecycle_v1078.sql', 'utf8');
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_endpoint, 0\)\)/);
  assert.match(sql, /for update;/i);
  assert.match(sql, /push_owner_active/);
  assert.match(sql, /push_lifecycle_disabled/);
  assert.match(sql, /tombstone-created/);
  assert.match(sql, /revoke all on function public\.push_subscription_sync_atomic[\s\S]*authenticated/);
  assert.match(sql, /grant execute on function public\.push_subscription_sync_atomic[\s\S]*service_role/);
}

// 4) Źródła PUSH muszą korzystać z atomowych RPC i trwałego kontekstu SW.
{
  const edge = fs.readFileSync('supabase/functions/send-assignment-push/index.ts', 'utf8');
  const push = fs.readFileSync('src/mobile791/modules/push-subscriptions.js', 'utf8');
  const hook = fs.readFileSync('src/mobile791/hooks/usePushNotificationsState.js', 'utf8');
  const sw = fs.readFileSync('public/push-sw.js', 'utf8');

  assert.match(edge, /push_subscription_sync_atomic/);
  assert.match(edge, /push_subscription_disable_atomic/);
  assert.match(edge, /recipientUserId/);
  assert.match(edge, /subscriptionGeneration/);
  assert.doesNotMatch(edge.match(/async function handleSyncSubscription[\s\S]*?async function handleDisableSubscription/)?.[0] || '', /\.upsert\(/, 'Sync nie może wrócić do SELECT + bezwarunkowego UPSERT.');
  const expiredCleanup = edge.match(/if \(statusCode === 404 \|\| statusCode === 410\) \{[\s\S]*?\n      \}/)?.[0] || '';
  assert.match(expiredCleanup, /rpc\("push_subscription_expire_atomic"/, 'Cleanup 404/410 musi tworzyć tombstone przez atomowy RPC.');
  assert.match(expiredCleanup, /p_request_user_id: subscription\.user_id/, 'Stara wysyłka musi być przypięta do właściciela, z którego wystartowała.');
  assert.match(expiredCleanup, /p_expected_generation: subscription\.ownership_generation/, 'Cleanup 404/410 musi być przypięty do generacji wysyłki.');
  assert.match(expiredCleanup, /p_lifecycle_token: subscription\.lifecycle_token/, 'Cleanup musi sprawdzać lifecycle wysyłki.');

  assert.match(push, /getOrCreatePushLifecycleToken/);
  assert.match(push, /publishPushServiceWorkerContext/);
  assert.match(push, /clearCurrentPushServiceWorkerContext/);
  assert.match(push, /isPushSessionContextCurrent/);
  assert.match(push, /const needsStandalone = true/);
  assert.match(hook, /reconcilePendingPushLogout/);
  assert.match(hook, /force: true/);
  assert.match(sw, /WAWIS_PUSH_CONTEXT_SET/);
  assert.match(sw, /WAWIS_PUSH_CONTEXT_GET/);
  assert.match(sw, /WawisPushContextGuard\?\.shouldApplySet/);
  assert.match(sw, /WawisPushContextGuard\?\.shouldApplyClear/);
  assert.match(sw, /terminalClear/);
  assert.match(sw, /WawisPushSafety\?\.shouldDisplayPush/);
}

console.log('PASS smoke-push-safety-v1078');