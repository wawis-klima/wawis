import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProtocolSigningSnapshot, canReuseProtocolSignature, hasProtocolAddressCorrection } from '../src/mobile791/modules/protocol-signature-reuse.js';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const base = createProtocolSigningSnapshot({
  client: 'Testowy klient', phone: '500100200', email: 'klient@example.test',
  address: '42-400 Zawiercie, Testowa 1',
  installationDate: '12.10.2026',
  technicians: ['PW'], deviceRows: [{ model: 'Mitsubishi', serialNumber: 'JW-1' }],
  payment: { enabled: true, amount: 500, method: 'cash', paidDate: '2026-10-12' },
  note: 'Odbiór potwierdzony',
});
const legacy = { signature_path: null, signed_snapshot: null };
const record = { signature_path: 'job-id/signature-new.png', signed_snapshot: base };
const change = (patch) => ({ ...base, ...patch });
assert.equal(canReuseProtocolSignature(legacy, base), false, 'Legacy PDFs must not magically gain a reusable signature');
assert.equal(canReuseProtocolSignature(record, base), true);
assert.equal(canReuseProtocolSignature(record, change({ address: '42-400 Zawiercie, Testowa 2' })), true);
assert.equal(hasProtocolAddressCorrection(record, change({ address: '42-400 Zawiercie, Testowa 2' })), true);
assert.equal(hasProtocolAddressCorrection(record, base), false);
for (const changed of [
  { client: 'Inny klient' }, { phone: '123456789' }, { email: 'inny@example.test' },
  { installationDate: '13.10.2026' }, { technicians: ['IN'] },
  { deviceRows: [{ model: 'Inne urządzenie' }] },
  { payment: { ...base.payment, amount: 600 } },
  { note: 'Zmienione ustalenia' },
]) assert.equal(canReuseProtocolSignature(record, change(changed)), false, 'Material change requires a new signature: ' + JSON.stringify(changed));

const modal = read('src/mobile791/components/modals/ProtocolTestModal.jsx');
const storage = read('src/mobile791/modules/job-protocol-storage.js');
const pdf = read('src/mobile791/modules/job-protocol-pdf.js');
const migration = read('supabase/migrations/20261012141000_protocol_signature_address_correction_v1322.sql');
assert.match(modal, /loadStoredProtocolSignature\(\{ supabase, record: savedRecord \}\)/);
assert.match(modal, /reuseStoredSignature: reuseStoredSignature \? "" : signatureDataUrl|signatureDataUrl: reuseStoredSignature \? "" : signatureDataUrl/);
assert.match(modal, />Podpisz ponownie"|\? "Podpisz ponownie"/);
assert.match(modal, /Pobierz starszy PDF/);
assert.match(storage, /signature_path: signaturePath \|\| null/);
assert.match(storage, /\.revision_history/);
assert.match(storage, /storage_path: existing\.record\.storage_path, file_name:/);
assert.doesNotMatch(storage, /removeProtocolFilesBestEffort\(supabase, \[existing\.record\.storage_path\]\)/);
assert.match(pdf, /Korekta adresu — podpis klienta z/);
assert.match(migration, /add column if not exists signature_path text/);
assert.match(migration, /job-protocol-signatures/);
assert.match(migration, /current_user_can_write_job_protocol/);
console.log('PASS WAWIS 13.22 signature reuse / no legacy migration / PDF revision retention');
