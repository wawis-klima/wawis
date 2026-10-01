const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const edge = read('supabase/functions/gus-bir-lookup/index.ts');
const desktopModule = read('src/modules/gus-bir.js');
const mobileModule = read('src/mobile791/modules/gus-bir.js');
const desktopModal = read('src/components/modals/JobFormModal.jsx');
const mobileModal = read('src/mobile791/components/modals/JobFormModal.jsx');
const desktopContractors = read('src/components/contractors/ContractorsPanel.jsx');
const mobileContractors = read('src/mobile791/components/contractors/ContractorsPanel.jsx');

assert.match(edge, /Deno\.env\.get\("GUS_BIR_API_KEY"\)/, 'Klucz GUS musi pochodzić wyłącznie z sekretu Edge Function.');
assert.doesNotMatch(edge, /abcde12345abcde12345|ad355364b7be457fa57f/, 'Żaden klucz GUS nie może trafić do repozytorium.');
assert.match(edge, /auth\.getUser\(\)/, 'Lookup GUS musi wymagać zalogowanego użytkownika.');
assert.match(edge, /IUslugaBIRzewnPubl\/Zaloguj/, 'Lookup musi logować się do BIR.');
assert.match(edge, /IUslugaBIRzewnPubl\/DaneSzukajPodmioty/, 'Lookup musi wyszukiwać podmiot po NIP.');
assert.match(edge, /headers\.sid = sid/, 'Zapytanie wyszukiwania musi przekazywać SID sesji BIR.');
assert.match(edge, /isValidPolishNip/, 'Backend ma weryfikować sumę kontrolną NIP.');

for (const [label, moduleSource] of [['desktop', desktopModule], ['mobile', mobileModule]]) {
  assert.match(moduleSource, /functions\.invoke\('gus-bir-lookup'/, `${label}: frontend musi używać zabezpieczonej Edge Function.`);
  assert.match(moduleSource, /Authorization:\s*`Bearer \$\{accessToken\}`/, `${label}: lookup musi przekazywać aktualną sesję użytkownika.`);
  assert.match(moduleSource, /isValidPolishNip/, `${label}: nie wolno wysyłać błędnego NIP do GUS.`);
}

for (const [label, source] of [['desktop job', desktopModal], ['mobile job', mobileModal]]) {
  assert.match(source, /findContractorByNip\(contractorOptions, jobForm\.nip\)/, `${label}: lokalna baza ma mieć pierwszeństwo przed GUS.`);
  assert.match(source, /lookupCompanyByNip/, `${label}: formularz montażu musi wykonywać lookup GUS.`);
  assert.match(source, /gusLookupAttemptRef/, `${label}: lookup GUS musi być chroniony przed wielokrotnym wywołaniem tego samego NIP.`);
  assert.match(source, /result\.name[\s\S]*result\.postalCode[\s\S]*result\.street/, `${label}: dane GUS muszą uzupełniać nazwę i adres.`);
}

for (const [label, source] of [['desktop contractors', desktopContractors], ['mobile contractors', mobileContractors]]) {
  assert.match(source, /lookupCompanyByNip/, `${label}: moduł Kontrahenci musi korzystać z GUS.`);
  assert.match(source, /normalizeContractorNip\(item\.nip\).*=== nip/s, `${label}: istniejący NIP w bazie ma blokować zbędne zapytanie GUS.`);
}

console.log('OK: v12.06 GUS BIR lookup po NIP jest zabezpieczony i podpięty do montażów oraz kontrahentów.');
