export const PROTOCOL_SAVE_STEP_TIMEOUT_MS = 15_000;
export const PROTOCOL_SAVE_UPLOAD_TIMEOUT_MS = 30_000;
export const PROTOCOL_SAVE_TOTAL_TIMEOUT_MS = 45_000;
export const PROTOCOL_SAVE_TIMEOUT_MESSAGE = "Zapisywanie protokołu trwa zbyt długo. Ekran został odblokowany. Sprawdź połączenie i spróbuj ponownie.";

function resolvePhase(phase) {
  const value = typeof phase === "function" ? phase() : phase;
  return String(value || "save").trim() || "save";
}

export function createProtocolSaveTimeoutError({ phase = "save", timeoutMs = PROTOCOL_SAVE_STEP_TIMEOUT_MS } = {}) {
  const error = new Error(PROTOCOL_SAVE_TIMEOUT_MESSAGE);
  error.name = "ProtocolSaveTimeoutError";
  error.code = "PROTOCOL_SAVE_TIMEOUT";
  error.phase = resolvePhase(phase);
  error.timeoutMs = timeoutMs;
  return error;
}

export function isProtocolSaveTimeoutError(error) {
  return error?.code === "PROTOCOL_SAVE_TIMEOUT" || error?.name === "ProtocolSaveTimeoutError";
}

export async function withProtocolSaveTimeout(
  promiseLike,
  { phase = "save", timeoutMs = PROTOCOL_SAVE_STEP_TIMEOUT_MS, onTimeout = null } = {},
) {
  const safeTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : PROTOCOL_SAVE_STEP_TIMEOUT_MS;
  let timeoutId;

  try {
    return await Promise.race([
      Promise.resolve(promiseLike),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          try {
            onTimeout?.();
          } catch {
            // Timeout musi odblokować ekran również wtedy, gdy anulowanie żądania nie jest obsługiwane.
          }
          reject(createProtocolSaveTimeoutError({ phase, timeoutMs: safeTimeoutMs }));
        }, safeTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}


export function isTransientProtocolBackendError(error) {
  if (isProtocolSaveTimeoutError(error)) return true;
  const status = Number(error?.status || error?.statusCode || error?.status_code || 0);
  if (status >= 500 && status <= 599) return true;
  const code = String(error?.code || "").trim().toUpperCase();
  if (["502", "503", "504", "PGRST000", "PGRST001", "PGRST002"].includes(code)) return true;
  const message = String(error?.message || error || "").toLowerCase();
  return /timeout|timed out|network|fetch failed|load failed|connection|warp server|temporarily unavailable|bad gateway|service unavailable|gateway timeout|aborterror/.test(message);
}

export async function retryTransientProtocolOperation(
  operation,
  { attempts = 2, delayMs = 650, onRetry = null } = {},
) {
  const safeAttempts = Math.max(1, Math.min(3, Number(attempts) || 1));
  let lastError;
  for (let attempt = 1; attempt <= safeAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= safeAttempts || !isTransientProtocolBackendError(error)) throw error;
      try { onRetry?.({ attempt, nextAttempt: attempt + 1, error }); } catch {}
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
    }
  }
  throw lastError;
}
