// WAWIS 14.72 — kod z telefonu przy logowaniu (MFA TOTP), etap 1: logika, bramka w obu aplikacjach, karta w Diagnostyce.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  getMfaErrorMessage, getMfaGateState, isCompleteMfaCode, normalizeMfaCode, startTotpEnrollment, verifyTotpLogin,
} from '../src/modules/mfa.js';

const fake = (aal, factors = [], extra = {}) => ({ auth: { mfa: {
  async getAuthenticatorAssuranceLevel() { return typeof aal === 'function' ? aal() : { data: aal, error: null }; },
  async listFactors() { return { data: { all: factors }, error: null }; },
  async unenroll({ factorId }) { (extra.unenrolled ||= []).push(factorId); return { error: null }; },
  async enroll() { return { data: { id: 'new', totp: { qr_code: 'data:x', secret: 'S', uri: 'otpauth://totp/x' } }, error: null }; },
  async challengeAndVerify({ factorId, code }) { extra.verified = { factorId, code }; return { data: {}, error: null }; },
} } });

// Bramka
assert.equal((await getMfaGateState(fake({ currentLevel: 'aal1', nextLevel: 'aal2' }))).status, 'required');
assert.equal((await getMfaGateState(fake({ currentLevel: 'aal2', nextLevel: 'aal2' }))).status, 'ok');
assert.equal((await getMfaGateState(fake({ currentLevel: 'aal1', nextLevel: 'aal1' }))).status, 'ok', 'bez włączonego kodu — bez kroku');
assert.equal((await getMfaGateState(fake(() => ({ data: null, error: { message: 'Failed to fetch' } })))).status, 'ok', 'błąd odczytu (np. offline) nie blokuje pracy');
assert.equal((await getMfaGateState(fake(() => { throw new Error('x'); }))).status, 'ok');
assert.equal((await getMfaGateState({ auth: {} })).status, 'ok', 'starsza biblioteka bez MFA');

// Kod
assert.equal(normalizeMfaCode(' 12a 3-45 67 '), '123456');
assert.ok(isCompleteMfaCode('123456') && !isCompleteMfaCode('12345'));
const extra = {};
await verifyTotpLogin(fake({}, [{ id: 'f1', factor_type: 'totp', status: 'verified' }], extra), '123 456');
assert.deepEqual(extra.verified, { factorId: 'f1', code: '123456' });
await assert.rejects(() => verifyTotpLogin(fake({}, []), '123456'), /nie ma włączonego kodu/);
await assert.rejects(() => verifyTotpLogin(fake({}, [{ id: 'f1', factor_type: 'totp', status: 'verified' }]), '12'), /6 cyfr/);
const extra2 = {};
const enrollment = await startTotpEnrollment(fake({}, [{ id: 'old', factor_type: 'totp', status: 'unverified' }, { id: 'v', factor_type: 'totp', status: 'verified' }], extra2));
assert.deepEqual(extra2.unenrolled, ['old'], 'niedokończone próby usuwane, włączony kod zostaje');
assert.equal(enrollment.uri, 'otpauth://totp/x');

// Komunikaty
assert.match(getMfaErrorMessage({ message: 'Invalid TOTP code entered', code: 'mfa_verification_failed' }), /nieprawidłowy/);
assert.match(getMfaErrorMessage({ message: 'Failed to fetch' }), /internetem/);
assert.match(getMfaErrorMessage({ message: 'AAL2 required', code: 'insufficient_aal' }), /z kodem/);

// Bramka w obu aplikacjach: hook przed wczesnymi powrotami, ekran kodu zaraz po ekranie logowania, przed danymi.
for (const file of ['src/App.jsx', 'src/mobile791/App.jsx']) {
  const src = fs.readFileSync(file, 'utf8');
  const hook = src.indexOf('const mfaGate = useMfaGate(');
  const firstReturn = src.indexOf('  if (!isConfigured) {');
  const auth = src.indexOf('  if (!sessionUser) {');
  const gate = src.indexOf('  if (mfaGate.status === "required") {');
  const profileGate = src.indexOf('  if (!profile) {');
  assert.ok(hook > 0 && hook < firstReturn, `${file}: hook przed wczesnymi powrotami`);
  assert.ok(auth > 0 && gate > auth && gate < profileGate, `${file}: krok kodu po logowaniu, przed danymi`);
  assert.match(src, /onLogout=\{logout\}/, `${file}: z kroku kodu można się wylogować`);
}
for (const file of ['src/components/diagnostics/DiagnosticsPanel.jsx', 'src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx']) {
  assert.match(fs.readFileSync(file, 'utf8'), /profile\?\.role === 'Administrator' \? <MfaSettingsCard/, `${file}: karta tylko dla administratora`);
}
// Atrapa MFA tylko w atrapach bazy (wyłączanych z wersji produkcyjnej — smoke-no-mock-in-production).
for (const file of ['src/lib/mockSupabaseClient.js', 'src/mobile791/lib/mockSupabaseClient.js']) {
  assert.match(fs.readFileSync(file, 'utf8'), /createMockMfa/);
}
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = `${dir}/${e.name}`; if (e.isDirectory()) walk(f, out); else out.push(f); } return out; };
const importers = walk('src').filter((f) => /\.(jsx?|mjs)$/.test(f) && /mockMfa\.js/.test(fs.readFileSync(f, 'utf8')));
assert.deepEqual(importers.sort(), ['src/lib/mockSupabaseClient.js', 'src/mobile791/lib/mockSupabaseClient.js']);

console.log('PASS WAWIS 14.72 — kod z telefonu: bramka (offline nie blokuje), włączanie, komunikaty, karta tylko dla administratora.');
