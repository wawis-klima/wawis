import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEditJobForm,
  buildJobEditChangeSet,
} from '../src/mobile791/modules/jobs-form.js';
import {
  buildFallbackDevicesFromJobs,
  normalizeDeviceRecord,
  updateFallbackJobDevice,
  upsertDevice,
} from '../src/modules/devices-fetch.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const normalizeStatus = (value) => value || 'Nowe';

// K1: pełna edycja mobile zachowuje contractor_address_id.
const baseJob = {
  id: 'job-address-b',
  client: 'Klient A',
  title: 'Klient A',
  email: 'a@example.test',
  phone: '500600700',
  sms_recipient_phone: '500600700',
  city: 'Miasto B',
  street: 'Adres B 2',
  location: 'Miasto B, Adres B 2',
  contractor_id: 'contractor-1',
  contractor_address_id: 'address-b',
  status: 'W trakcie',
  installation_date: '2026-09-29',
  installer_ids: [],
  device_model: '',
  device_serial_number: '',
};
const editForm = buildEditJobForm({ job: baseJob, profiles: [], normalizeStatus });
assert.equal(editForm.contractor_address_id, 'address-b', 'K1: mobile musi zachować ID adresu B w formularzu edycji.');

const phoneOnly = buildJobEditChangeSet({
  form: { ...editForm, phone: '700800900' },
  baseJob,
  isAdmin: true,
  normalizeStatus,
});
assert.deepEqual(
  Object.keys(phoneOnly.fields).sort(),
  ['phone', 'sms_recipient_phone'],
  'K1: zmiana telefonu nie może przepiąć contractor_address_id.',
);

const legacyJob = { ...baseJob };
delete legacyJob.contractor_address_id;
const legacyForm = buildEditJobForm({ job: legacyJob, profiles: [], normalizeStatus });
const legacyPhoneOnly = buildJobEditChangeSet({
  form: { ...legacyForm, phone: '700800901' },
  baseJob: legacyJob,
  isAdmin: false,
  normalizeStatus,
});
assert.equal(
  Object.prototype.hasOwnProperty.call(legacyPhoneOnly.fields, 'contractor_address_id'),
  false,
  'K1: historyczny rekord bez ID adresu ma pozostać bez ID przy niezwiązanej edycji.',
);

const mobileModal = read('src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx');
assert.match(mobileModal, /contractor_address_id:\s*primaryAddress\?\.id \|\| ''/, 'K1: świadomy wybór kontrahenta musi przenieść ID adresu.');
assert.match(mobileModal, /editingJobId && jobForm\.contractor_id[\s\S]*\? \{ form: jobForm \}/, 'K1: edycja istniejącego powiązania nie może auto-podmienić brakującego ID adresem głównym.');
assert.match(mobileModal, /Adres zapisany wcześniej w tym montażu/, 'K1: mobile musi jawnie pokazać historyczny snapshot bez ID.');

// K17 + K2: drugie urządzenie zachowuje własny indeks, a zapis nie dotyka danych klienta/lokalizacji.
const jobWithTwoDevices = {
  id: 'job-2-devices',
  contractor_id: 'contractor-1',
  client: 'Klient A',
  city: 'Miasto B',
  street: 'Adres B 2',
  installation_date: '2026-09-29',
  device_model: 'Model 1\nModel 2',
  device_serial_number: 'SN-1\nSN-2',
};
const fallbackDevices = buildFallbackDevicesFromJobs([jobWithTwoDevices]);
assert.equal(fallbackDevices.length, 2);
assert.equal(fallbackDevices[1].source_job_id, 'job-2-devices::device-2');

let updatePayload = null;
const queryBuilder = {
  select() { return this; },
  eq() { return this; },
  async maybeSingle() { return { data: { ...jobWithTwoDevices }, error: null }; },
  update(payload) { updatePayload = payload; return this; },
  then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
};
const supabaseForJob = {
  from(table) {
    assert.equal(table, 'jobs');
    return queryBuilder;
  },
};
await updateFallbackJobDevice({
  supabase: supabaseForJob,
  isAdmin: true,
  device: { ...fallbackDevices[1], model: 'Model 2 poprawiony' },
});
assert.ok(updatePayload, 'K2: zapis urządzenia musi wykonać patch jobs.');
assert.deepEqual(
  Object.keys(updatePayload).sort(),
  ['device_model', 'device_serial_number'],
  'K2: zwykła edycja urządzenia może zmieniać tylko pola urządzeń, bez snapshotu klienta/adresu.',
);
assert.match(String(updatePayload.device_model || ''), /Model 1/);
assert.match(String(updatePayload.device_model || ''), /Model 2 poprawiony/);
for (const forbidden of ['contractor_id','client','title','email','phone','city','street','location','sms_recipient_phone']) {
  assert.equal(Object.prototype.hasOwnProperty.call(updatePayload, forbidden), false, `K2: payload nie może zawierać ${forbidden}.`);
}

const desktopContractors = read('src', 'components', 'contractors', 'ContractorsPanel.jsx');
assert.match(
  desktopContractors,
  /source_job_id:\s*index === 0 \? job\.id : `\$\{job\.id\}::device-\$\{index \+ 1\}`/,
  'K17: fallback desktop musi zachowywać indeks drugiego i kolejnych urządzeń.',
);

// K23 zgodnie z decyzją biznesową: zawsze dokładnie 5 lat.
assert.equal(normalizeDeviceRecord({ service_reminder_years: 1 }).service_reminder_years, 5);
assert.equal(normalizeDeviceRecord({ service_reminder_years: 10 }).service_reminder_years, 5);

let rpcPayload = null;
await upsertDevice({
  supabase: {
    async rpc(name, payload) {
      assert.equal(name, 'admin_upsert_device');
      rpcPayload = payload;
      return { data: { id: 'device-1', ...payload, service_reminder_years: 5 }, error: null };
    },
  },
  isAdmin: true,
  device: {
    id: 'device-1',
    contractor_id: 'contractor-1',
    model: 'Model',
    serial_number: 'SN',
    service_reminder_years: 2,
    source_kind: 'manual',
  },
});
assert.equal(rpcPayload.p_service_reminder_years, 5, 'K23: aplikacja zawsze wysyła stałe 5 lat.');

const migration = read('supabase', 'migrations', 'current', '20260929082000_fixed_service_reminder_years_v1176.sql');
assert.match(migration, /check \(service_reminder_years = 5\)/i);
assert.match(migration, /v_years integer := 5/i);
assert.match(migration, /set service_reminder_years = 5/i);

console.log('11.76 contractor stage 3 (K1/K2/K17 + fixed 5-year rule) smoke OK');
