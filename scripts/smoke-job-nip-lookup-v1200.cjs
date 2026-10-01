const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const contractors = read('src/mobile791/modules/job-contractors.js');
const modal = read('src/mobile791/components/modals/JobFormModal.jsx');

assert.match(contractors, /export function findContractorByNip\(/, 'Brak lookupu kontrahenta po NIP.');
assert.match(contractors, /normalizedNip\.length !== 10/, 'Autolink NIP ma czekać na pełne 10 cyfr.');
assert.match(contractors, /nip:\s*form\.nip/, 'NIP formularza musi trafiać do autolinku.');
assert.match(contractors, /nextForm\.client = normalizeText\(match\.company_name\)/, 'Trafienie po NIP ma uzupełnić nazwę firmy.');

assert.match(modal, /findContractorByNip/, 'Formularz mobile nie używa lookupu po NIP.');
assert.match(modal, /\[jobForm\.client, jobForm\.nip\]/, 'Podpowiedzi mobile nie uwzględniają NIP.');
assert.match(modal, /const match = findContractorByNip\(contractorOptions, jobForm\.nip\)/, 'Brak automatycznego wyboru po pełnym NIP.');
assert.match(modal, /field === 'nip'[\s\S]*selectedNip[\s\S]*next\.contractor_id = ''/, 'Brak ochrony przed nadpisaniem NIP innego kontrahenta.');

console.log('OK: v12.00 mobile wyszukuje i wiąże kontrahenta po NIP.');
