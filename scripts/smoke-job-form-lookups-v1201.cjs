const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadContractorModule(file) {
  let source = read(file);
  source = source.replace(/export function (\w+)\(/g, 'function $1(');
  source += '\nmodule.exports = { findContractorByNip, findAutoLinkedContractor, applyAutoLinkedContractorToJobForm };\n';
  const sandbox = { module: { exports: {} }, exports: {}, console };
  vm.runInNewContext(source, sandbox, { filename: file });
  return sandbox.module.exports;
}

for (const file of ['src/modules/job-contractors.js', 'src/mobile791/modules/job-contractors.js']) {
  const mod = loadContractorModule(file);
  const contractors = [{
    id: 'c1',
    company_name: 'WAWIS CHŁODNICTWO I KLIMATYZACJA PIOTR WASIK',
    nip: '649-204-00-94',
    city: '42-400 Zawiercie',
    street: 'Rolnicza 40',
    email: 'biuro@example.test',
    phone: '500600700',
  }];

  assert.equal(mod.findContractorByNip(contractors, '6492040094')?.id, 'c1', `${file}: pełny NIP musi znaleźć kontrahenta`);
  assert.equal(mod.findContractorByNip(contractors, '6492040'), null, `${file}: niepełny NIP nie może autolinkować`);

  const linked = mod.applyAutoLinkedContractorToJobForm({ client: '', nip: '6492040094', email: '', phone: '', city: '', street: '' }, contractors);
  assert.equal(linked.form.contractor_id, 'c1', `${file}: formularz musi powiązać kontrahenta po NIP`);
  assert.equal(linked.form.client, contractors[0].company_name, `${file}: po NIP ma uzupełnić nazwę firmy`);
}

const desktopModal = read('src/components/modals/JobFormModal.jsx');
const mobileModal = read('src/mobile791/components/modals/JobFormModal.jsx');
const desktopApp = read('src/App.jsx');
const mobileApp = read('src/mobile791/App.jsx');

for (const [label, source] of [['desktop', desktopModal], ['mobile', mobileModal]]) {
  assert.match(source, /\[jobForm\.client, jobForm\.nip\]/, `${label}: podpowiedzi muszą reagować na NIP`);
  assert.match(source, /findContractorByNip\(contractorOptions, jobForm\.nip\)/, `${label}: pełny NIP musi automatycznie wybrać kontrahenta`);
  assert.match(source, /window\.setTimeout\([\s\S]*refreshPostalCode\(jobForm\.city, jobForm\.street\)[\s\S]*550/, `${label}: kod pocztowy ma wyszukiwać się automatycznie po krótkiej pauzie`);
  assert.match(source, /value=\{cityAddressParts\.postalCode\}/, `${label}: pole kodu musi być kontrolowane i od razu pokazać wynik lookupu`);
}

assert.match(desktopApp, /<JobFormModal[\s\S]*?contractors=\{contractorsCatalog\}[\s\S]{0,300}?supabase=\{supabase\}[\s\S]*?addJob=\{addJob\}/, 'Desktop musi przekazać Supabase dokładnie do JobFormModal.');
assert.match(mobileApp, /<JobFormModal[\s\S]*?contractors=\{contractorsCatalog\}[\s\S]{0,300}?supabase=\{supabase\}[\s\S]*?isAdmin=\{isAdmin\}/, 'Mobile musi przekazać Supabase dokładnie do JobFormModal.');

console.log('OK: v12.01 NIP i automatyczny kod pocztowy działają w mobile i desktop.');
