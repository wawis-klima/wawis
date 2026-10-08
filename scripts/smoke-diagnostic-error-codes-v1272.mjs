import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getSafeDiagnosticDetails } from '../src/modules/diagnostic-error-codes.js';

const cases = [
  [{ type: 'console.error', module: 'data.refresh', payload: { args: ['refreshAll failed', { name: 'TypeError', message: 'Failed to fetch' }] } }, 'NETWORK_FETCH_FAILED'],
  [{ type: 'console.error', module: 'data.refresh', payload: { args: ['refreshAll failed', { code: 'APP_REFRESH_TIMEOUT', message: 'Limit czasu' }] } }, 'APP_REFRESH_TIMEOUT'],
  [{ type: 'console.error', module: 'data.refresh', payload: { args: ['refreshAll failed', { code: 'SUPABASE_REQUEST_TIMEOUT', message: 'Request timeout' }] } }, 'SUPABASE_REQUEST_TIMEOUT'],
  [{ type: 'console.warn', module: 'network', payload: { args: [{ message: 'canceling statement due to statement timeout', code: '57014' }] } }, 'DB_STATEMENT_TIMEOUT'],
  [{ type: 'window.error', payload: { message: 'Failed to fetch dynamically imported module: https://example.invalid/private' } }, 'NETWORK_MODULE_FETCH_FAILED'],
  [{ type: 'console.warn', payload: { args: ['AbortError: Fetch is aborted'] } }, 'NETWORK_REQUEST_ABORTED'],
  [{ type: 'console.warn', payload: { args: ['Could not query the database for the schema cache. Retrying.'] } }, 'POSTGREST_SCHEMA_CACHE'],
  [{ type: 'console.error', payload: { args: ['HTTP 503 from Supabase'] } }, 'HTTP_SERVER_ERROR'],
  [{ type: 'console.error', payload: { error: { code: 'SESSION_REFRESH_FAILED', message: 'failed to refresh session' } } }, 'AUTH_REFRESH_FAILED'],
  [{ type: 'console.warn', payload: { message: 'photo.thumbnail.load.retry' } }, 'PHOTO_THUMBNAIL_RETRY'],
  [{ type: 'console.warn', payload: { args: ['Nie udało się zsynchronizować subskrypcji push'] } }, 'PUSH_SUBSCRIPTION_SYNC_FAILED'],
  [{ type: 'console.error', payload: { args: ['Client Jan Kowalski 606553984 client@example.com at https://example.test/secret?token=abc'] } }, 'DIAGNOSTIC_UNCLASSIFIED'],
];

for (const [entry, expected] of cases) {
  const { code, message } = getSafeDiagnosticDetails(entry);
  assert.equal(code, expected, JSON.stringify(entry));
  assert.match(code, /^[A-Z][A-Z0-9_]{3,63}$/);
  assert(message && !/Kowalski|606553984|client@|https?:|token=|example\.test/i.test(message), 'Brak danych osobowych w opisie zdarzenia');
}
assert.equal(getSafeDiagnosticDetails({ type: 'console.error', payload: { args: ['refreshAll failed', { code: 'CLIENT_ID_ABC', message: 'Jan Kowalski' }] } }).code, 'DIAGNOSTIC_UNCLASSIFIED');

for (const file of ['src/modules/diagnostics.js', 'src/mobile791/modules/diagnostics.js']) {
  const src = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(src, /getSafeDiagnosticDetails\(entry\)\.code/);
  assert.match(src, /getSafeDiagnosticDetails\(entry\)\.message/);
  assert.doesNotMatch(src, /getRemoteErrorMessage\(entry\)/);
}
const panel = fs.readFileSync(new URL('../src/components/diagnostics/DiagnosticsPanel.jsx', import.meta.url), 'utf8');
assert.match(panel, /entry\.errorCode/);

console.log('PASS WAWIS 12.72 — kody diagnostyczne zachowują przyczynę i nie wysyłają PII.');
