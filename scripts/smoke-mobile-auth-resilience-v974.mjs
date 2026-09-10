import assert from 'node:assert/strict';
import { restoreAuthSession, subscribeToAuthState } from '../src/mobile791/modules/auth.js';

{
  const cachedUser = { id: 'mobile-user', email: 'user@example.test' };
  let restoredUser = null;
  let loggedOut = 0;
  let message = '';
  const result = await restoreAuthSession({
    supabase: {
      auth: {
        getSession: async () => ({
          data: { session: { user: cachedUser } },
          error: { message: 'JWT expired', code: 'PGRST301' },
        }),
        refreshSession: async () => ({ data: { session: null }, error: { status: 504, message: 'context deadline exceeded' } }),
      },
    },
    logoutFlagKey: 'wawis_test_logout',
    applyLoggedOutState: () => { loggedOut += 1; },
    setSessionUser: (user) => { restoredUser = user; },
    setErrorMsg: (value) => { message = value; },
    setAuthResolved: () => {},
    refreshAll: async () => ({ ok: false, transient: true }),
  });

  assert.equal(loggedOut, 0, 'mobile: transient Auth 504 cannot log out cached user');
  assert.equal(restoredUser, cachedUser, 'mobile: cached user must remain active during Auth 504');
  assert.equal(message, '', 'mobile: transient Auth 504 with cached session should not show session-expired error');
  assert.equal(result?.restored, true);
  assert.equal(result?.retryable, true);
  assert.equal(result?.transient, true);
}

{
  let authCallback = null;
  let loggedOut = 0;
  let authResolved = false;
  const unsubscribe = subscribeToAuthState({
    supabase: {
      auth: {
        onAuthStateChange(callback) {
          authCallback = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        getSession: async () => ({ data: { session: null }, error: { status: 504, message: 'context deadline exceeded' } }),
        refreshSession: async () => ({ data: { session: null }, error: { status: 504, message: 'context deadline exceeded' } }),
      },
    },
    logoutFlagKey: 'wawis_test_logout',
    applyLoggedOutState: () => { loggedOut += 1; },
    setSessionUser: () => {},
    setAuthResolved: (value) => { authResolved = value; },
    refreshAll: async () => ({ ok: false, transient: true }),
  });

  authCallback('SIGNED_OUT', null);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(loggedOut, 0, 'mobile: unexpected SIGNED_OUT + 504 cannot clear local app state');
  assert.equal(authResolved, true);
  unsubscribe();
}

console.log('Smoke OK: mobile Auth 504 preserves cached session and ignores fake SIGNED_OUT');
