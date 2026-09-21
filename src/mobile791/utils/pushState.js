export const INITIAL_PUSH_STATE = {
  supported: false,
  permission: "default",
  subscribed: false,
  serverRegistered: false,
  serverActive: false,
  lastSeenAt: null,
  syncError: null,
  vapidConfigured: false,
  ready: false,
  userEnabled: true,
  statusKnown: false,
};

// Mini-przełącznik pokazuje intencję użytkownika, a nie chwilowy wynik
// kontroli serwera. Przyznana zgoda systemowa i brak ręcznego OFF oznaczają
// wizualne ON także wtedy, gdy aplikacja właśnie naprawia subskrypcję w tle.
export function isPushDisplayOn(pushState) {
  if (!pushState || pushState.userEnabled === false || pushState.statusKnown !== true) return false;
  if (pushState.ready === true) return true;
  return Boolean(
    pushState.supported
      && pushState.vapidConfigured
      && pushState.permission === "granted"
  );
}
