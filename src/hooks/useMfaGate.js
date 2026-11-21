import { useCallback, useEffect, useRef, useState } from 'react';
import { getMfaErrorMessage, getMfaGateState, verifyTotpLogin } from '../modules/mfa.js';

// WAWIS 14.72 — bramka kodu z telefonu po zalogowaniu (komputer i telefon).
export function useMfaGate({ supabase, sessionUser, onVerified }) {
  const userId = sessionUser?.id || '';
  const [status, setStatus] = useState(userId ? 'checking' : 'ok');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checkId = useRef(0);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  const recheck = useCallback(async () => {
    const id = checkId.current + 1;
    checkId.current = id;
    if (!userId) { setStatus('ok'); return 'ok'; }
    const state = await getMfaGateState(supabase);
    if (checkId.current !== id) return state.status;
    setStatus(state.status);
    return state.status;
  }, [supabase, userId]);

  useEffect(() => {
    setError('');
    setStatus(userId ? 'checking' : 'ok');
    void recheck();
  }, [userId, recheck]);

  useEffect(() => {
    if (!supabase?.auth?.onAuthStateChange) return undefined;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'MFA_CHALLENGE_VERIFIED' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') void recheck();
    });
    return () => data?.subscription?.unsubscribe?.();
  }, [supabase, recheck]);

  const verify = useCallback(async (code) => {
    setBusy(true);
    setError('');
    try {
      await verifyTotpLogin(supabase, code);
      const next = await recheck();
      if (next === 'ok') onVerifiedRef.current?.(sessionUser);
      else setError('Kod przyjęty, ale sesja nie została potwierdzona. Spróbuj ponownie.');
    } catch (err) {
      setError(getMfaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [supabase, recheck, sessionUser]);

  return { status, busy, error, verify, recheck };
}
