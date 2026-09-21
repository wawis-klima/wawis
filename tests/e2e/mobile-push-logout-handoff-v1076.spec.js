import { test, expect } from '@playwright/test';

async function preparePushPhase(page, { userId, network = 'ok', hasSubscription = true, unsubscribeSucceeds = false, clearPending = false }) {
  return page.evaluate(async ({ phaseUserId, phaseNetwork, phaseHasSubscription, phaseUnsubscribeSucceeds, shouldClearPending }) => {
    const lifecycle = await import('/src/mobile791/modules/push-lifecycle-v1078.js');
    const push = await import('/src/mobile791/modules/push-subscriptions.js');
    const { PUSH_LOGOUT_PENDING_KEY, LEGACY_PUSH_LOGOUT_PENDING_KEY } = lifecycle.PUSH_LIFECYCLE_TESTING;
    if (shouldClearPending) {
      localStorage.removeItem(PUSH_LOGOUT_PENDING_KEY);
      localStorage.removeItem(LEGACY_PUSH_LOGOUT_PENDING_KEY);
    }

    let subscription = phaseHasSubscription
      ? {
          endpoint: 'https://push.example/device-1076',
          toJSON() {
            return { endpoint: this.endpoint, keys: { p256dh: 'p256dh-1076', auth: 'auth-1076' } };
          },
          async unsubscribe() {
            if (phaseUnsubscribeSucceeds) subscription = null;
            return phaseUnsubscribeSucceeds;
          },
        }
      : null;
    const requests = [];
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        async getRegistration() {
          return { pushManager: { async getSubscription() { return subscription; } } };
        },
      },
    });
    const originalFetch = window.fetch;
    window.fetch = async (_url, options = {}) => {
      const body = JSON.parse(String(options.body || '{}'));
      requests.push(body);
      if (phaseNetwork === 'fail') throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({
        ok: true,
        reassigned: body.eventType === 'sync_subscription',
        disabled: body.eventType === 'disable_subscription',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const fakeSupabase = {
      auth: {
        async getSession() {
          return {
            data: { session: { access_token: `token-${phaseUserId}`, user: { id: phaseUserId } } },
            error: null,
          };
        },
      },
    };
    lifecycle.transitionPushSessionContext({ id: phaseUserId });
    return {
      lifecycle,
      push,
      fakeSupabase,
      requests,
      restoreFetch() { window.fetch = originalFetch; },
    };
  }, {
    phaseUserId: userId,
    phaseNetwork: network,
    phaseHasSubscription: hasSubscription,
    phaseUnsubscribeSucceeds: unsubscribeSucceeds,
    shouldClearPending: clearPending,
  });
}

test('@mobile v10.83 — logout offline i konto A→B nie zostawiają starego właściciela endpointu', async ({ page }) => {
  await page.goto('/');

  const logoutA = await page.evaluate(async () => {
    const lifecycle = await import('/src/mobile791/modules/push-lifecycle-v1078.js');
    const push = await import('/src/mobile791/modules/push-subscriptions.js');
    const { PUSH_LOGOUT_PENDING_KEY, LEGACY_PUSH_LOGOUT_PENDING_KEY } = lifecycle.PUSH_LIFECYCLE_TESTING;
    localStorage.removeItem(PUSH_LOGOUT_PENDING_KEY);
    localStorage.removeItem(LEGACY_PUSH_LOGOUT_PENDING_KEY);
    let subscription = {
      endpoint: 'https://push.example/device-1076',
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p256dh-1076', auth: 'auth-1076' } }; },
      async unsubscribe() { return false; },
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      async getRegistration() { return { pushManager: { async getSubscription() { return subscription; } } }; },
    }});
    const originalFetch = window.fetch;
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const fakeSupabase = { auth: { async getSession() { return { data: { session: { access_token: 'token-user-a', user: { id: 'user-a' } } }, error: null }; } } };
    lifecycle.transitionPushSessionContext({ id: 'user-a' });
    const result = await push.deactivatePushForLogout({ supabase: fakeSupabase, sessionUser: { id: 'user-a' } });
    const pendingCount = lifecycle.readPendingPushDisables().length;
    window.fetch = originalFetch;
    return { result, pendingCount };
  });

  expect(logoutA.result.serverDisabled).toBe(false);
  expect(logoutA.result.unsubscribed).toBe(false);
  expect(logoutA.pendingCount).toBe(1);

  // Prawdziwy handoff konta następuje po przeładowaniu aplikacji: moduły JS startują
  // od nowa, natomiast trwała kolejka lifecycle zostaje w localStorage.
  await page.reload();
  const handoffB = await page.evaluate(async () => {
    const lifecycle = await import('/src/mobile791/modules/push-lifecycle-v1078.js');
    const push = await import('/src/mobile791/modules/push-subscriptions.js');
    let subscription = {
      endpoint: 'https://push.example/device-1076',
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p256dh-1076', auth: 'auth-1076' } }; },
      async unsubscribe() { return false; },
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      async getRegistration() { return { pushManager: { async getSubscription() { return subscription; } } }; },
    }});
    const requests = [];
    const originalFetch = window.fetch;
    window.fetch = async (_url, options = {}) => {
      const body = JSON.parse(String(options.body || '{}'));
      requests.push(body);
      return new Response(JSON.stringify({
        ok: true,
        reassigned: body.eventType === 'sync_subscription',
        disabled: body.eventType === 'disable_subscription',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const fakeSupabase = { auth: { async getSession() { return { data: { session: { access_token: 'token-user-b', user: { id: 'user-b' } } }, error: null }; } } };
    lifecycle.transitionPushSessionContext({ id: 'user-b' });
    const result = await push.reconcilePendingPushLogout({ supabase: fakeSupabase, sessionUser: { id: 'user-b' }, force: true });
    const pendingCount = lifecycle.readPendingPushDisables().length;
    window.fetch = originalFetch;
    return { result, events: requests.map((item) => item.eventType), pendingCount };
  });

  expect(handoffB.result.reconciled).toBe(true);
  expect(handoffB.result.cleaned).toBe(1);
  expect(handoffB.result.failed).toBe(0);
  expect(handoffB.result.reassigned).toBe(true);
  expect(handoffB.events).toEqual(['disable_subscription', 'sync_subscription']);
  expect(handoffB.pendingCount).toBe(0);

  // Jeżeli przeglądarka zdąży lokalnie unsubscribe przed awarią sieci, po restarcie
  // sprzątamy tombstone starego konta, ale nie przypisujemy nieistniejącej subskrypcji B.
  await page.reload();
  const unsubscribedA = await page.evaluate(async () => {
    const lifecycle = await import('/src/mobile791/modules/push-lifecycle-v1078.js');
    const push = await import('/src/mobile791/modules/push-subscriptions.js');
    let subscription = {
      endpoint: 'https://push.example/device-1076',
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p256dh-1076', auth: 'auth-1076' } }; },
      async unsubscribe() { subscription = null; return true; },
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      async getRegistration() { return { pushManager: { async getSubscription() { return subscription; } } }; },
    }});
    const originalFetch = window.fetch;
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const fakeSupabase = { auth: { async getSession() { return { data: { session: { access_token: 'token-user-a', user: { id: 'user-a' } } }, error: null }; } } };
    lifecycle.transitionPushSessionContext({ id: 'user-a' });
    const result = await push.deactivatePushForLogout({ supabase: fakeSupabase, sessionUser: { id: 'user-a' } });
    const pendingCount = lifecycle.readPendingPushDisables().length;
    window.fetch = originalFetch;
    return { result, pendingCount };
  });

  expect(unsubscribedA.result.unsubscribed).toBe(true);
  expect(unsubscribedA.pendingCount).toBe(1);

  await page.reload();
  const staleCleanup = await page.evaluate(async () => {
    const lifecycle = await import('/src/mobile791/modules/push-lifecycle-v1078.js');
    const push = await import('/src/mobile791/modules/push-subscriptions.js');
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      async getRegistration() { return { pushManager: { async getSubscription() { return null; } } }; },
    }});
    const requests = [];
    const originalFetch = window.fetch;
    window.fetch = async (_url, options = {}) => {
      const body = JSON.parse(String(options.body || '{}'));
      requests.push(body);
      return new Response(JSON.stringify({ ok: true, disabled: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const fakeSupabase = { auth: { async getSession() { return { data: { session: { access_token: 'token-user-b', user: { id: 'user-b' } } }, error: null }; } } };
    lifecycle.transitionPushSessionContext({ id: 'user-b' });
    const result = await push.reconcilePendingPushLogout({ supabase: fakeSupabase, sessionUser: { id: 'user-b' }, force: true });
    const pendingCount = lifecycle.readPendingPushDisables().length;
    window.fetch = originalFetch;
    return { result, events: requests.map((item) => item.eventType), pendingCount };
  });

  expect(staleCleanup.result.reconciled).toBe(true);
  expect(staleCleanup.result.cleaned).toBe(1);
  expect(staleCleanup.result.failed).toBe(0);
  expect(staleCleanup.result.reassigned).toBe(false);
  expect(staleCleanup.events).toEqual(['disable_subscription']);
  expect(staleCleanup.pendingCount).toBe(0);
});
