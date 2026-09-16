import { test, expect } from '@playwright/test';
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
