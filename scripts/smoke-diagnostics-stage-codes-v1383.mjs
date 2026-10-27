// WAWIS 13.83 — kody etapów dla zdarzeń dotąd „niesklasyfikowanych” (analiza produkcji 27.10.2026:
// ~650 zdarzeń w 14 dni bez przyczyny). Kody pochodzą wyłącznie ze stałych tekstów kodu WAWIS i rodzaju
// zdarzenia; przyczyny sieciowe/serwerowe mają pierwszeństwo; dane klientów nigdy nie trafiają do opisu.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getSafeDiagnosticDetails as classify, getKnownDiagnosticCodeDetails } from '../src/modules/diagnostic-error-codes.js';

const cases = [
  [{ type: 'job.details.retry', payload: { retry_count: 1, error: { code: 'DETAILS_TIMEOUT', message: 'Mobile job details transient read failed; retrying automatically.' } } }, 'JOB_DETAILS_RETRY'],
  [{ type: 'job.details.failed', payload: {} }, 'JOB_DETAILS_FAILED'],
  [{ type: 'console.warn', payload: { args: ['Tło szczegółów montażu nie odświeżyło się — zachowuję poprzednie dane.', 'x'] } }, 'JOB_DETAILS_BACKGROUND_FAILED'],
  [{ type: 'network.offline', payload: {} }, 'NETWORK_OFFLINE'],
  [{ type: 'nameplate.save.failed', payload: {} }, 'NAMEPLATE_SAVE_FAILED'],
  [{ type: 'nameplate.open.refresh.failed', payload: {} }, 'NAMEPLATE_OPEN_REFRESH_FAILED'],
  [{ type: 'nameplate.save.upload.timeout', payload: {} }, 'NAMEPLATE_UPLOAD_TIMEOUT'],
  [{ type: 'nameplate.save.verify.timeout', payload: {} }, 'NAMEPLATE_VERIFY_TIMEOUT'],
  [{ type: 'console.warn', payload: { args: ['Nie udało się wygenerować signed URL dla zdjęcia mobilnego:', 'Object not found'] } }, 'PHOTO_SIGNED_URL_FAILED'],
  [{ type: 'console.warn', payload: { args: ['Nie udało się odświeżyć miniatury zdjęcia mobilnego:', 'x'] } }, 'PHOTO_THUMBNAIL_REFRESH_FAILED'],
  [{ type: 'console.warn', payload: { args: ['Nie udało się wczytać pełnego zdjęcia do podglądu.', 'x'] } }, 'PHOTO_PREVIEW_LOAD_FAILED'],
  [{ type: 'console.warn', payload: { args: ['Mobilna kompresja zdjęcia pominięta — wysyłam oryginał.', 'x'] } }, 'PHOTO_COMPRESS_SKIPPED'],
  [{ type: 'console.warn', payload: { args: ['[PHOTO_COMPRESS_TIMEOUT] Kompresja zdjęcia trwała zbyt długo — wysyłka oryginału.'] } }, 'PHOTO_COMPRESS_SKIPPED'],
  [{ type: 'console.warn', payload: { args: ['Nie udało się sprawdzić, czy zdjęcie jest już w systemie.', 'x'] } }, 'PHOTO_SERVER_CHECK_FAILED'],
  [{ type: 'console.warn', payload: { args: ['Mobilna kolejka zdjęć: upload zakończył się błędem.', 'x'] } }, 'PHOTO_UPLOAD_FAILED'],
  [{ type: 'console.warn', payload: { args: ['@supabase/gotrue-js: Lock "lock:sb-ref-auth-token" was not released within 5000ms.'] } }, 'AUTH_LOCK_TIMEOUT'],
  [{ type: 'console.warn', payload: { args: ['Wylogowanie Supabase zakończone po lokalnym czyszczeniu sesji:', 'x'] } }, 'AUTH_SIGNOUT_WARNING'],
  [{ type: 'console.error', payload: { args: ['Nie udało się wysłać push o przypisaniu:', 'x'] } }, 'PUSH_SEND_FAILED'],
  [{ type: 'console.error', payload: { args: ['createNotification failed', { message: 'x' }] } }, 'NOTIFICATION_CREATE_FAILED'],
  [{ type: 'console.error', payload: { args: ['refreshAll failed', { message: 'x' }] } }, 'APP_REFRESH_FAILED'],
  [{ type: 'console.warn', payload: { args: ['refreshAll partial', { message: 'x' }] } }, 'APP_REFRESH_PARTIAL'],
  // Przyczyna ma pierwszeństwo przed etapem (dotychczasowa klasyfikacja bez zmian):
  [{ type: 'console.warn', payload: { args: ['Nie udało się wygenerować signed URL dla zdjęcia mobilnego:', 'TypeError: Load failed'] } }, 'NETWORK_FETCH_FAILED'],
  [{ type: 'console.warn', payload: { args: ['Chwilowy błąd szczegółów montażu — ponawiam automatycznie.', 'AbortError: signal is aborted without reason'] } }, 'NETWORK_REQUEST_ABORTED'],
  [{ type: 'console.warn', payload: { args: ['refreshAll partial', { code: 'APP_REFRESH_TIMEOUT', message: 'Limit' }] } }, 'APP_REFRESH_TIMEOUT'],
  // Dowolny tekst z danymi nadal bez kodu i bez danych:
  [{ type: 'console.error', payload: { args: ['Client Jan Kowalski 606553984 client@example.com at https://example.test/secret?token=abc'] } }, 'DIAGNOSTIC_UNCLASSIFIED'],
];
for (const [entry, expected] of cases) {
  const { code, message } = classify(entry);
  assert.equal(code, expected, JSON.stringify(entry));
  assert(getKnownDiagnosticCodeDetails(code), `kod ${code} musi mieć opis`);
  assert(message && !/Kowalski|606553984|client@|https?:|token=|example\.test|lock:sb/i.test(message), 'opis bez danych');
}

// Każdy stały tekst użyty w dopasowaniu nadal istnieje w kodzie aplikacji (zmiana tekstu = test czerwony).
const sources = ['src/mobile791/App.jsx', 'src/mobile791/modules/photos.js', 'src/modules/photos.js', 'src/mobile791/hooks/useAppSession.js', 'src/hooks/useAppSession.js']
  .filter((file) => fs.existsSync(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const literal of ['Chwilowy błąd szczegółów montażu', 'Tło szczegółów montażu nie odświeżyło się', 'Nie udało się wygenerować signed URL dla zdjęcia', "console.warn('refreshAll partial'", "console.error('refreshAll failed'"]) {
  assert(sources.includes(literal), `brak tekstu w kodzie: ${literal}`);
}
console.log(`PASS WAWIS 13.83 — ${cases.length} przypadków: kody etapów zamiast „niesklasyfikowane”, przyczyna sieciowa ma pierwszeństwo, bez danych osobowych.`);
