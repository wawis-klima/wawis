// WAWIS 14.18 — samoczynne ponowne sprawdzanie faktury po powrocie z Fakturowni.
// Incydent 03.11.2026 (8/11/2026, Ireneusz Kotela): administrator zajrzał do WAWIS przed zapisaniem
// faktury; jedyne sprawdzenie odbyło się za wcześnie, ekran pokazał „Nie wykryto jeszcze nowej
// wystawionej faktury…” i nic się nie działo do kolejnego przełączenia zakładki.
// RED na 14.17: brak modułu ponawiania, panel sprawdza wyłącznie przy focus/visibilitychange.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createFakturowniaRecheck, fakturowniaVerifyFailureMessage,
  FAKTUROWNIA_AUTO_RECHECK_INTERVAL_MS, FAKTUROWNIA_AUTO_RECHECK_WINDOW_MS,
  FAKTUROWNIA_WAITING_MESSAGE,
} from '../src/modules/fakturownia-recheck.js';

// 1. Komunikat: „Czekam…” tylko dla automatycznego sprawdzenia, gdy faktury po prostu jeszcze nie ma.
const notYet = { found: false, candidates: [], reasonCode: 'NO_MATCHING_BUYER', reason: 'Nie wykryto jeszcze nowej wystawionej faktury tego klienta. Nie znaleziono faktury z jednoznacznie zgodnymi danymi nabywcy.' };
assert.equal(fakturowniaVerifyFailureMessage(notYet, { waiting: true }), FAKTUROWNIA_WAITING_MESSAGE, 'po powrocie z Fakturowni: czekamy, bez błędu');
assert.equal(fakturowniaVerifyFailureMessage(notYet, { waiting: false }), notYet.reason, 'ręczne „Sprawdź” pokazuje powód jak dotąd');
const withCandidates = { ...notYet, reasonCode: 'OID_MISSING_CANDIDATES', candidates: [{ invoiceId: '1', invoiceNumber: '8/11/2026' }], reason: 'Znaleziono faktury klienta. Wybierz właściwy numer.' };
assert.equal(fakturowniaVerifyFailureMessage(withCandidates, { waiting: true }), withCandidates.reason, 'kandydaci: wybór od razu');
for (const reasonCode of ['SCAN_INCOMPLETE', 'OID_CONFLICT', 'ALREADY_CONFIRMED']) {
  const result = { found: false, candidates: [], reasonCode, reason: `powód ${reasonCode}` };
  assert.equal(fakturowniaVerifyFailureMessage(result, { waiting: true }), result.reason, `${reasonCode}: ponawianie nie pomoże — powód od razu`);
}
assert.match(fakturowniaVerifyFailureMessage({}, {}), /Nie znaleziono wystawionej faktury/);

// 2. Harmonogram: co 15 s przez 10 min od powrotu, tylko przy widocznej karcie, potem jeden komunikat.
assert.equal(FAKTUROWNIA_AUTO_RECHECK_INTERVAL_MS, 15_000);
assert.equal(FAKTUROWNIA_AUTO_RECHECK_WINDOW_MS, 600_000);
let clock = 0;
let visible = true;
let verifies = 0;
let timeouts = 0;
const recheck = createFakturowniaRecheck({
  now: () => clock, isVisible: () => visible,
  verify: () => { verifies += 1; }, onTimeout: () => { timeouts += 1; },
});
const tickAt = (ms) => { clock = ms; return recheck.tick(); };
assert.equal(tickAt(15_000), false, 'bez rozpoczętego wystawiania nic nie sprawdza');
assert.equal(verifies, 0);
clock = 100_000;
recheck.start();
assert.equal(recheck.active, true);
assert.equal(tickAt(115_000), true, 'sprawdza ponownie po 15 s — faktura zapisana po powrocie zostanie wykryta');
assert.equal(tickAt(130_000), true);
visible = false;
assert.equal(tickAt(145_000), false, 'ukryta karta / inny montaż: bez zapytań do Fakturowni');
visible = true;
assert.equal(verifies, 2);
for (let t = 160_000; t <= 700_000; t += 15_000) tickAt(t);
assert.equal(timeouts, 0, 'w oknie 10 min bez komunikatu końcowego');
assert.equal(tickAt(715_000), false, 'po 10 min koniec ponawiania');
assert.equal(timeouts, 1, 'jeden komunikat po upływie okna');
assert.equal(tickAt(730_000), false);
assert.equal(timeouts, 1);
const before = verifies;
recheck.start(); recheck.stop();
assert.equal(tickAt(745_000), false, 'stop() przerywa ponawianie');
assert.equal(verifies, before);

// 3. Panel montażu korzysta z modułu: interwał sprzątany, ciche sprawdzanie w tle, „Czekam…” po powrocie.
const ui = fs.readFileSync(new URL('../src/components/JobDetailsPanel.jsx', import.meta.url), 'utf8');
assert.match(ui, /from "\.\.\/modules\/fakturownia-recheck\.js"/);
assert.match(ui, /const pollTimer = window\.setInterval\(\(\) => recheck\.tick\(\), FAKTUROWNIA_AUTO_RECHECK_INTERVAL_MS\)/);
assert.match(ui, /window\.clearInterval\(pollTimer\)/, 'ponawianie kończy się po zamknięciu karty / zmianie montażu');
assert.match(ui, /recheck\.start\(\);\s*void verifyPendingFakturowniaInvoice\(true, \{ waiting: true \}\)/);
assert.match(ui, /verifyPendingFakturowniaInvoice\(true, \{ waiting: true, quiet: true \}\)/);
assert.match(ui, /setInvoiceVerificationMessage\(fakturowniaVerifyFailureMessage\(result, \{ waiting \}\)\)/);
assert.match(ui, /if \(!quiet\) setFakturowniaVerifying\(true\)/, 'sprawdzanie w tle nie miga „Sprawdzam…”');
assert.match(ui, /if \(!quiet && activeInvoiceJobIdRef\.current === selectedJobId\)/, 'chwilowy błąd w tle nie zastępuje „Czekam…”');
assert.match(ui, /onClick=\{\(\) => void verifyPendingFakturowniaInvoice\(true\)\}/, 'ręczne „Sprawdź wystawioną fakturę” bez zmian');
assert.match(ui, /fakturowniaVerificationBusyRef\.current\) return;/, 'bez równoległych sprawdzeń');

console.log('PASS WAWIS 14.18 — faktura: samoczynne ponawianie co 15 s przez 10 min po powrocie z Fakturowni, „Czekam…” zamiast błędu.');
