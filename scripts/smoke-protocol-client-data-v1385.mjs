// WAWIS 13.85 — reguły danych klienta w protokole (bez AI, bez internetu).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateClientName as name, validateClientEmail as email, checkProtocolClientData, createProtocolClientDraft } from '../src/mobile791/modules/protocol-client-data.js';

const ok = (r) => assert.equal(r.ok, true, JSON.stringify(r));
const bad = (r) => assert.equal(r.ok, false, JSON.stringify(r));

for (const v of ['Jan Kowalski', 'Kowalska Anna', 'Anna Nowak-Wiśniewska', 'Łukasz Żółć', 'Marcin Nowak', 'Kasia Nowak']) {
  const r = name(v); ok(r); assert.equal(r.hint, '', `${v}: znane imię bez podpowiedzi`);
}
const foreign = name('Xiang Li'); ok(foreign); assert.match(foreign.hint, /Nie rozpoznano imienia/); // rzadkie imię: podpowiedź, bez blokady
for (const v of ['', 'Kowalski', 'Pan Kowalski', 'Klient Kowalski', 'ul. Lipowa 5', 'Lipowa 5', 'Al. Jana Pawła 3', 'Os. Słoneczne', 'Jan 123', 'jan@kowalski.pl']) bad(name(v));
bad(name('Chłodna', { street: 'ul. Chłodna 5' }));
bad(name('Kraków', { city: 'Kraków' }));
ok(name('Firma ABC sp. z o.o.', { isCompany: true }));
ok(name('Bud-Mar 2', { isCompany: true }));
bad(name('ul. Lipowa 5', { isCompany: true }));

ok(email('jan.kowalski@gmail.com'));
ok(email('Jan.Kowalski@WP.PL '));
ok(email('', { declined: true }));
bad(email(''));
bad(email('jan@onet'));
bad(email('brak@wp.pl'));
bad(email('test@test.pl'));
for (const [typo, fixed] of [['jan@gmial.com', 'jan@gmail.com'], ['jan@wp.pl.pl', 'jan@wp.pl'], ['jan@firma.con', 'jan@firma.com'], ['jan@gmail.pl', 'jan@gmail.com']]) {
  const r = email(typo); bad(r); assert.equal(r.suggestion, fixed);
}

const draft = createProtocolClientDraft({ client: 'P.H.U. Marek Instalacje', email: 'BIURO@phu.pl' });
assert.equal(draft.isCompany, true);
assert.equal(draft.email, 'biuro@phu.pl');
assert.equal(checkProtocolClientData(draft).ok, true);
assert.equal(checkProtocolClientData({ client: 'ul. Lipowa 5', email: '' }).ok, false);

// Kreator protokołu: blokada podpisu i zapisu, zapis danych przed płatnością, dane w szkicu podpisu.
const modal = fs.readFileSync(new URL('../src/mobile791/components/modals/ProtocolTestModal.jsx', import.meta.url), 'utf8');
assert.match(modal, /function openSignature\(\) \{\s*if \(clientGateBlocked\)/);
assert.match(modal, /if \(clientGateBlocked\) \{\s*showClientDataProblem\(\);\s*return;\s*\}\s*if \(isProtocolOffline\(\)\)/);
assert(modal.indexOf('saveJobClientContact({') < modal.indexOf('saveJobPaymentConfirmation({ supabase, job: protocolJob'), 'dane klienta zapisywane przed płatnością i PDF');
assert.match(modal, /clientDraft: clientDataEditable \? clientDraft : null/);
const drafts = fs.readFileSync(new URL('../src/mobile791/modules/protocol-signature-drafts.js', import.meta.url), 'utf8');
assert.match(drafts, /clientDraft:/);
assert.doesNotMatch(drafts, /(?:localStorage|indexedDB)\s*\./, 'podpis i dane klienta nadal tylko w pamięci aplikacji');
console.log('PASS WAWIS 13.85 — dane klienta w protokole: reguły imienia i nazwiska, firma, e-mail z literówkami, blokada podpisu i zapisu.');
