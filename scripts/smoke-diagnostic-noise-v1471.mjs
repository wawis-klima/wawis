// WAWIS 14.71 — mniej „niesklasyfikowanych” zdarzeń w Diagnostyce.
//   • każdy stały komunikat console.warn/error z kodu, który trafia do modułu PUSH, logowania lub kontrahentów,
//     ma własny kod (dotąd ~130 zdarzeń / 14 dni jako DIAGNOSTIC_UNCLASSIFIED);
//   • niesklasyfikowane zdarzenie dostaje „ślad” — skrót stałego komunikatu, bez jego treści i bez danych;
//   • ślad da się przetłumaczyć na komunikat z kodu (scripts/diagnostic-fingerprint-lookup.mjs).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { diagnosticFingerprint, getSafeDiagnosticDetails } from '../src/modules/diagnostic-error-codes.js';
import { inferDiagnosticModule } from '../src/modules/diagnostics-core.js';
import { FINGERPRINTS } from './diagnostic-fingerprint-lookup.mjs';

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full); else if (/\.(jsx?|mjs)$/.test(e.name)) files.push(full);
  }
};
walk('src');
const missing = [];
let checked = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/console\.(warn|error)\(\s*(['"`])((?:(?!\2).){3,200})\2/g)) {
    const entry = { type: `console.${m[1]}`, payload: { args: [m[3], 'Error: przykład'] } };
    const module = inferDiagnosticModule(entry);
    if (!['push', 'auth', 'contractors'].includes(module)) continue;
    checked += 1;
    if (getSafeDiagnosticDetails({ ...entry, module }).code === 'DIAGNOSTIC_UNCLASSIFIED') missing.push(`${file}: ${m[3]}`);
  }
}
assert.ok(checked >= 20, `sprawdzono ${checked} komunikatów`);
assert.deepEqual(missing, [], 'komunikaty PUSH / logowania / kontrahentów mają własne kody');

// Przyczyna sieciowa nadal ma pierwszeństwo przed etapem.
assert.equal(getSafeDiagnosticDetails({ type: 'console.warn', payload: { args: ['Nie udało się sprawdzić stanu PUSH:', 'Failed to fetch'] } }).code, 'NETWORK_FETCH_FAILED');
assert.equal(getSafeDiagnosticDetails({ type: 'console.warn', payload: { args: ['Nie udało się uruchomić obsługi offline i powiadomień.', 'InvalidStateError'] } }).code, 'SERVICE_WORKER_REGISTER_FAILED');
assert.equal(getSafeDiagnosticDetails({ type: 'console.warn', payload: { args: ['Multiple GoTrueClient instances detected in the same browser context.'] } }).code, 'AUTH_MULTIPLE_CLIENTS');

// Ślad: bez treści i danych, stabilny, niezależny od liczb i identyfikatorów.
const secret = 'Jan Kowalski 600100200 jan.kowalski@example.pl';
const unknown = getSafeDiagnosticDetails({ type: 'console.warn', payload: { args: ['Nieznany komunikat testowy 14.71:', secret] } });
assert.equal(unknown.code, 'DIAGNOSTIC_UNCLASSIFIED');
assert.match(unknown.message, /^Niesklasyfikowane zdarzenie techniczne; sprawdź kontekst zdarzenia\. Ślad: [0-9a-f]{8}\.$/);
assert.ok(!/kowalski|600100200|komunikat testowy/i.test(unknown.message), 'ślad nie zawiera treści ani danych');
assert.equal(unknown.fingerprint, diagnosticFingerprint('Nieznany komunikat testowy 14.71:'), 'ślad = skrót pierwszego tekstu (stały komunikat), bez danych z dalszych argumentów');
assert.equal(diagnosticFingerprint('Błąd 12 w 3c0e9a2b-1111-4222-8333-444455556666'), diagnosticFingerprint('Błąd 7 w 00000000-0000-4000-8000-000000000000'));
assert.ok(unknown.message.length <= 500, 'mieści się w limicie bazy');
assert.ok(FINGERPRINTS.some(([fp]) => fp === diagnosticFingerprint('Nie udało się zsynchronizować subskrypcji push z Supabase:')), 'tabela śladów obejmuje komunikaty z kodu');

console.log(`PASS WAWIS 14.71 — ${checked} komunikatów PUSH / logowania / kontrahentów z własnym kodem; ślad niesklasyfikowanych zdarzeń bez treści.`);
