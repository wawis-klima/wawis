import assert from 'node:assert/strict';
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
