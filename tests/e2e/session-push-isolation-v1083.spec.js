import { expect, test } from '@playwright/test';

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
