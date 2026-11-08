// WAWIS 14.38 — podpis instalatora w protokole montażu (ze wzoru podpisu). E2E: installer-signature-protocol-v1438.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveInstallerSignature } from '../src/modules/leak-tests.js';

const PNG = 'data:image/png;base64,AAAA';
const fake = ({ uid = 'u1', own = PNG, list = [], listError = null, ownError = null, sessionThrows = false, hang = false } = {}) => {
  const calls = [];
  return {
    calls,
    auth: { getSession: async () => { if (sessionThrows) throw new Error('x'); return { data: { session: uid ? { user: { id: uid } } : null } }; } },
    rpc: async (name) => {
      calls.push(name);
      if (hang) return new Promise(() => {});
      if (name === 'staff_signature_get_own_v1433') return { data: ownError ? null : (own ? [{ image_png: own }] : []), error: ownError };
      return { data: listError ? null : list, error: listError };
    },
  };
};

// Przed zakończeniem montażu: podpisujący pracownik = instalator → własny wzór.
let s = fake();
assert.equal(await resolveInstallerSignature({ supabase: s, job: { id: 'j' } }), PNG);
assert.deepEqual(s.calls, ['staff_signature_get_own_v1433']);
// Montaż zakończony przez tego samego pracownika → własny wzór.
assert.equal(await resolveInstallerSignature({ supabase: fake(), job: { completed_by: 'u1' } }), PNG);
// Zakończony przez kogoś innego: administrator → wzór instalatora z listy; pracownik (brak dostępu) → ''.
s = fake({ uid: 'admin', list: [{ profile_id: 'u2', image_png: 'data:image/png;base64,BBBB' }] });
assert.equal(await resolveInstallerSignature({ supabase: s, job: { completed_by: 'u2' } }), 'data:image/png;base64,BBBB');
assert.deepEqual(s.calls, ['staff_signatures_admin_list_v1434']);
assert.equal(await resolveInstallerSignature({ supabase: fake({ uid: 'u3', listError: { message: 'admin_only' } }), job: { completed_by: 'u2' } }), '', 'cudzy wzór niedostępny');
// Brak wzoru, błąd, brak sesji, zawieszone zapytanie → '' (protokół i tak powstaje).
assert.equal(await resolveInstallerSignature({ supabase: fake({ own: '' }), job: {} }), '');
assert.equal(await resolveInstallerSignature({ supabase: fake({ ownError: { message: 'x' } }), job: {} }), '');
assert.equal(await resolveInstallerSignature({ supabase: fake({ own: 'nie-obraz' }), job: {} }), '');
assert.equal(await resolveInstallerSignature({ supabase: fake({ sessionThrows: true }), job: {} }), '');
const t0 = Date.now();
assert.equal(await resolveInstallerSignature({ supabase: fake({ hang: true }), job: {}, timeoutMs: 200 }), '', 'limit czasu');
assert.ok(Date.now() - t0 < 2000);

const pdf = fs.readFileSync(new URL('../src/mobile791/modules/job-protocol-pdf.js', import.meta.url), 'utf8');
assert.match(pdf, /if \(installerSignatureDataUrl\) \{[\s\S]*?doc\.addImage\(installerSignatureDataUrl, "PNG", x, clientSignatureLineY - size\.height - 4/);
assert.match(pdf, /doc\.text\("Pieczątka i podpis instalatora"/, 'opis pola bez zmian');
const modal = fs.readFileSync(new URL('../src/mobile791/components/modals/ProtocolTestModal.jsx', import.meta.url), 'utf8');
assert.match(modal, /const installerSignatureDataUrl = await resolveInstallerSignature\(\{ supabase, job: updatedJob \}\);/);
assert.match(modal, /addressCorrection, installerSignatureDataUrl \}\)/);
console.log('PASS WAWIS 14.38 — podpis instalatora w protokole montażu: własny / cudzy (administrator) / brak → puste pole, bez blokowania.');
