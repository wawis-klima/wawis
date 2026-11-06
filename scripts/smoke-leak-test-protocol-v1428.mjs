// WAWIS 14.28 — protokół z próby szczelności (PDF z danych montażu). Decyzja właściciela 06.11.2026:
// wersja elektroniczna, bez podpisów i dopisków; tylko dane, które system zna. E2E: leak-test-protocol-v1428.spec.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pdf = read('src/mobile791/modules/leak-test-protocol-pdf.js');

// Wzór firmowy (stałe dane formularza).
for (const text of ['PROTOKÓŁ', 'z próby szczelności', 'Próba szczelności zgodna z normą PN-EN 378-2+A2:2012',
  'Maksymalne dopuszczalne ciśnienie PS (zgodne z EN 378-2:2000)', 'za pomocą gazu obojętnego',
  'Ciśnienie próby szczelności (zgodnie EN 378-2:2000 wynosi ≤ 1,0 * PS)', 'Manometr, numer fabr/inw. 53020  zakres 0 – 50 Bar',
  'Termometr, typ CPS zakres -50 + 300', 'Temperatura przeprowadzania próby:', 'Data badania:', 'Osoba przeprowadzająca badanie:',
  'Osoba odpowiedzialna za badania:', 'Pozytywny – Negatywny', 'Wynik badania: ', 'przeprowadzającej badanie', 'odpowiedzialnej za badanie']) {
  assert.ok(pdf.includes(text), `wzór: ${text}`);
}
// Dane z montażu: urządzenie, adres, osoba kończąca montaż; jedna strona na urządzenie.
assert.match(pdf, /field\(doc, 'Nazwa badanego obiektu:', page\.objectName, y\)/);
assert.match(pdf, /field\(doc, 'Miejsce badania:', data\.place, y\)/);
assert.match(pdf, /field\(doc, 'Osoba przeprowadzająca badanie:', data\.performedBy, y\)/);
assert.match(pdf, /String\(profile\?\.id \|\| ''\) === String\(job\?\.completed_by \|\| ''\)/);
assert.match(pdf, /const devices = getJobDeviceRows\(job\);/);
// 14.28: temperatura, data i wynik wyłącznie z wpisu administratora (przepisane z protokołu) — bez wpisu puste.
assert.match(pdf, /const leakRecord = record !== undefined \? record : await loadLeakTest\(\{ supabase, jobId: job\?\.id \}\);/);
assert.doesNotMatch(pdf, /addImage/, 'bez podpisów');
assert.doesNotMatch(pdf, /Kopia elektroniczna|oryginale papierowym/, 'bez dopisków (decyzja właściciela)');
// Nic nie zapisuje w bazie ani w Storage.
assert.doesNotMatch(pdf, /\.upload\(|\.insert\(|\.rpc\(|\.from\(/, 'PDF niczego nie zapisuje');

// Przyciski: zakończony montaż, administrator — telefon i komputer.
const mobile = read('src/mobile791/components/JobDetailsPanel.jsx');
assert.match(mobile, /\{isAdmin && selectedJobIsCompleted \? \(\s+<button\s+type="button"\s+className="btn leakTestProtocolBtn"/);
assert.match(mobile, /openLeakTestProtocolPdf\(\{ job: selectedJob, profiles, supabase \}\)/);
const desktop = read('src/components/JobDetailsPanel.jsx');
assert.match(desktop, /\{isAdmin && selectedJobIsCompleted \? \(\s+<button\s+type="button"\s+className="btn premiumActionBtn jobDetailsQuickBtn"\s+data-testid="leak-test-protocol-btn"/);
assert.match(desktop, /import \{ openLeakTestProtocolPdf \} from '\.\.\/mobile791\/modules\/leak-test-protocol-pdf\.js';/);

console.log('PASS WAWIS 14.28 — protokół z próby szczelności PDF (wzór firmowy, dane montażu, pomiary z wpisu administratora, bez podpisów i dopisków).');
