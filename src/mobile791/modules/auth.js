import { getSupabaseUserMessage, isJwtExpiredError, isTransientSupabaseError, TRANSIENT_SUPABASE_MESSAGE } from './supabase-errors.js';

export function clearAppClientState({
  setSessionUser,
  setProfile,
  setProfiles,
  setJobs,
  setSelectedJob,
  setNotifications,
  setShowAssignedJobsOnly,
  setAuthResolved,
}) {
  setSessionUser(null);
  setProfile(null);
  setProfiles([]);
  setJobs([]);
  setSelectedJob(null);
  setNotifications([]);
  setShowAssignedJobsOnly(false);
  if (typeof setAuthResolved === "function") {
    setAuthResolved(true);
  }
}

function removeSupabaseStorageKeys() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('wawis_logout_in_progress', '1');
  const storageAreas = [localStorage, sessionStorage].filter(Boolean);

  for (const storage of storageAreas) {
    const authKeys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      const lowerKey = String(key || '').toLowerCase();
      if (key && (lowerKey.includes('supabase') || lowerKey.includes('sb-'))) authKeys.push(key);
    }
    authKeys.forEach((key) => storage.removeItem(key));
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function restoreAuthSession({
  supabase,
  logoutFlagKey,
  applyLoggedOutState,
  setSessionUser,
  setErrorMsg,
  setAuthResolved,
  refreshAll,
}) {
  if (!supabase) return;

  if (typeof window !== 'undefined' && sessionStorage.getItem(logoutFlagKey) === '1') {
    sessionStorage.removeItem(logoutFlagKey);
    sessionStorage.removeItem('wawis_logout_in_progress');
    applyLoggedOutState();
    return;
  }

  let { data, error } = await supabase.auth.getSession();
  const cachedSession = data?.session || null;
  if (error && isJwtExpiredError(error)) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshedData?.session) {
      data = refreshedData;
      error = null;
    } else if (refreshError && isTransientSupabaseError(refreshError) && cachedSession?.user) {
      // Chwilowy 5xx/504 z Auth nie oznacza wylogowania. Zostawiamy lokalną
      // sesję i dane na ekranie, a odnowienie tokenu ponowimy później.
      if (typeof setSessionUser === 'function') setSessionUser(cachedSession.user);
      setAuthResolved(true);
      return { restored: true, retryable: true, transient: true };
    } else {
      setErrorMsg('Sesja wygasła — zaloguj się ponownie.');
      setAuthResolved(true);
      return { restored: false, retryable: false, sessionExpired: true };
    }
  }

  if (error) {
    const cachedUser = data?.session?.user || null;
    if (cachedUser && typeof setSessionUser === 'function') setSessionUser(cachedUser);
    const transient = isTransientSupabaseError(error);
    // Jeżeli telefon ma lokalną sesję, nie zasłaniamy działającej aplikacji
    // czerwonym komunikatem tylko dlatego, że Auth chwilowo odpowiada 5xx/504.
    if (!transient || !cachedUser) {
      setErrorMsg(getSupabaseUserMessage(error, 'Nie udało się przywrócić sesji.'));
    }
    setAuthResolved(true);
    return { restored: Boolean(cachedUser), retryable: transient, transient };
  }

  const user = data.session?.user || null;
  if (user) {
    if (typeof setSessionUser === 'function') setSessionUser(user);
    setAuthResolved(true);
    const refreshResult = await refreshAll(user, { silent: true, preserveJobDetails: true });
    return { restored: true, retryable: Boolean(refreshResult?.transient) };
  }

  applyLoggedOutState();
  setAuthResolved(true);
  return { restored: false, retryable: false };
}

export function subscribeToAuthState({
  supabase,
  logoutFlagKey,
  applyLoggedOutState,
  setSessionUser,
  setAuthResolved,
  refreshAll,
}) {
  if (!supabase) return () => {};

  let disposed = false;
  let signedOutVerificationTimerId = null;
  let signedOutVerificationInFlight = false;
  const SIGNED_OUT_VERIFY_DELAY_MS = 1500;
  const SIGNED_OUT_TRANSIENT_RETRY_MS = 30000;

  const scheduleSignedOutVerification = (delayMs = SIGNED_OUT_VERIFY_DELAY_MS) => {
    if (disposed) return;
    if (typeof window === 'undefined') {
      void verifyUnexpectedSignedOut();
      return;
    }
    window.clearTimeout(signedOutVerificationTimerId);
    signedOutVerificationTimerId = window.setTimeout(() => {
      signedOutVerificationTimerId = null;
      void verifyUnexpectedSignedOut();
    }, delayMs);
  };

  const verifyUnexpectedSignedOut = async () => {
    if (disposed || signedOutVerificationInFlight) return;
    if (typeof window !== 'undefined' && sessionStorage.getItem(logoutFlagKey) === '1') return;

    signedOutVerificationInFlight = true;
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user || null;
      if (sessionUser) {
        if (typeof setSessionUser === 'function') setSessionUser(sessionUser);
        setAuthResolved(true);
        return;
      }
      if (sessionError && isTransientSupabaseError(sessionError)) {
        // Auth chwilowo niedostępny: nie czyścimy sesji ani lokalnych kart.
        setAuthResolved(true);
        scheduleSignedOutVerification(SIGNED_OUT_TRANSIENT_RETRY_MS);
        return;
      }

      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
      const refreshedUser = refreshedData?.session?.user || null;
      if (refreshedUser) {
        if (typeof setSessionUser === 'function') setSessionUser(refreshedUser);
        setAuthResolved(true);
        void refreshAll(refreshedUser, { silent: true, preserveJobDetails: true });
        return;
      }
      if (refreshError && isTransientSupabaseError(refreshError)) {
        // 500/502/503/504 nie jest dowodem na wylogowanie użytkownika.
        setAuthResolved(true);
        scheduleSignedOutVerification(SIGNED_OUT_TRANSIENT_RETRY_MS);
        return;
      }

      // Dopiero jednoznaczny brak lokalnej sesji i brak możliwego odnowienia
      // oznacza rzeczywiste wylogowanie.
      applyLoggedOutState();
    } catch (error) {
      if (isTransientSupabaseError(error)) {
        setAuthResolved(true);
        scheduleSignedOutVerification(SIGNED_OUT_TRANSIENT_RETRY_MS);
        return;
      }
      applyLoggedOutState();
    } finally {
      signedOutVerificationInFlight = false;
    }
  };

  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(logoutFlagKey) === '1') {
      setAuthResolved(true);
      return;
    }

    setAuthResolved(true);
    const user = session?.user || null;
    if (user) {
      if (signedOutVerificationTimerId && typeof window !== 'undefined') {
        window.clearTimeout(signedOutVerificationTimerId);
        signedOutVerificationTimerId = null;
      }
      if (typeof setSessionUser === 'function') setSessionUser(user);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void refreshAll(user, { silent: true, preserveJobDetails: true });
      }
    } else if (event === 'SIGNED_OUT') {
      // Supabase potrafi wyemitować SIGNED_OUT przy nieudanym odnowieniu tokenu.
      // Nie wyrzucamy użytkownika natychmiast — najpierw weryfikujemy, czy to
      // rzeczywiste wylogowanie, czy tylko chwilowy 5xx/504 serwera Auth.
      if (!signedOutVerificationInFlight) scheduleSignedOutVerification();
    }
  });

  return () => {
    disposed = true;
    if (signedOutVerificationTimerId && typeof window !== 'undefined') {
      window.clearTimeout(signedOutVerificationTimerId);
    }
    authListener.subscription.unsubscribe();
  };
}

export async function loginUser({
  supabase,
  credentials,
  loginForm,
  setLoginForm,
  setSessionUser,
  setAuthResolved,
  setErrorMsg,
  setBusy,
  refreshAll,
}) {
  if (!supabase) return;
  const email = String(credentials.email ?? loginForm.email ?? '').trim();
  const password = String(credentials.password ?? loginForm.password ?? '');

  if (!email || !password) {
    setErrorMsg('Podaj email i hasło.');
    return;
  }

  setBusy(true);
  setErrorMsg('');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    setLoginForm({ email, password: '' });
    setSessionUser(data.user || null);
    setAuthResolved(true);

    // Jedno lekkie odświeżenie po zalogowaniu. Auth listener nie dubluje już INITIAL_SESSION.
    void refreshAll(data.user, { silent: true, preserveJobDetails: true }).then((refreshResult) => {
      if (refreshResult?.transient && !refreshResult?.ok && !refreshResult?.preservedExistingData) setErrorMsg(TRANSIENT_SUPABASE_MESSAGE);
    }).catch((refreshError) => {
      setErrorMsg(getSupabaseUserMessage(refreshError, 'Zalogowano, ale nie udało się odświeżyć danych.'));
    });
  } catch (error) {
    setLoginForm((prev) => ({ ...prev, email, password: prev.password || password }));
    setErrorMsg(getSupabaseUserMessage(error, 'Błąd logowania.'));
  } finally {
    setBusy(false);
  }
}

export async function registerAppUser({ supabase, registerForm, setBusy, setErrorMsg }) {
  if (!supabase) return;
  setBusy(true);
  setErrorMsg('');
  try {
    const { error } = await supabase.auth.signUp({
      email: registerForm.email.trim(),
      password: registerForm.password,
      options: { data: { full_name: registerForm.fullName, role: 'Pracownik' } },
    });
    if (error) throw error;
    alert('Konto utworzone. Możesz się zalogować.');
  } catch (error) {
    setErrorMsg(getSupabaseUserMessage(error, 'Błąd rejestracji.'));
  } finally {
    setBusy(false);
  }
}

export async function logoutUser({
  supabase,
  logoutFlagKey,
  clearLocalState,
}) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(logoutFlagKey, '1');
  }

  removeSupabaseStorageKeys();
  clearLocalState();

  if (supabase) {
    void Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      delay(1200).then(() => ({ timeout: true })),
    ]).catch((error) => {
      console.warn('Wylogowanie lokalne Supabase zakończone po czyszczeniu sesji:', error?.message || error);
    });
  }

  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      window.location.replace(window.location.pathname);
    }, 0);
  }
}
