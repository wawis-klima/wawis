const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

const modalSource = read('src', 'components', 'modals', 'JobFormModal.jsx');
assert.match(modalSource, /jobDevices\.map/);
assert.match(modalSource, /\+ Dodaj urządzenie/);
assert.match(modalSource, /\+ Dodaj tylko jednostkę wewnętrzną/);
assert.match(modalSource, /Stary zapis numeru seryjnego/);

function loadJobsFormModule() {
  let source = read('src', 'modules', 'jobs-form.js');
  source = source.replace(
    /import \{[\s\S]*?\} from '\.\/jobs-assignment\.js';/,
    `const normalizeInstallerIds = (ids = []) => [...new Set((ids || []).filter(Boolean).map(String))].sort();
    const getAssignedUserIdsFromForm = (form = {}) => normalizeInstallerIds([form.main_technician_id, ...(Array.isArray(form.viewers) ? form.viewers : [])]);
    const getAssignedUserIdsFromJob = (job = {}) => Array.isArray(job.installer_ids) ? normalizeInstallerIds(job.installer_ids) : normalizeInstallerIds([job.main_technician_id]);
    const getLegacyInstallerSuggestionIds = (job = {}) => normalizeInstallerIds([job.main_technician_id, ...(Array.isArray(job.viewers) ? job.viewers.map((viewer) => viewer?.user_id) : [])]);
    const shouldSendAssignmentPushForInstallationDate = () => true;`
  );
  source = source.replace(
    /import \{ applyAutoLinkedContractorToJobForm \} from '\.\/job-contractors\.js';/,
    `const applyAutoLinkedContractorToJobForm = (form = {}) => ({ form: { ...form }, contractor: null, autoLinked: false });`
  );
  source = source.replace(
    /import \{[\s\S]*?\} from '\.\/job-devices\.js';/,
    `const DEVICE_TYPE_SINGLE = 'single-split';
    function normalizeLine(value) { return String(value || '').replace(/[\\r\\n]+/g, ' ').replace(/\\s+/g, ' ').trim(); }
    function serializeJobDevicesToFields(input = {}) {
      const devices = Array.isArray(input.devices) ? input.devices : [];
      return {
        devices,
        device_model: devices.length ? devices.map((device) => normalizeLine(device.model)).join('\\n') : normalizeLine(input.device_model),
        device_serial_number: devices.length ? devices.map((device) => normalizeLine(device.serial_number)).join('\\n') : normalizeLine(input.device_serial_number),
      };
    }
    function ensureJobFormDevices(input = {}) { return { ...input, devices: Array.isArray(input.devices) ? input.devices : [] }; }
    function getJobDeviceRows(input = {}) { return Array.isArray(input.devices) ? input.devices : []; }`
  );
  source = source.replace(/export const (\w+) =/g, 'const $1 =');
  source = source.replace(/export async function (\w+)\(/g, 'async function $1(');
  source = source.replace(/export function (\w+)\(/g, 'function $1(');
  source += '\nmodule.exports = { buildJobEditChangeSet, saveJobDeviceSerialsRecord };\n';

  const sandbox = { module: { exports: {} }, exports: {}, console, Promise, setTimeout, clearTimeout };
  vm.runInNewContext(source, sandbox, { filename: 'jobs-form.device-save-smoke.js' });
  return sandbox.module.exports;
}

(async () => {
  const { buildJobEditChangeSet, saveJobDeviceSerialsRecord } = loadJobsFormModule();

  const baseJob = {
    id: 'job-456',
    title: 'Klient testowy',
    client: 'Klient testowy',
    email: 'a@example.com',
    phone: '600700800',
    sms_recipient_phone: '600700800',
    city: 'Zawiercie',
    street: 'Przyjaźni 136',
    location: 'Zawiercie, Przyjaźni 136',
    status: 'W trakcie',
    installation_date: '2026-09-28',
    contractor_id: 'contractor-1',
    contractor_address_id: 'address-1',
    device_model: 'Rotenso Imoto',
    device_serial_number: 'OLD-SN',
    admin_note: 'Notatka',
    main_technician_id: 'tech-main',
    installer_ids: ['tech-main', 'tech-viewer'],
  };

  const form = {
    client: 'Klient testowy',
    email: 'a@example.com',
    phone: '700800900',
    city: 'Zawiercie',
    street: 'Przyjaźni 136',
    status: 'W trakcie',
    installation_date: '2026-09-28',
    contractor_id: 'contractor-1',
    contractor_address_id: 'address-1',
    admin_note: 'Notatka',
    main_technician_id: 'tech-main',
    viewers: ['tech-viewer'],
    devices: [{ model: 'Rotenso Imoto', serial_number: 'OLD-SN' }],
  };

  const changeSet = buildJobEditChangeSet({
    form,
    baseJob,
    isAdmin: true,
    normalizeStatus: (status) => status || 'Nowe',
  });

  assert.deepEqual(
    Object.keys(changeSet.fields).sort(),
    ['phone', 'sms_recipient_phone'],
    'C7: zmiana telefonu nie może wysłać starego statusu, urządzeń ani innych pól snapshotu.',
  );
  assert.equal(changeSet.expected.phone, '600700800');
  assert.equal(changeSet.expected.sms_recipient_phone, '600700800');
  assert.equal(Object.prototype.hasOwnProperty.call(changeSet.fields, 'status'), false);

  let rpcName = '';
  let rpcPayload = null;
  const supabase = {
    async rpc(name, payload) {
      rpcName = name;
      rpcPayload = payload;
      return { data: { id: 'job-456', status: 'W trakcie' }, error: null };
    },
  };

  await saveJobDeviceSerialsRecord({
    supabase,
    editingJobId: 'job-456',
    baseJob,
    form: {
      ...form,
      devices: [{ model: 'Rotenso Imoto X', serial_number: 'NEW-SN' }],
    },
  });

  assert.equal(rpcName, 'save_job_concurrent_v1168');
  assert.equal(JSON.stringify(rpcPayload.p_fields), JSON.stringify({
    device_model: 'Rotenso Imoto X',
    device_serial_number: 'NEW-SN',
  }));
  assert.equal(JSON.stringify(rpcPayload.p_expected), JSON.stringify({
    device_model: 'Rotenso Imoto',
    device_serial_number: 'OLD-SN',
  }));
  assert.equal(rpcPayload.p_update_installers, false);

  const source = read('src', 'modules', 'jobs-form.js');
  assert.match(source, /JOB_EDIT_CONFLICT|save_job_concurrent_v1168/);
  assert.match(source, /buildJobEditChangeSet/);

  console.log('Job device/concurrency save smoke OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
