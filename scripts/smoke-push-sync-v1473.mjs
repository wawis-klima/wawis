// WAWIS 14.73 — PUSH: równoległe sprawdzanie stanu nie zostawia nieobsłużonego błędu; Diagnostyka zachowuje ślad.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getSafeDiagnosticDetails } from '../src/modules/diagnostic-error-codes.js';
import { sanitizeDiagnosticEntry } from '../src/modules/diagnostic-privacy.js';
import { FINGERPRINTS } from './diagnostic-fingerprint-lookup.mjs';

for (const file of ['src/hooks/usePushNotificationsState.js', 'src/mobile791/hooks/usePushNotificationsState.js']) {
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /if \(syncInFlightRef\.current\) return syncInFlightRef\.current\.catch\(\(\) => readStoredPushState\(userId\)\);/, `${file}: obsłużona obietnica dla równoległego wywołania`);
  assert.doesNotMatch(src, /return syncInFlightRef\.current;/, `${file}: bez surowej obietnicy`);
}

// Symulacja: trzy równoległe wywołania, sprawdzenie kończy się błędem → brak nieobsłużonych odrzuceń.
let unhandled = 0;
const onUnhandled = () => { unhandled += 1; };
process.on('unhandledRejection', onUnhandled);
{
  const ref = { current: null };
  const stored = { ok: 'zapisany stan' };
  async function sync() {
    if (ref.current) return ref.current.catch(() => stored);
    const p = (async () => { await new Promise((r) => setTimeout(r, 5)); throw new Error('Przekroczono limit czasu operacji PUSH: push-subscription-read.'); })();
    ref.current = p;
    try { return await p; } catch { return stored; } finally { if (ref.current === p) ref.current = null; }
  }
  void sync(); void sync(); const results = await Promise.all([sync(), sync()]);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(results, [stored, stored]);
}
process.off('unhandledRejection', onUnhandled);
assert.equal(unhandled, 0, 'brak nieobsłużonych odrzuceń');

// Przyczyna: limit czasu PUSH ma własny kod (przed ogólnym „nie udało się sprawdzić stanu”).
assert.equal(getSafeDiagnosticDetails({ type: 'console.warn', payload: { args: ['Nie udało się sprawdzić stanu PUSH:', 'Przekroczono limit czasu operacji PUSH: push-subscription-read.'] } }).code, 'PUSH_LIFECYCLE_TIMEOUT');

// Ślad przechodzi bez zmian przez lokalny dziennik (oczyszczenie) do wysyłki.
const raw = { type: 'window.unhandledrejection', payload: { reason: { name: 'Error', message: 'Nowy błąd PUSH 7' } }, module: 'push', app_version: '14.73', platform: 'mobile' };
const first = getSafeDiagnosticDetails(raw);
const uploaded = getSafeDiagnosticDetails(sanitizeDiagnosticEntry(raw));
assert.equal(uploaded.message, first.message, 'ślad po oczyszczeniu = ślad pierwotny');
assert.ok(FINGERPRINTS.some(([, , text]) => /Przekroczono limit czasu operacji PUSH/.test(text)), 'tabela śladów obejmuje komunikaty błędów');

console.log('PASS WAWIS 14.73 — równoległe sprawdzanie PUSH bez nieobsłużonych błędów; ślad zachowany; limit czasu PUSH z własnym kodem.');
