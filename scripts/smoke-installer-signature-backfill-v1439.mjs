// WAWIS 14.39 — podpis instalatora w protokołach montażu sprzed 14.38: wybór protokołów i instalatora, ochrona przed
// ponownym dopisaniem, zapis jako nowa wersja (oryginał w historii), błąd jednego nie przerywa reszty.
// Dopisywanie do PDF (incremental update): E2E installer-signature-backfill-v1439 (prawdziwy PDF z generatora aplikacji).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { INSTALLER_SIGNATURE_CUTOFF, alreadyStamped, listProtocolsForInstallerSignature } from '../src/modules/protocol-installer-stamp.js';

const rows = {
  job_protocols: [
    { id: 'p1', job_id: 'j1', storage_path: 'j1/a.pdf', created_at: '2026-10-01T10:00:00Z', signed_at: '2026-10-01T10:00:00Z', revision_history: [] },
    { id: 'p2', job_id: 'j2', storage_path: 'j2/a.pdf', created_at: '2026-09-01T10:00:00Z', signed_at: '2026-09-01T10:00:00Z', revision_history: [] },
    { id: 'p3', job_id: 'j3', storage_path: 'j3/a.pdf', created_at: '2026-08-01T10:00:00Z', signed_at: '2026-08-01T10:00:00Z', revision_history: [] },
    { id: 'p4', job_id: 'j4', storage_path: 'j4/a.pdf', created_at: '2026-11-09T10:00:00Z', signed_at: '2026-11-09T10:00:00Z', revision_history: [] },
    { id: 'p5', job_id: 'j5', storage_path: 'j5/b.pdf', created_at: '2026-07-01T10:00:00Z', signed_at: '2026-07-01T10:00:00Z', revision_history: [{ reason: 'installer_signature_added' }] },
  ],
  jobs: [
    { id: 'j1', client: 'A', completed_by: 'u1' }, { id: 'j2', client: 'B', completed_by: null },
    { id: 'j3', client: 'C', completed_by: 'u3' }, { id: 'j4', completed_by: 'u1' }, { id: 'j5', completed_by: 'u1' },
  ],
};
const supabase = {
  from(table) {
    const b = { select: () => b, in: (_c, ids) => Promise.resolve({ data: rows[table].filter((r) => ids.includes(r.id)), error: null }),
      then: (ok) => ok({ data: rows[table], error: null }) };
    return b;
  },
  rpc: async (name) => (name === 'leak_tests_list_v1428'
    ? { data: [{ job_id: 'j2', installer_id: 'u2' }], error: null }
    : { data: [{ profile_id: 'u1', full_name: 'Michał', image_png: 'data:image/png;base64,M' }, { profile_id: 'u2', full_name: 'Paweł', image_png: 'data:image/png;base64,P' }, { profile_id: 'u3', full_name: 'Jan', image_png: null }], error: null }),
};
const items = await listProtocolsForInstallerSignature({ supabase });
assert.deepEqual(items.map((i) => [i.record.id, i.installerId, i.png.slice(-1), i.reason]), [
  ['p3', 'u3', '', 'brak wzoru podpisu (Jan)'],
  ['p2', 'u2', 'P', ''],
  ['p1', 'u1', 'M', ''],
], 'przed 14.38, bez już uzupełnionych; instalator z montażu albo przypisany w próbach szczelności');
assert.equal(INSTALLER_SIGNATURE_CUTOFF, '2026-11-08T16:22:00Z');
assert.ok(alreadyStamped({ revision_history: [{ reason: 'installer_signature_added' }] }) && !alreadyStamped({}));

const mod = fs.readFileSync(new URL('../src/modules/protocol-installer-stamp.js', import.meta.url), 'utf8');
assert.match(mod, /\.update\(\{ storage_path: path, file_size_bytes: blob\.size, revision_history: history, created_by: userId \}\)\s+\.eq\('id', record\.id\)\.eq\('storage_path', record\.storage_path\)/, 'tylko plik i historia; ochrona przed równoczesną zmianą');
assert.doesNotMatch(mod, /\.remove\(|\.delete\(/, 'bez kasowania');
const update = mod.match(/\.update\((\{[^)]*\})\)/)[1];
assert.doesNotMatch(update, /signed_at|signature_path|signed_snapshot|note|file_name/, 'bez zmiany podpisu klienta, daty i danych');
assert.match(mod, /upsert: false/, 'nowy plik — oryginał nienadpisany');
const stamp = fs.readFileSync(new URL('../src/modules/pdf-stamp.js', import.meta.url), 'utf8');
assert.match(stamp, /out\.set\(bytes, 0\);/, 'oryginalne bajty PDF na początku nowego pliku');
assert.match(stamp, /if \(after\.images !== before\.images \+ 1\) throw/, 'kontrola po dopisaniu');
console.log('PASS WAWIS 14.39 — podpis instalatora w starszych protokołach: wybór, bez powtórzeń, nowa wersja z oryginałem w historii.');
