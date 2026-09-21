const activeReloadBlockers = new Set();
const activeBeforeUnloadWarnings = new Set();
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
  if (!activeBeforeUnloadWarnings.size) return undefined;
  event?.preventDefault?.();
  if (event) event.returnValue = '';
  return '';
}

function syncBeforeUnloadGuard() {
  const windowRef = getWindow();
  if (!windowRef?.addEventListener || !windowRef?.removeEventListener) return;

  if (activeBeforeUnloadWarnings.size > 0 && !beforeUnloadInstalled) {
    windowRef.addEventListener('beforeunload', handleBeforeUnload);
    beforeUnloadInstalled = true;
    return;
  }

  if (activeBeforeUnloadWarnings.size === 0 && beforeUnloadInstalled) {
    windowRef.removeEventListener('beforeunload', handleBeforeUnload);
    beforeUnloadInstalled = false;
  }
}

function rememberPendingReload(reason) {
  if (!pendingReload) {
    pendingReload = {
      reason: String(reason || 'update'),
      requestedAt: Date.now(),
    };
  }
  return pendingReload;
}

function scheduleReload(reason, delayMs = 0) {
  const windowRef = getWindow();
  if (!windowRef?.location || typeof windowRef.location.reload !== 'function') return false;
  if (reloadTimerId !== null) return true;

  const safeReason = String(reason || 'update');
  pendingReload = null;
  const safeDelay = Math.max(0, Number(delayMs) || 0);
  const schedule = typeof windowRef.setTimeout === 'function'
    ? windowRef.setTimeout.bind(windowRef)
    : setTimeout;

  reloadTimerId = schedule(() => {
    reloadTimerId = null;
    if (activeReloadBlockers.size > 0) {
      const deferred = rememberPendingReload(safeReason);
      dispatchGuardEvent('wawis:update-reload-deferred', {
        reason: deferred.reason,
        blockers: activeReloadBlockers.size,
      });
      return;
    }
    pendingReload = null;
    dispatchGuardEvent('wawis:update-reload-start', { reason: safeReason });
    windowRef.location.reload();
  }, safeDelay);
  return true;
}

function createToken(set, reason) {
  const token = Symbol(String(reason || 'unsaved-work'));
  set.add(token);
  let released = false;
  return {
    token,
    release() {
      if (released) return false;
      released = true;
      set.delete(token);
      return true;
    },
  };
}

export function blockUpdateReload(reason = 'unsaved-work') {
  const blocker = createToken(activeReloadBlockers, reason);
  dispatchGuardEvent('wawis:update-reload-blocked', {
    reason,
    blockers: activeReloadBlockers.size,
  });

  return () => {
    if (!blocker.release()) return;
    dispatchGuardEvent('wawis:update-reload-unblocked', {
      reason,
      blockers: activeReloadBlockers.size,
    });

    if (activeReloadBlockers.size === 0 && pendingReload && reloadTimerId === null) {
      const deferred = pendingReload;
      pendingReload = null;
      scheduleReload(deferred.reason, 0);
    }
  };
}

export function blockBeforeUnload(reason = 'unsaved-work') {
  const warning = createToken(activeBeforeUnloadWarnings, reason);
  syncBeforeUnloadGuard();
  return () => {
    if (!warning.release()) return;
    syncBeforeUnloadGuard();
  };
}

export function blockUnsavedWork(reason = 'unsaved-work') {
  const releaseReload = blockUpdateReload(reason);
  const releaseBeforeUnload = blockBeforeUnload(reason);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseBeforeUnload();
    releaseReload();
  };
}

export function requestUpdateReload(reason = 'update', { delayMs = 0 } = {}) {
  if (activeReloadBlockers.size > 0) {
    const deferred = rememberPendingReload(reason);
    dispatchGuardEvent('wawis:update-reload-deferred', {
      reason: deferred.reason,
      blockers: activeReloadBlockers.size,
    });
    return false;
  }

  return scheduleReload(String(reason || 'update'), delayMs);
}

export function hasUpdateReloadBlockers() {
  return activeReloadBlockers.size > 0;
}

export function getUpdateReloadGuardState() {
  return {
    blockers: activeReloadBlockers.size,
    beforeUnloadWarnings: activeBeforeUnloadWarnings.size,
    pending: Boolean(pendingReload),
    pendingReason: pendingReload?.reason || '',
    reloadScheduled: reloadTimerId !== null,
  };
}

export function __resetUpdateReloadGuardForTests() {
  const windowRef = getWindow();
  if (reloadTimerId !== null) {
    const clear = typeof windowRef?.clearTimeout === 'function'
      ? windowRef.clearTimeout.bind(windowRef)
      : clearTimeout;
    try { clear(reloadTimerId); } catch { /* tylko testy */ }
  }
  activeReloadBlockers.clear();
  activeBeforeUnloadWarnings.clear();
  pendingReload = null;
  reloadTimerId = null;
  syncBeforeUnloadGuard();
}
