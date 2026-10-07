const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadJobContractorsModule() {
  let source = fs.readFileSync(path.join(root, 'src', 'modules', 'job-contractors.js'), 'utf8');
  source = source.replace(/export function (\w+)\(/g, 'function $1(');
  source += '\nmodule.exports = { findAutoLinkedContractor, applyAutoLinkedContractorToJobForm };\n';
  const sandbox = { module: { exports: {} }, exports: {}, console };
  vm.runInNewContext(source, sandbox, { filename: 'job-contractors.smoke.js' });
  return sandbox.module.exports;
}

function loadJobsFormModule() {
  let source = fs.readFileSync(path.join(root, 'src', 'modules', 'jobs-form.js'), 'utf8');
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
    `const { applyAutoLinkedContractorToJobForm } = (() => {
      let source = fs.readFileSync(path.join(root, 'src', 'modules', 'job-contractors.js'), 'utf8');
      source = source.replace(/export function (\\w+)\\(/g, 'function $1(');
      source += '\\nmodule.exports = { applyAutoLinkedContractorToJobForm };\\n';
      const sandbox = { module: { exports: {} }, exports: {}, console };
      vm.runInNewContext(source, sandbox, { filename: 'job-contractors.inline-smoke.js' });
      return sandbox.module.exports;
    })();`
  );
  source = source.replace(
    /import \{ insertJobIdempotently \} from '\.\/job-create-idempotency\.js';/,
    `const insertJobIdempotently = async ({ supabase, payload, selectFields = 'id' }) => {
      const result = await supabase.from('jobs').insert(payload).select(selectFields).single();
      if (result?.error) throw result.error;
      const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
      if (!row?.id) throw new Error('Baza nie zwróciła identyfikatora zapisanego montażu.');
      return row;
    };`
  );
  source = source.replace(
    /import \{[\s\S]*?\} from '\.\/job-devices\.js';/,
    `const DEVICE_TYPE_SINGLE = 'single-split';
    function ensureJobFormDevices(input = {}) { return { ...input, devices: Array.isArray(input.devices) ? input.devices : [] }; }
    function getJobDeviceRows(input = {}) { return Array.isArray(input.devices) ? input.devices : []; }
    function serializeJobDevicesToFields(input = {}) {
      const devices = Array.isArray(input.devices) ? input.devices : [];
      return {
        device_model: devices.length ? devices.map((device) => String(device.model || '').trim()).join('\\n') : String(input.device_model || '').trim(),
        device_serial_number: devices.length ? devices.map((device) => String(device.serial_number || '').trim()).join('\\n') : String(input.device_serial_number || '').trim(),
      };
    }`
  );
  source = source.replace(/export const (\w+) =/g, 'const $1 =');
  source = source.replace(/export async function (\w+)\(/g, 'async function $1(');
  source = source.replace(/export function (\w+)\(/g, 'function $1(');
  source += '\nmodule.exports = { EMPTY_JOB_FORM, addJobRecord, saveEditedJobRecord };\n';
  const sandbox = { module: { exports: {} }, exports: {}, console, Promise, setTimeout, clearTimeout, fs, path, root, vm };
  vm.runInNewContext(source, sandbox, { filename: 'jobs-form.contractor-link-smoke.js' });
  return sandbox.module.exports;
}

(async () => {
  const { findAutoLinkedContractor, applyAutoLinkedContractorToJobForm } = loadJobContractorsModule();
  const { EMPTY_JOB_FORM, addJobRecord, saveEditedJobRecord } = loadJobsFormModule();

  const contractors = [
    { id: 'con-1', company_name: 'Michał Szota', city: 'Poręba', street: 'Jasna 5', phone: '600700800', email: 'michal@example.com' },
    { id: 'con-2', company_name: 'Michał Szota', city: 'Katowice', street: 'Długa 1', phone: '111222333', email: 'katowice@example.com' },
  ];

  const match = findAutoLinkedContractor({ contractors, client: 'Michał Szota', city: 'Poręba', phone: '600-700-800' });
  assert.equal(match?.id, 'con-1');
  assert.equal(findAutoLinkedContractor({ contractors, client: 'Michał Szota' }), null);

  const resolved = applyAutoLinkedContractorToJobForm({
    client: 'Michał Szota', email: '', phone: '', city: 'Poręba', street: '', contractor_id: '',
  }, contractors);
  assert.equal(resolved.form.contractor_id, 'con-1');
  assert.equal(resolved.form.phone, '600700800');
  assert.equal(resolved.form.email, 'michal@example.com');
  assert.equal(resolved.form.street, 'Jasna 5');

  let insertPayload = null;
  let editRpc = null;
  const supabase = {
    async rpc(name, payload) {
      if (name === 'save_job_concurrent_v1168') {
        editRpc = payload;
        return { data: { id: payload.p_id, installer_ids: payload.p_installer_ids }, error: null };
      }
      throw new Error(`Nieoczekiwane RPC: ${name}`);
    },
    from(table) {
      if (table === 'jobs') {
        return {
          insert(payload) {
            insertPayload = payload;
            return { select() { return { async single() { return { data: { id: 'job-1' }, error: null }; } }; } };
          },
        };
      }
      if (table === 'job_access') return { async insert() { return { error: null }; } };
      throw new Error(`Nieobsługiwana tabela: ${table}`);
    },
  };

  const form = {
    ...EMPTY_JOB_FORM,
    client: 'Michał Szota',
    city: 'Poręba',
    street: 'Jasna 5',
    phone: '',
    email: '',
    viewers: [],
  };

  await addJobRecord({
    supabase,
    profile: { id: 'admin-1' },
    form,
    contractors,
    isAdmin: true,
    normalizeStatus: (status) => status || 'Nowe',
    createNotification: async () => {},
    sendAssignmentPushFn: null,
  });

  assert.equal(insertPayload.contractor_id, 'con-1');
  assert.equal(insertPayload.phone, '600700800');
  assert.equal(insertPayload.email, 'michal@example.com');

  const baseJob = {
    id: 'job-1',
    title: 'Michał Szota',
    client: 'Michał Szota',
    email: '',
    phone: '',
    sms_recipient_phone: '',
    city: 'Poręba',
    street: 'Jasna 5',
    location: 'Poręba, Jasna 5',
    status: 'Nowe',
    installation_date: null,
    admin_note: null,
    main_technician_id: null,
    contractor_id: null,
    contractor_address_id: null,
    device_model: null,
    device_serial_number: null,
    installer_ids: [],
    viewers: [],
  };

  await saveEditedJobRecord({
    supabase,
    editingJobId: 'job-1',
    form,
    baseJob,
    contractors,
    isAdmin: true,
    jobs: [baseJob],
    normalizeStatus: (status) => status || 'Nowe',
    sendAssignmentPushFn: null,
  });

  assert.ok(editRpc, 'Edycja musi użyć atomowego RPC 11.68.');
  assert.equal(editRpc.p_fields.contractor_id, 'con-1');
  assert.equal(editRpc.p_fields.phone, '600700800');
  assert.equal(editRpc.p_fields.email, 'michal@example.com');
  assert.equal(Object.prototype.hasOwnProperty.call(editRpc.p_fields, 'status'), false, 'Niezmieniony status nie może wracać w UPDATE.');

  console.log('Job contractor auto-link smoke OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
