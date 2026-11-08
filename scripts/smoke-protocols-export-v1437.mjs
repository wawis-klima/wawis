// WAWIS 14.37 — zakładka „Protokoły”: ZIP (bez bibliotek), zakres dat, nazwy plików, pobieranie z atrapą bazy.
// E2E: protocols-export-v1437.spec.js. Archiwum sprawdzane niezależnie modułem zipfile Pythona (sumy CRC).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createZipBlob, crc32, listZipEntryNames } from '../src/modules/zip-store.js';
import { buildProtocolsZip, inRange, protocolEntryName, warsawDate } from '../src/modules/protocol-export.js';

assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'CRC-32 (wektor kontrolny)');
const zip = await createZipBlob([
  { name: 'Protokoły montażu/2026-11-05 Piotr Kulis, Zawiercie.pdf', data: '%PDF-1.4 A' },
  { name: 'Protokoły montażu/2026-11-05 Piotr Kulis, Zawiercie.pdf', data: '%PDF-1.4 B' },
  { name: 'Protokoły szczelności/2026-11-05 Łódź.pdf', data: new Uint8Array([1, 2, 3, 255]) },
]);
const bytes = new Uint8Array(await zip.arrayBuffer());
assert.deepEqual(listZipEntryNames(bytes), [
  'Protokoły montażu/2026-11-05 Piotr Kulis, Zawiercie.pdf',
  'Protokoły montażu/2026-11-05 Piotr Kulis, Zawiercie (2).pdf',
  'Protokoły szczelności/2026-11-05 Łódź.pdf',
]);
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wawis-zip-')), 'a.zip');
fs.writeFileSync(tmp, bytes);
const py = execFileSync('python3', ['-I', '-c', [
  'import sys, zipfile', 'z = zipfile.ZipFile(sys.argv[1])', 'assert z.testzip() is None',
  'print("|".join(i.filename for i in z.infolist()))', 'print(z.read(z.infolist()[2]).hex())',
].join('\n'), tmp], { encoding: 'utf8' }).trim().split('\n');
assert.equal(py[0], 'Protokoły montażu/2026-11-05 Piotr Kulis, Zawiercie.pdf|Protokoły montażu/2026-11-05 Piotr Kulis, Zawiercie (2).pdf|Protokoły szczelności/2026-11-05 Łódź.pdf', 'Python czyta polskie nazwy');
assert.equal(py[1], '010203ff', 'zawartość bez zmian');

assert.equal(warsawDate('2026-11-07T23:30:00Z'), '2026-11-08', 'dzień w czasie polskim');
assert.ok(inRange('2026-11-05', '2026-11-01', '2026-11-30') && !inRange('2026-10-31', '2026-11-01', '') && inRange('2026-01-01', '', ''));
assert.equal(protocolEntryName('2026-11-05', { client: 'A/B: "C"', city: 'Zawiercie' }), '2026-11-05 A B C , Zawiercie.pdf');

// Pobieranie z atrapą bazy: zakres, foldery, błąd jednego pliku → „Pominięte.txt”, przerwanie.
const jobs = [
  { id: 'j1', client: 'Klient Jeden', city: 'Zawiercie', completed_at: '2026-11-05T10:00:00Z' },
  { id: 'j2', client: 'Klient Dwa', city: 'Myszków', completed_at: '2026-10-20T10:00:00Z' },
  { id: 'j3', client: 'Klient Trzy', city: 'Łazy', completed_at: '2026-11-06T10:00:00Z' },
];
const supabase = {
  from(table) {
    const rows = table === 'job_protocols'
      ? [{ id: 'p1', job_id: 'j1', storage_path: 'j1/a.pdf' }, { id: 'p2', job_id: 'j2', storage_path: 'j2/b.pdf' }, { id: 'p3', job_id: 'j3', storage_path: 'j3/brak.pdf' }]
      : jobs;
    const builder = { select: () => builder, in: (_c, ids) => Promise.resolve({ data: rows.filter((r) => ids.includes(r.id)), error: null }),
      then: (ok) => ok({ data: rows, error: null }) };
    return builder;
  },
  storage: { from: () => ({ download: async (p) => (p.includes('brak') ? { data: null, error: { message: 'Object not found' } } : { data: new Blob([`%PDF ${p}`]), error: null }) }) },
  rpc: async () => ({ data: [], error: null }),
};
const progress = [];
const result = await buildProtocolsZip({ supabase, from: '2026-11-01', to: '2026-11-30', kinds: { client: true, leak: false }, onProgress: (p) => progress.push(p.done) });
const names = listZipEntryNames(new Uint8Array(await result.blob.arrayBuffer()));
assert.deepEqual(names, ['Protokoły montażu/2026-11-05 Klient Jeden, Zawiercie.pdf', 'Pominięte.txt'], 'zakres: tylko listopad; brakujący plik pominięty');
assert.deepEqual(result.added, { client: 1, leak: 0 });
assert.equal(result.skipped.length, 1);
assert.equal(result.fileName, 'wawis-protokoly-2026-11-01_2026-11-30.zip');
assert.deepEqual(progress, [1, 2]);
await assert.rejects(buildProtocolsZip({ supabase, from: '2025-01-01', to: '2025-01-31', kinds: { client: true, leak: false } }), /Brak protokołów/);
const controller = new AbortController(); controller.abort();
await assert.rejects(buildProtocolsZip({ supabase, kinds: { client: true, leak: false }, signal: controller.signal }), /Przerwano/);

const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
assert.doesNotMatch(src('src/modules/protocol-export.js'), /\.(insert|update|delete|upsert)\(|\.remove\(|\.upload\(/, 'pobieranie tylko czyta');
assert.match(src('src/components/leak-tests/LeakTestsPanel.jsx'), /loadJob: \(\) => loadJobForLeakPdf\(\{ supabase, row \}\),/, 'PDF z listy z numerami seryjnymi');
console.log('PASS WAWIS 14.37 — Protokoły: ZIP (zgodny z zipfile), zakres dat, foldery, pominięte pliki, przerwanie, tylko odczyt.');
