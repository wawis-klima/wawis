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
  PHOTO_QUEUE_UNAVAILABLE: 'Lokalna kolejka zdjęć (IndexedDB) jest niedostępna na urządzeniu.',
  PHOTO_QUEUE_VERSION_MISMATCH: 'Lokalna kolejka zdjęć ma wyższą wersję niż obsługiwana przez aplikację (VersionError).',
  PHOTO_QUEUE_BLOCKED: 'Aktualizacja lub czyszczenie lokalnej kolejki zdjęć czeka na zamknięcie innego okna aplikacji.',
  PHOTO_QUEUE_TIMEOUT: 'Otwarcie lokalnej kolejki zdjęć przekroczyło limit czasu.',
  PHOTO_QUEUE_QUOTA: 'Brak miejsca w pamięci urządzenia na zapis zdjęcia.',
  PHOTO_QUEUE_OPEN_FAILED: 'Nie udało się otworzyć lokalnej kolejki zdjęć.',
  PHOTO_QUEUE_READ_FAILED: 'Nie udało się odczytać lokalnej kolejki zdjęć.',
  PHOTO_QUEUE_WRITE_FAILED: 'Nie udało się zapisać w lokalnej kolejce zdjęć.',
  PHOTO_QUEUE_RESET_FAILED: 'Czyszczenie lokalnej kolejki zdjęć nie zostało potwierdzone.',
  PHOTO_QUEUE_RESET_DONE: 'Użytkownik wyczyścił lokalną kolejkę niewysłanych zdjęć (Napraw kolejkę zdjęć).',
  PHOTO_QUEUE_LEGACY_HOLD: 'Stare zdjęcia z kolejki v4 (13.42–13.48) wstrzymane do decyzji użytkownika — nie wysyłają się automatycznie.',
  PHOTO_QUEUE_LEGACY_RELEASED: 'Użytkownik zdecydował o wysłaniu starych zdjęć z kolejki v4.',
  PHOTO_QUEUE_LEGACY_DELETED: 'Użytkownik usunął stare, niewysłane zdjęcia z kolejki v4.',
  // 13.83: stałe kody etapów aplikacji (dopasowanie po stałych tekstach z kodu WAWIS, nigdy po danych).
  PHOTO_SIGNED_URL_FAILED: 'Nie udało się przygotować bezpiecznego linku do zdjęcia.',
  PHOTO_THUMBNAIL_REFRESH_FAILED: 'Nie udało się odświeżyć miniatury zdjęcia.',
  PHOTO_PREVIEW_LOAD_FAILED: 'Nie udało się wczytać pełnego zdjęcia do podglądu.',
  PHOTO_COMPRESS_SKIPPED: 'Kompresja zdjęcia pominięta — wysłano oryginał.',
  PHOTO_SERVER_CHECK_FAILED: 'Nie udało się sprawdzić, czy zdjęcie jest już na serwerze.',
  PHOTO_RECONCILE_REFRESH_FAILED: 'Nie udało się odświeżyć karty po uzgodnieniu zdjęcia z serwerem.',
  PHOTO_UPLOAD_FAILED: 'Wysyłka zdjęcia zakończyła się błędem.',
  PHOTO_SYNC_START_FAILED: 'Nie udało się uruchomić synchronizacji zdjęć.',
  JOB_DETAILS_RETRY: 'Chwilowy błąd pobierania szczegółów montażu — ponowiono automatycznie.',
  JOB_DETAILS_BACKGROUND_FAILED: 'Odświeżenie szczegółów montażu w tle nie powiodło się — zachowano poprzednie dane.',
  JOB_DETAILS_FAILED: 'Nie udało się pobrać szczegółów montażu.',
  NETWORK_OFFLINE: 'Urządzenie przeszło w tryb bez internetu.',
  NAMEPLATE_SAVE_FAILED: 'Zapis tabliczki nie powiódł się.',
  NAMEPLATE_OPEN_REFRESH_FAILED: 'Nie udało się odświeżyć danych przy otwarciu tabliczek.',
  NAMEPLATE_UPLOAD_TIMEOUT: 'Wysyłka zdjęcia tabliczki przekroczyła limit czasu.',
  NAMEPLATE_VERIFY_TIMEOUT: 'Potwierdzenie zapisu tabliczki przekroczyło limit czasu.',
  APP_REFRESH_PARTIAL: 'Lista montaży odświeżona; dane poboczne ponowią się automatycznie.',
  APP_REFRESH_FAILED: 'Odświeżanie danych nie powiodło się.',
  APP_START_FAILED: 'Nie udało się uruchomić aplikacji.',
  AUTH_LOCK_TIMEOUT: 'Biblioteka logowania czekała na zwolnienie blokady sesji (inna karta lub wolne urządzenie).',
  AUTH_SIGNOUT_WARNING: 'Wylogowanie zakończone lokalnie (serwer nie potwierdził).',
  PUSH_SEND_FAILED: 'Nie udało się wysłać powiadomienia PUSH.',
  PUSH_SIGNOUT_FAILED: 'Nie udało się wyłączyć powiadomień PUSH przy wylogowaniu.',
  NOTIFICATION_CREATE_FAILED: 'Nie udało się utworzyć powiadomienia w aplikacji.',
  NOTIFICATION_MARK_READ_FAILED: 'Nie udało się oznaczyć powiadomienia jako przeczytane.',
  DIAGNOSTIC_UNCLASSIFIED: 'Niesklasyfikowane zdarzenie techniczne; sprawdź kontekst zdarzenia.',
});

// 13.83: rodzaj zdarzenia lub stały początek komunikatu z kodu WAWIS → kod etapu. Używane tylko wtedy, gdy
// przyczyna (sieć, limit czasu, serwer) nie została rozpoznana wyżej — nie zmienia dotychczasowej klasyfikacji.
const STAGE_PATTERNS = Object.freeze([
  [/^job\.details\.retry\b|chwilowy błąd szczegółów montażu/, 'JOB_DETAILS_RETRY'],
  [/tło szczegółów montażu nie odświeżyło się/, 'JOB_DETAILS_BACKGROUND_FAILED'],
  [/^job\.details\.failed\b/, 'JOB_DETAILS_FAILED'],
  [/^network\.offline\b/, 'NETWORK_OFFLINE'],
  [/^nameplate\.save\.upload\.timeout\b/, 'NAMEPLATE_UPLOAD_TIMEOUT'],
  [/^nameplate\.save\.verify\.timeout\b/, 'NAMEPLATE_VERIFY_TIMEOUT'],
  [/^nameplate\.save\.failed\b/, 'NAMEPLATE_SAVE_FAILED'],
  [/^nameplate\.open\.refresh\.failed\b/, 'NAMEPLATE_OPEN_REFRESH_FAILED'],
  [/nie udało się wygenerować signed url dla zdjęcia/, 'PHOTO_SIGNED_URL_FAILED'],
  [/nie udało się odświeżyć miniatury zdjęcia/, 'PHOTO_THUMBNAIL_REFRESH_FAILED'],
  [/nie udało się wczytać pełnego zdjęcia do podglądu/, 'PHOTO_PREVIEW_LOAD_FAILED'],
  [/kompresja zdjęcia pominięta|\[photo_compress_timeout\]/, 'PHOTO_COMPRESS_SKIPPED'],
  [/nie udało się sprawdzić, czy zdjęcie jest już w systemie/, 'PHOTO_SERVER_CHECK_FAILED'],
  [/po uzgodnieniu zdjęcia z serwerem/, 'PHOTO_RECONCILE_REFRESH_FAILED'],
  [/kolejka zdjęć: upload zakończył się błędem/, 'PHOTO_UPLOAD_FAILED'],
  [/kolejka zdjęć: nie udało się uruchomić cichej synchronizacji|centrum synchronizacji zdjęć/, 'PHOTO_SYNC_START_FAILED'],
  [/\brefreshall partial\b/, 'APP_REFRESH_PARTIAL'],
  [/\brefreshall failed\b/, 'APP_REFRESH_FAILED'],
  [/nie udało się uruchomić aplikacji wawis/, 'APP_START_FAILED'],
  [/lock ["'“]?[^ ]*["'”]? (?:was not released|acquisition|could not be acquired)|navigator ?lock/, 'AUTH_LOCK_TIMEOUT'],
  [/wylogowanie (?:lokalne )?supabase zakończone/, 'AUTH_SIGNOUT_WARNING'],
  [/push o (?:przypisaniu|zakończeniu zlecenia)/, 'PUSH_SEND_FAILED'],
  [/wyłączyć push przed wylogowaniem|dokończyć poprzedniego wylogowania push/, 'PUSH_SIGNOUT_FAILED'],
  [/\bcreatenotification failed\b/, 'NOTIFICATION_CREATE_FAILED'],
  [/\bmarknotificationasread failed\b/, 'NOTIFICATION_MARK_READ_FAILED'],
]);

export function getKnownDiagnosticCodeDetails(code) {
  return Object.prototype.hasOwnProperty.call(DESCRIPTIONS, String(code || ''))
    ? { code: String(code), message: DESCRIPTIONS[String(code)] }
    : null;
}

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
  const safeExistingCode = normalizedCodes.find((candidate) => getKnownDiagnosticCodeDetails(candidate));

  if (safeExistingCode) {
    code = safeExistingCode;
  } else if (/failed to fetch dynamically imported module|importing a module script failed/.test(text)) {
    code = 'NETWORK_MODULE_FETCH_FAILED';
  } else if (/requested version \(\d+\) is less than the existing version|versionerror/.test(text)) {
    code = 'PHOTO_QUEUE_VERSION_MISMATCH';
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
  } else if (/\b5\d\d\b|http.*(?:500|502|503|504)|bad gateway|service unavailable/.test(text)) {
    code = 'HTTP_SERVER_ERROR';
  } else if (/photo\.thumbnail\.load\.retry/.test(text)) {
    code = 'PHOTO_THUMBNAIL_RETRY';
  } else if (/photo\.thumbnail\.load\.failed/.test(text)) {
    code = 'PHOTO_THUMBNAIL_FAILED';
  } else if (/subskrypcji push|push subscription.*(?:failed|error)/.test(text)) {
    code = 'PUSH_SUBSCRIPTION_SYNC_FAILED';
  } else if (/aborterror|fetch is aborted|signal is aborted|request aborted|operation was aborted/.test(text)) {
    code = 'NETWORK_REQUEST_ABORTED';
  } else if (/failed to fetch|load failed|networkerror|network request failed|fetch failed/.test(text)) {
    code = 'NETWORK_FETCH_FAILED';
  } else {
    const stage = STAGE_PATTERNS.find(([pattern]) => pattern.test(text));
    if (stage) code = stage[1];
  }

  return { code, message: DESCRIPTIONS[code] };
}
