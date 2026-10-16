// Gwarantuje zakończenie próby także wtedy, gdy klient HTTP ignoruje AbortSignal.
export async function runWithAbortableDeadline(startRequest, { timeoutMs, controller = null } = {}) {
  if (typeof startRequest !== 'function') throw new TypeError('startRequest must be a function');
  const waitMs = Number(timeoutMs);
  if (!Number.isFinite(waitMs) || waitMs <= 0) throw new RangeError('timeoutMs must be positive');
  let timerId = null;
  const timedOut = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      try { controller?.abort?.(); } catch { /* Deadline nadal musi odrzucić Promise. */ }
      const error = new Error('Przekroczono czas pobierania szczegółów montażu.');
      error.name = 'AbortError';
      reject(error);
    }, waitMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => startRequest(controller?.signal || null)),
      timedOut,
    ]);
  } finally {
    if (timerId !== null) clearTimeout(timerId);
  }
}
