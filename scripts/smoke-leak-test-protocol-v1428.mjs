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
assert.match(pdf, /let leakRecord = record !== undefined \? record : await loadLeakTest\(\{ supabase, jobId: job\?\.id \}\);/);
// 14.29: podpis wyłącznie z wpisu złożonego przez samego instalatora (signature_png z bazy).
assert.match(pdf, /signaturePng: record\?\.test_date && \/\^data:image\\\/png;base64,\/\.test\(String\(record\?\.signature_png \|\| ''\)\) \? record\.signature_png : ''/);
assert.equal((pdf.match(/addImage\(/g) || []).length, 1, 'jeden kod rysowania podpisu instalatora');
// 14.31 (decyzje właściciela 07.11.2026): podpis i data w obu polach (ta sama osoba), osoba odpowiedzialna wpisana,
// numery seryjne urządzenia w protokole.
assert.equal((pdf.match(/^  drawSignature\(doc, data, /gm) || []).length, 2, 'podpis: przeprowadzający i odpowiedzialny');
assert.match(pdf, /drawSignature\(doc, data, LEFT \+ 78, sigY\);\s+drawSignature\(doc, data, RIGHT - 100, sigY\);/);
assert.match(pdf, /field\(doc, 'Osoba odpowiedzialna za badania:', data\.responsiblePerson, y\)/);
assert.match(pdf, /responsiblePerson: performedBy,/);
assert.match(pdf, /field\(doc, 'Numery seryjne:', page\.serialNumbers, y\)/);
assert.match(pdf, /serialNumbers: device \? deviceSerialText\(device\) : '',/);
assert.doesNotMatch(pdf, /Kopia elektroniczna|oryginale papierowym/, 'bez dopisków (decyzja właściciela)');
assert.doesNotMatch(pdf, /previewWindow\.opener = null/, 'WebKit: blob w karcie wymaga połączenia z aplikacją');
// Nic nie zapisuje w bazie ani w Storage.
assert.doesNotMatch(pdf, /\.upload\(|\.insert\(|\.rpc\(|\.from\(/, 'PDF niczego nie zapisuje');

// Przyciski: zakończony montaż, administrator — telefon i komputer.
const mobile = read('src/mobile791/components/JobDetailsPanel.jsx');
assert.match(mobile, /\{isAdmin && selectedJobIsCompleted \? \(\s+<button\s+type="button"\s+className="btn leakTestProtocolBtn"/);
assert.match(mobile, /openLeakTestProtocolPdf\(\{ job: selectedJob, profiles, supabase \}\)/);
// Regresja CI 06.11: efekt użyty przed deklaracją selectedJobId (TDZ) wywracał kartę montażu.
assert.ok(mobile.indexOf('const selectedJobId = String(selectedJob?.id || "");') < mobile.indexOf('React.useEffect(() => { setLeakTestMessage(""); }, [selectedJobId]);'),
  'selectedJobId zadeklarowany przed użyciem');
const desktop = read('src/components/JobDetailsPanel.jsx');
// 14.31: na komputerze przycisk w sekcji „Urządzenia” (w górnym pasku rozbijał menu).
assert.match(desktop, /\{isAdmin && selectedJobIsCompleted && desktopDevicesExpanded \? \(\s+<button\s+type="button"\s+className="btn secondary desktopJobDevicesManageBtn"\s+data-testid="leak-test-protocol-btn"/);
const quickStart = desktop.indexOf('<div className="jobDetailsQuickActions"');
const quickBlock = desktop.slice(quickStart, desktop.indexOf('</div>', desktop.indexOf('Zamknij', quickStart)));
assert.ok(quickStart > 0 && !quickBlock.includes('leak-test-protocol-btn'), 'górny pasek bez protokołu szczelności');
assert.match(desktop, /import \{ openLeakTestProtocolPdf \} from '\.\.\/mobile791\/modules\/leak-test-protocol-pdf\.js';/);

console.log('PASS WAWIS 14.28 — protokół z próby szczelności PDF (wzór firmowy, dane montażu, pomiary z wpisu administratora, bez podpisów i dopisków).');
