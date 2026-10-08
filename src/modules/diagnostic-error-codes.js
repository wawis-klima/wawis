// Znormalizowane kody diagnostyczne: nigdy nie wysyłamy swobodnej treści błędu,
// adresów URL, danych klientów ani stack trace do centralnej bazy.
const DESCRIPTIONS = Object.freeze({
  APP_REFRESH_TIMEOUT: 'Odświeżanie danych przekroczyło limit czasu.',
  SUPABASE_REQUEST_TIMEOUT: 'Żądanie do bazy przekroczyło limit czasu.',
  DB_STATEMENT_TIMEOUT: 'Zapytanie PostgreSQL przekroczyło limit czasu.',
  NETWORK_MODULE_FETCH_FAILED: 'Nie udało się pobrać części aplikacji.',
  NETWORK_REQUEST_ABORTED: 'Żądanie zostało przerwane.',
  NETWORK_FETCH_FAILED: 'Nie udało się nawiązać połączenia z serwerem.',
  POSTGREST_SCHEMA_CACHE: 'PostgREST nie mógł odczytać schematu bazy.',
  AUTH_SESSION_EXPIRED: 'Sesja użytkownika wygasła.',
  AUTH_REFRESH_FAILED: 'Nie udało się odnowić sesji.',
  HTTP_SERVER_ERROR: 'Serwer zwrócił błąd 5xx.',
  HTTP_RATE_LIMIT: 'Serwer ograniczył liczbę żądań.',
  PHOTO_THUMBNAIL_RETRY: 'Ponowiono pobieranie miniatury zdjęcia.',
  PHOTO_THUMBNAIL_FAILED: 'Nie udało się pobrać miniatury zdjęcia.',
  PUSH_SUBSCRIPTION_SYNC_FAILED: 'Nie udało się zsynchronizować subskrypcji PUSH.',
  DIAGNOSTIC_UNCLASSIFIED: 'Niesklasyfikowane zdarzenie techniczne; sprawdź kontekst zdarzenia.',
});

// Czytamy wyłącznie wybrane pola. Celowo pomijamy stack i dowolne właściwości obiektów.
function technicalEvidence(entry = {}) {
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : {};
  const args = Array.isArray(payload.args) ? payload.args.slice(0, 8) : [];
  const sources = [payload, payload.error, payload.reason, ...args];
  const textParts = [entry.type, entry.event_type, entry.module, entry.diagnostic_module];
  const codes = [];

  for (const source of sources) {
    if (typeof source === 'string') {
      textParts.push(source.slice(0, 350));
      continue;
    }
    if (!source || typeof source !== 'object') continue;
    for (const field of ['name', 'message', 'reason']) {
      if (typeof source[field] === 'string') textParts.push(source[field].slice(0, 350));
    }
    if (typeof source.code === 'string') codes.push(source.code.slice(0, 80));
    if (source.error && typeof source.error === 'object') {
      if (typeof source.error.message === 'string') textParts.push(source.error.message.slice(0, 350));
      if (typeof source.error.code === 'string') codes.push(source.error.code.slice(0, 80));
    }
  }
  if (typeof entry.error_code === 'string') codes.push(entry.error_code.slice(0, 80));
  return { text: textParts.filter(Boolean).join(' ').toLowerCase().slice(0, 1800), codes };
}

export function getSafeDiagnosticDetails(entry = {}) {
  const { text, codes } = technicalEvidence(entry);
  const normalizedCodes = codes.map((code) => String(code).toUpperCase());
  const hasCode = (code) => normalizedCodes.includes(code);
  let code = 'DIAGNOSTIC_UNCLASSIFIED';

  if (/failed to fetch dynamically imported module|importing a module script failed/.test(text)) {
    code = 'NETWORK_MODULE_FETCH_FAILED';
  } else if (/canceling statement due to statement timeout|statement timeout|57014/.test(text) || hasCode('57014')) {
    code = 'DB_STATEMENT_TIMEOUT';
  } else if (hasCode('APP_REFRESH_TIMEOUT')) {
    code = 'APP_REFRESH_TIMEOUT';
  } else if (hasCode('SUPABASE_REQUEST_TIMEOUT')) {
    code = 'SUPABASE_REQUEST_TIMEOUT';
  } else if (/session_refresh_failed|refresh token.*(?:invalid|expired)|failed to refresh session/.test(text)
    || hasCode('SESSION_REFRESH_FAILED')) {
    code = 'AUTH_REFRESH_FAILED';
  } else if (/jwt expired|session expired|session.*wygas|invalid jwt/.test(text)) {
    code = 'AUTH_SESSION_EXPIRED';
  } else if (/schema cache|pgrst002/.test(text) || hasCode('PGRST002')) {
    code = 'POSTGREST_SCHEMA_CACHE';
  } else if (/429|rate limit|too many requests/.test(text)) {
    code = 'HTTP_RATE_LIMIT';
  } else if (/\\b5\\d\\d\\b|http.*(?:500|502|503|504)|bad gateway|service unavailable/.test(text)) {
    code = 'HTTP_SERVER_ERROR';
  } else if (/photo\\.thumbnail\\.load\\.retry/.test(text)) {
    code = 'PHOTO_THUMBNAIL_RETRY';
  } else if (/photo\\.thumbnail\\.load\\.failed/.test(text)) {
    code = 'PHOTO_THUMBNAIL_FAILED';
  } else if (/subskrypcji push|push subscription.*(?:failed|error)/.test(text)) {
    code = 'PUSH_SUBSCRIPTION_SYNC_FAILED';
  } else if (/aborterror|fetch is aborted|signal is aborted|request aborted|operation was aborted/.test(text)) {
    code = 'NETWORK_REQUEST_ABORTED';
  } else if (/failed to fetch|load failed|networkerror|network request failed|fetch failed/.test(text)) {
    code = 'NETWORK_FETCH_FAILED';
  }

  return { code, message: DESCRIPTIONS[code] };
}
