const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const contractorsModule = await import(pathToFileURL(path.join(root, 'src/modules/contractors.js')).href);
  const {
    appendContractorAddress,
    buildContractorPayload,
    getPrimaryContractorAddress,
    normalizeContractorRecord,
  } = contractorsModule;

  const normalized = normalizeContractorRecord({
    id: 'client-1',
    company_name: 'Klient testowy',
    city: 'Zawiercie',
    street: 'ul. Główna 1',
  });
  assert.strictEqual(normalized.addresses.length, 1, 'Stary pojedynczy adres musi zostać zamieniony na listę adresów.');
  assert.strictEqual(getPrimaryContractorAddress(normalized).city, 'Zawiercie');

  const appended = appendContractorAddress(normalized, {
    label: 'Firma',
    city: 'Poręba',
    street: 'ul. Przemysłowa 4',
  });
  assert.strictEqual(appended.contractor.addresses.length, 2, 'Drugi adres powinien zostać dopisany do klienta.');
  assert.ok(appended.address?.id, 'Nowy adres musi otrzymać trwały identyfikator.');
  assert.strictEqual(buildContractorPayload(appended.contractor).p_addresses.length, 2);

  const migration = read('contractor-addresses-v8.81.sql');
  assert.ok(migration.includes('add column if not exists addresses jsonb'), 'Migracja musi dodawać listę adresów do contractors.');
  assert.ok(migration.includes('add column if not exists contractor_address_id text'), 'Migracja musi zapisywać wybrany adres na zleceniu.');
  assert.ok(migration.includes('normalize_contractor_addresses'), 'Migracja musi normalizować stare i nowe adresy.');

  const panel = read('src/components/contractors/ContractorsPanel.jsx');
  assert.ok(panel.includes('+ Dodaj adres'), 'Karta klienta musi pozwalać dodać kolejny adres.');
  assert.ok(panel.includes('Adresy klienta'), 'Formularz klienta musi pokazywać sekcję adresów.');
  assert.ok(panel.includes('setPrimaryContractorAddress'), 'Musi istnieć możliwość wskazania adresu głównego.');

  const modal = read('src/components/modals/JobFormModal.jsx');
  assert.ok(modal.includes('Adres montażu'), 'Formularz montażu musi pozwalać wybrać adres klienta.');
  assert.ok(modal.includes('+ Dodaj nowy adres klienta'), 'Formularz montażu musi pozwalać dopisać nową lokalizację.');

  const jobsForm = read('src/modules/jobs-form.js');
  assert.ok(jobsForm.includes('contractor_address_id:'), 'Zlecenie musi zapisywać identyfikator wybranego adresu.');

  const xlsxExport = read('src/utils/xlsxExport.js');
  const xlsxImport = read('src/utils/xlsxImport.js');
  assert.ok(xlsxExport.includes('Adresy (JSON)'), 'Eksport XLSX musi zachowywać wszystkie adresy klienta.');
  assert.ok(xlsxExport.includes('serializeContractorAddresses'), 'Eksport XLSX musi serializować listę adresów.');
  assert.ok(xlsxImport.includes("['adresy json', 'addresses_json']"), 'Import XLSX musi rozpoznawać kolumnę z adresami.');
  assert.ok(xlsxImport.includes('JSON.parse(record.addresses_json)'), 'Import XLSX musi odtwarzać listę adresów.');

  const mockSupabase = read('src/lib/mockSupabaseClient.js');
  assert.ok(mockSupabase.includes('p_addresses'), 'Mock Supabase musi zachowywać listę adresów w testach E2E.');
  assert.ok(mockSupabase.includes('primaryAddress?.city'), 'Mock Supabase musi wyprowadzać city/street z adresu głównego.');

  const contractorsFetch = read('src/modules/contractors-fetch.js');
  const syncPayload = contractorsFetch.slice(
    contractorsFetch.indexOf('function buildJobPayloadFromContractor'),
    contractorsFetch.indexOf('function getRenameMatchCandidates'),
  );
  assert.ok(!syncPayload.includes('city,'), 'Edycja klienta nie może nadpisywać historycznego miasta w zleceniach.');
  assert.ok(!syncPayload.includes('street,'), 'Edycja klienta nie może nadpisywać historycznej ulicy w zleceniach.');

  console.log('OK: wielu adresów klienta, wybór adresu montażu i zachowanie historycznego snapshotu są zabezpieczone.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
