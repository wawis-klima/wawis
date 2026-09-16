export const MOBILE_SUPABASE_REQUEST_TIMEOUT_MS = 45 * 1000;
export const MOBILE_SUPABASE_STORAGE_TIMEOUT_MS = 90 * 1000;

function normalizeRequestUrl(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return String(input || '');
}

export function resolveSupabaseRequestTimeoutMs(input) {
  const url = normalizeRequestUrl(input);
  return /\/storage\/v1\/object\//i.test(url)
    ? MOBILE_SUPABASE_STORAGE_TIMEOUT_MS
    : MOBILE_SUPABASE_REQUEST_TIMEOUT_MS;
}

export function createSupabaseRequestTimeoutError(timeoutMs) {
  const error = new Error(`Supabase request timeout after ${Math.max(1, Number(timeoutMs) || 0)} ms.`);
  error.name = 'AbortError';
  error.code = 'SUPABASE_REQUEST_TIMEOUT';
  error.timeout_ms = Math.max(1, Number(timeoutMs) || 0);
  error.transient = true;
  return error;
}

export async function fetchWithTimeout(input, init = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  if (typeof fetchImpl !== 'function') throw new Error('Brak implementacji fetch dla Supabase.');

  const resolvedTimeout = Math.max(
    1,
    Number(options.timeoutMs || resolveSupabaseRequestTimeoutMs(input)) || MOBILE_SUPABASE_REQUEST_TIMEOUT_MS,
  );
  if (typeof AbortController === 'undefined') return fetchImpl(input, init);

  const controller = new AbortController();
  const externalSignal = init?.signal || null;
  let timeoutError = null;
  let detachExternalAbort = null;

  if (externalSignal) {
    const abortFromExternalSignal = () => {
      try {
        controller.abort(externalSignal.reason);
      } catch {
        controller.abort();
      }
    };
    if (externalSignal.aborted) abortFromExternalSignal();
    else if (typeof externalSignal.addEventListener === 'function') {
      externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
      detachExternalAbort = () => externalSignal.removeEventListener?.('abort', abortFromExternalSignal);
    }
  }

  const timeoutId = setTimeout(() => {
    timeoutError = createSupabaseRequestTimeoutError(resolvedTimeout);
    try {
      controller.abort(timeoutError);
    } catch {
      controller.abort();
    }
  }, resolvedTimeout);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timeoutError) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timeoutId);
    detachExternalAbort?.();
  }
}

export function createTimedSupabaseFetch(options = {}) {
  return (input, init = {}) => fetchWithTimeout(input, init, options);
}
