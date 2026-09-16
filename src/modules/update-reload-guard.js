const activeBlockers = new Set();
let pendingReload = null;
let reloadTimerId = null;
let beforeUnloadInstalled = false;

function getWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function dispatchGuardEvent(type, detail = {}) {
  const windowRef = getWindow();
  if (!windowRef?.dispatchEvent || typeof CustomEvent === 'undefined') return;
  try {
    windowRef.dispatchEvent(new CustomEvent(type, { detail }));
  } catch {
    // Telemetria UI nie może wpływać na ochronę niezapisanej pracy.
  }
}

function handleBeforeUnload(event) {
  if (!activeBlockers.size) return undefined;
  event?.preventDefault?.();
  if (event) event.returnValue = '';
  return '';
}

function syncBeforeUnloadGuard() {
  const windowRef = getWindow();
  if (!windowRef?.addEventListener || !windowRef?.removeEventListener) return;

  if (activeBlockers.size > 0 && !beforeUnloadInstalled) {
    windowRef.addEventListener('beforeunload', handleBeforeUnload);
    beforeUnloadInstalled = true;
    return;
  }

  if (activeBlockers.size === 0 && beforeUnloadInstalled) {
    windowRef.removeEventListener('beforeunload', handleBeforeUnload);
    beforeUnloadInstalled = false;
  }
}

function scheduleReload(reason, delayMs = 0) {
  const windowRef = getWindow();
  if (!windowRef?.location || typeof windowRef.location.reload !== 'function') return false;
  if (reloadTimerId !== null) return true;

  pendingReload = null;
  const safeDelay = Math.max(0, Number(delayMs) || 0);
  const schedule = typeof windowRef.setTimeout === 'function'
    ? windowRef.setTimeout.bind(windowRef)
    : setTimeout;

  reloadTimerId = schedule(() => {
    reloadTimerId = null;
    dispatchGuardEvent('wawis:update-reload-start', { reason });
    windowRef.location.reload();
  }, safeDelay);
  return true;
}

export function blockUpdateReload(reason = 'unsaved-work') {
  const token = Symbol(String(reason || 'unsaved-work'));
  activeBlockers.add(token);
  syncBeforeUnloadGuard();
  dispatchGuardEvent('wawis:update-reload-blocked', {
    reason,
    blockers: activeBlockers.size,
  });

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeBlockers.delete(token);
    syncBeforeUnloadGuard();
    dispatchGuardEvent('wawis:update-reload-unblocked', {
      reason,
      blockers: activeBlockers.size,
    });

    if (activeBlockers.size === 0 && pendingReload) {
      const deferred = pendingReload;
      pendingReload = null;
      scheduleReload(deferred.reason, 0);
    }
  };
}

export function requestUpdateReload(reason = 'update', { delayMs = 0 } = {}) {
  if (activeBlockers.size > 0) {
    pendingReload = {
      reason: String(reason || 'update'),
      requestedAt: Date.now(),
    };
    dispatchGuardEvent('wawis:update-reload-deferred', {
      reason: pendingReload.reason,
      blockers: activeBlockers.size,
    });
    return false;
  }

  return scheduleReload(String(reason || 'update'), delayMs);
}

export function hasUpdateReloadBlockers() {
  return activeBlockers.size > 0;
}

export function getUpdateReloadGuardState() {
  return {
    blockers: activeBlockers.size,
    pending: Boolean(pendingReload),
    pendingReason: pendingReload?.reason || '',
    reloadScheduled: reloadTimerId !== null,
  };
}

export function __resetUpdateReloadGuardForTests() {
  activeBlockers.clear();
  pendingReload = null;
  reloadTimerId = null;
  syncBeforeUnloadGuard();
}
