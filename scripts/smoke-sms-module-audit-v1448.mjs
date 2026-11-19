// WAWIS 14.48: przegląd przycisków modułu SMS (komputer i telefon).
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const panel = read('src/components/sms/SmsPanel.jsx');
const phoneApp = read('src/mobile791/App.jsx');

function extract(name) {
  const start = panel.indexOf(`export function ${name}(`);
  assert.ok(start > 0, `brak ${name}`);
  return panel.slice(start, panel.indexOf('\n}\n', start) + 3).replace('export function', 'function');
}
const keep = new Function(`${extract('keepSelectedSmsClient')}; return keepSelectedSmsClient;`)();
const build = new Function(`${extract('buildSmsDetailsRow')}; return buildSmsDetailsRow;`)();

// 1. Podgląd nie znika po odświeżeniu kolejki.
const queue = [{ selectionKey: 'job:1', client: 'Nowe dane' }];
const sentPreview = build({ id: 'log-1', client: 'A', job_id: 'j', linkedTarget: { id: 'dev', target_type: 'device', contractor_id: 'c' } });
assert.equal(keep(sentPreview, queue), sentPreview, '„Wysłane”: podgląd zostaje');
const unsentPreview = build({ id: 'log-2', selectionKey: 'unsent:log-2', client: 'B', linkedTarget: null, job_id: null });
assert.equal(keep(unsentPreview, queue), unsentPreview, '„Niewysłane”: podgląd zostaje');
assert.equal(keep({ selectionKey: 'job:1', client: 'Stare' }, queue).client, 'Nowe dane', 'kolejka: odświeżony podgląd');
assert.equal(keep({ selectionKey: 'job:9' }, queue), null, 'kolejka: wysłana pozycja zamyka podgląd');
assert.equal(keep(null, queue), null);
assert.match(panel, /setSelectedClient\(\(prev\) => keepSelectedSmsClient\(prev, queue\)\)/);

// 2–4. Martwy przycisk usunięty, nazwa eksportu zgodna z formatem, „Wysyłanie…” w „Niewysłane” na komputerze.
assert.doesNotMatch(panel, /Więcej filtrów/);
assert.match(panel, /Eksportuj do Excela \(CSV\)/);
assert.doesNotMatch(panel, /Eksportuj do XLSX/);
assert.equal((panel.match(/sendingIds=\{sendingUnsentIds\}/g) || []).length, 3, 'kolejka + niewysłane (telefon i komputer)');

// 5. Ponowna wysyłka zaznaczonych: informacja o pominiętych i obsługa błędu.
assert.match(panel, /zostanie pominiętych/);
assert.match(panel, /Nie udało się odświeżyć listy po wysyłce/);

// 6. Telefon: komunikat, gdy montażu nie ma na liście.
assert.match(phoneApp, /function handleOpenJobFromSms\(jobLike\) \{\n[^\n]*\n    return openJobInJobsModule\(jobLike\);/);
assert.match(phoneApp, /if \(!resolvedJob\) return false;/);

// 7. Telefon: etykieta „Niewysłane”.
assert.match(panel, /activeSummaryView === 'unsent' \? 'Niewysłane' : 'Historia bieżącego miesiąca'/);

// 8. Cel dla wpisu montażu z jednym urządzeniem; urządzenie z wpisu bez celu ma powiązania z montażu.
assert.match(panel, /if \(list\.length === 1 && !map\.has\(`job:\$\{jobId\}`\)\) map\.set\(`job:\$\{jobId\}`, list\[0\]\);/);
assert.equal((panel.match(/setSelectedDevice\(row\?\.target_type \? row : buildSmsDetailsRow\(row, jobById\)\)/g) || []).length, 4);
console.log('PASS WAWIS 14.48 — przegląd przycisków modułu SMS.');
