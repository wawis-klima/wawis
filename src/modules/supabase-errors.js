export const TRANSIENT_SUPABASE_MESSAGE = 'Serwer chwilowo przeciążony — spróbuj ponownie';

const TRANSIENT_HTTP_STATUSES = new Set([500, 502, 503, 504]);
const AUTHORIZATION_HTTP_STATUSES = new Set([401, 403]);

function collectErrorValues(error, seen = new Set()) {
  if (error == null || seen.has(error)) return [];
  if (typeof error !== 'object') return [error];

  seen.add(error);
  const values = [
    error.status,
    error.statusCode,
    error.httpStatusCode,
    error.code,
    error.message,
    error.details,
    error.hint,
    error.name,
  ];

  for (const nested of [error.context, error.response, error.cause, error.error, error.payload]) {
    values.push(...collectErrorValues(nested, seen));
  }

  return values.filter((value) => value != null && value !== '');
}

export function getSupabaseErrorStatus(error) {
  for (const value of collectErrorValues(error)) {
    const numericValue = Number(value);
    if (Number.isInteger(numericValue) && numericValue >= 100 && numericValue <= 599) {
      return numericValue;
    }
  }
  return 0;
}

function getSupabaseErrorText(error) {
  return collectErrorValues(error)
    .map((value) => String(value).toLowerCase())
    .join(' ');
}

export function isTransientSupabaseError(error) {
  const status = getSupabaseErrorStatus(error);
  if (TRANSIENT_HTTP_STATUSES.has(status)) return true;
  if (AUTHORIZATION_HTTP_STATUSES.has(status)) return false;

  const text = getSupabaseErrorText(error);
  return [
    'request_timeout',
    'request timeout',
    'timed out',
    'timeout',
    'statement timeout',
    'context deadline exceeded',
    'unexpected_failure',
    'service unavailable',
    'bad gateway',
    'gateway timeout',
    'failed to connect',
    'connection timed out',
    'connection reset',
    'too many connections',
    'networkerror',
    'network request failed',
    'failed to fetch',
    'fetch resource',
    'load failed',
  ].some((marker) => text.includes(marker));
}

export function isJwtExpiredError(error) {
  const text = getSupabaseErrorText(error);
  return [
    'jwt expired',
    'expired jwt',
    'token has expired',
    'token is expired',
    'pgrst301',
  ].some((marker) => text.includes(marker));
}

export function isSupabaseAuthorizationError(error) {
  const status = getSupabaseErrorStatus(error);
  if (AUTHORIZATION_HTTP_STATUSES.has(status)) return true;
  if (TRANSIENT_HTTP_STATUSES.has(status)) return false;

  const text = getSupabaseErrorText(error);
  return [
    'invalid_jwt',
    'jwt expired',
    'not authorized',
    'unauthorized',
    'permission denied',
    'insufficient_privilege',
    'row-level security',
    '42501',
    'pgrst301',
  ].some((marker) => text.includes(marker));
}

export function getSupabaseUserMessage(error, fallbackMessage = 'Wystąpił nieznany błąd.') {
  if (isTransientSupabaseError(error)) return TRANSIENT_SUPABASE_MESSAGE;
  if (isJwtExpiredError(error)) return 'Sesja wygasła — zaloguj się ponownie.';
  if (!error) return fallbackMessage;
  if (typeof error === 'string') return error || fallbackMessage;
  return error.message || error.details || error.hint || fallbackMessage;
}
