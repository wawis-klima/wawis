import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getSupabaseErrorStatus,
  getSupabaseUserMessage,
  isSupabaseAuthorizationError,
  isTransientSupabaseError,
  TRANSIENT_SUPABASE_MESSAGE,
} from '../src/modules/supabase-errors.js';
import {
  loginUser,
  restoreAuthSession,
  subscribeToAuthState,
} from '../src/modules/auth.js';
import { normalizeDatabaseErrorMessage } from '../src/modules/database-errors.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const status of [500, 502, 503, 504]) {
  const error = { status, message: 'authorization service failed' };
  assert.equal(getSupabaseErrorStatus(error), status);
  assert.equal(isTransientSupabaseError(error), true);
  assert.equal(isSupabaseAuthorizationError(error), false);
  assert.equal(getSupabaseUserMessage(error), TRANSIENT_SUPABASE_MESSAGE);
  assert.equal(normalizeDatabaseErrorMessage(error), TRANSIENT_SUPABASE_MESSAGE);
}

for (const error of [
  { code: 'request_timeout', message: 'upstream request timeout' },
  { code: 'unexpected_failure', message: 'Failed to connect to postgres' },
  { message: 'context deadline exceeded' },
  { cause: { response: { status: 504 } }, message: 'Błąd autoryzacji' },
]) {
  assert.equal(isTransientSupabaseError(error), true);
  assert.equal(getSupabaseUserMessage(error), TRANSIENT_SUPABASE_MESSAGE);
}

for (const error of [
  { status: 401, message: 'Unauthorized' },
  { status: 403, message: 'Permission denied' },
  { code: '42501', message: 'row-level security policy violation' },
]) {
  assert.equal(isTransientSupabaseError(error), false);
  assert.equal(isSupabaseAuthorizationError(error), true);
  assert.notEqual(getSupabaseUserMessage(error), TRANSIENT_SUPABASE_MESSAGE);
}

{
  const cachedUser = { id: 'cached-user' };
  let loggedOut = 0;
  let restoredUser = null;
  let message = '';
  const result = await restoreAuthSession({
    supabase: {
      auth: {
        getSession: async () => ({
          data: { session: { user: cachedUser } },
          error: { status: 504, message: 'Błąd autoryzacji' },
        }),
      },
    },
    logoutFlagKey: 'test_logout',
    applyLoggedOutState: () => { loggedOut += 1; },
    setSessionUser: (user) => { restoredUser = user; },
    setErrorMsg: (value) => { message = value; },
    setAuthResolved: () => {},
    refreshAll: async () => ({ ok: false, transient: true }),
  });

  assert.equal(loggedOut, 0, 'Błąd 504 nie może czyścić sesji.');
  assert.equal(restoredUser, cachedUser, 'Użytkownik z lokalnej sesji ma pozostać zalogowany.');
  assert.equal(message, '', 'Przy istniejącej sesji chwilowy 504 nie powinien zasłaniać aplikacji czerwonym komunikatem.');
  assert.equal(result.retryable, true);
}

{
  let authCallback = null;
  let loggedOut = 0;
  let restoredUser = null;
  let refreshCount = 0;
  const unsubscribe = subscribeToAuthState({
    supabase: {
      auth: {
        onAuthStateChange(callback) {
          authCallback = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        getSession: async () => ({ data: { session: null }, error: null }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
      },
    },
    logoutFlagKey: 'test_logout',
    applyLoggedOutState: () => { loggedOut += 1; },
    setSessionUser: (user) => { restoredUser = user; },
    setAuthResolved: () => {},
    refreshAll: async () => { refreshCount += 1; },
  });

  authCallback('TOKEN_REFRESHED', null);
  assert.equal(loggedOut, 0, 'Puste zdarzenie inne niż SIGNED_OUT nie może wylogować użytkownika.');

  const signedInUser = { id: 'signed-in-user' };
  authCallback('SIGNED_IN', { user: signedInUser });
  await Promise.resolve();
  assert.equal(restoredUser, signedInUser);
  assert.equal(refreshCount, 0, 'SIGNED_IN nie może odpalać drugiego pełnego odświeżenia.');

  authCallback('SIGNED_OUT', null);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(loggedOut, 1, 'SIGNED_OUT wylogowuje dopiero po potwierdzeniu braku sesji.');
  unsubscribe();
}

{
  let message = '';
  let busy = false;
  await loginUser({
    supabase: {
      auth: {
        signInWithPassword: async () => ({ data: {}, error: { status: 500, message: 'authorization failed' } }),
      },
    },
    credentials: { email: 'admin@example.test', password: 'secret' },
    loginForm: { email: '', password: '' },
    setLoginForm: () => {},
    setSessionUser: () => { throw new Error('Nie wolno ustawiać użytkownika po błędzie logowania.'); },
    setAuthResolved: () => {},
    setErrorMsg: (value) => { message = value; },
    setBusy: (value) => { busy = value; },
    refreshAll: async () => {},
  });

  assert.equal(message, TRANSIENT_SUPABASE_MESSAGE);
  assert.equal(busy, false);
}

for (const relativePath of [
  'src/modules/auth.js',
  'src/mobile791/modules/auth.js',
  'src/hooks/useAppSession.js',
  'src/mobile791/hooks/useAppSession.js',
  'src/modules/database-errors.js',
  'src/mobile791/modules/database-errors.js',
]) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.match(source, /supabase-errors\.js/, `${relativePath}: brak wspólnej klasyfikacji błędów Supabase.`);
}

const desktopAuthSource = fs.readFileSync(path.join(root, 'src/modules/auth.js'), 'utf8');
const mobileAuthSource = fs.readFileSync(path.join(root, 'src/mobile791/modules/auth.js'), 'utf8');
for (const source of [desktopAuthSource, mobileAuthSource]) {
  assert.match(source, /else if \(event === 'SIGNED_OUT'\)/);
  assert.match(source, /isTransientSupabaseError\(error\)/);
}

console.log('OK: Supabase 500/504 nie czyści aktywnej sesji, a SIGNED_OUT jest weryfikowany.');
