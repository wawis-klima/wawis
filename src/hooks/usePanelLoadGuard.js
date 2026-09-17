import { useLayoutEffect, useRef } from 'react';
import { createAsyncScope } from '../modules/async-scope.js';

export function usePanelLoadGuard(supabase, userId) {
  const holder = useRef(null);
  if (!holder.current || holder.current.userId !== userId || holder.current.supabase !== supabase) {
    holder.current?.scope.close();
    holder.current = { userId, supabase, scope: createAsyncScope() };
  }
  const scope = holder.current.scope;
  useLayoutEffect(() => {
    scope.open();
    const listener = supabase?.auth?.onAuthStateChange?.((event, session) => {
      if (event === 'SIGNED_OUT' || String(session?.user?.id || '') !== String(userId || '')) scope.close();
    });
    return () => { scope.close(); listener?.data?.subscription?.unsubscribe(); };
  }, [scope, supabase, userId]);
  return scope;
}
