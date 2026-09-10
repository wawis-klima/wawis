const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadJobsFormModule() {
  let source = fs.readFileSync(path.join(root, 'src', 'modules', 'jobs-form.js'), 'utf8');
  source = source.replace(
    /import \{[\s\S]*?getAssignedUserIdsFromForm[\s\S]*?getAssignedUserIdsFromJob[\s\S]*?\} from '\.\/jobs-assignment\.js';/,
    `const getAssignedUserIdsFromForm = (form = {}) => {
      const ids = [form.main_technician_id, ...(Array.isArray(form.viewers) ? form.viewers : [])].filter(Boolean);
      return [...new Set(ids)];
    };
    const getAssignedUserIdsFromJob = () => [];
    const shouldSendAssignmentPushForInstallationDate = () => true;`,
  );
  source = source.replace(
    /import \{ applyAutoLinkedContractorToJobForm \} from '\.\/job-contractors\.js';/,
    `const { applyAutoLinkedContractorToJobForm } = (() => {
      let source = fs.readFileSync(path.join(root, 'src', 'modules', 'job-contractors.js'), 'utf8');
      source = source.replace(/export function (\\w+)\\(/g, 'function $1(');
      source += '\\nmodule.exports = { applyAutoLinkedContractorToJobForm };\\n';
      const sandbox = { module: { exports: {} }, exports: {}, console };
      vm.runInNewContext(source, sandbox, { filename: 'job-contractors.auto-create-smoke.js' });
      return sandbox.module.exports;
    })();`,
  );
  source = source.replace(
    /import \{[\s\S]*?ensureJobFormDevices[\s\S]*?serializeJobDevicesToFields[\s\S]*?\} from '\.\/job-devices\.js';/,
    `const DEVICE_TYPE_SINGLE = 'single-split';
    function normalizeLine(value) {
      return String(value || '').replace(/[\\r\\n]+/g, ' ').replace(/\\s+/g, ' ').trim();
    }
    function splitField(value) {
      const raw = String(value || '');
      return raw ? raw.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').split('\\n').map(normalizeLine) : [];
    }
    function normalizeRows(input = {}, keepEmptyRow = false) {
      const sourceRows = Array.isArray(input.devices) && input.devices.length
        ? input.devices.map((device) => ({ model: normalizeLine(device.model), serial_number: normalizeLine(device.serial_number) }))
        : (() => {
          const models = splitField(input.device_model);
          const serials = splitField(input.device_serial_number);
          return Array.from({ length: Math.max(models.length, serials.length) }, (_, index) => ({
            model: models[index] || '',
            serial_number: serials[index] || '',
          }));
        })();
      if (keepEmptyRow && Array.isArray(input.devices) && input.devices.length) {
        return sourceRows.length ? sourceRows : [{ model: '', serial_number: '' }];
      }
      const rows = sourceRows.filter((device) => device.model || device.serial_number);
      return rows.length ? rows : (keepEmptyRow ? [{ model: '', serial_number: '' }] : []);
    }
    function serializeJobDevicesToFields(input = {}) {
      const devices = normalizeRows(input);
      return {
        devices,
        device_model: devices.map((device) => device.model || '').join('\\n'),
        device_serial_number: devices.map((device) => device.serial_number || '').join('\\n'),
      };
    }
    function ensureJobFormDevices(input = {}) {
      const devices = normalizeRows(input, true);
      const serialized = serializeJobDevicesToFields({ devices });
      return { ...input, devices, device_model: serialized.device_model, device_serial_number: serialized.device_serial_number };
    }`
  );
  source = source.replace(/export const (\w+) =/g, 'const $1 =');
  source = source.replace(/export async function (\w+)\(/g, 'async function $1(');
  source = source.replace(/export function (\w+)\(/g, 'function $1(');
  source += '\nmodule.exports = { EMPTY_JOB_FORM, addJobRecord };\n';
  const sandbox = { module: { exports: {} }, exports: {}, console, Promise, setTimeout, clearTimeout, fs, path, root, vm };
  vm.runInNewContext(source, sandbox, { filename: 'jobs-form.auto-create-smoke.js' });
  return sandbox.module.exports;
}

function loadContractorsModule() {
  let source = fs.readFileSync(path.join(root, 'src', 'modules', 'contractors.js'), 'utf8');
  source = source.replace(/export const (\w+) =/g, 'const $1 =');
  source = source.replace(/export function (\w+)\(/g, 'function $1(');
  source += '\nmodule.exports = { buildContractorsWithJobFallback, isJobDerivedContractor };\n';
  const sandbox = { module: { exports: {} }, exports: {}, console, Map, Set, Date };
  vm.runInNewContext(source, sandbox, { filename: 'contractors.auto-create-smoke.js' });
  return sandbox.module.exports;
}

(async () => {
  const { EMPTY_JOB_FORM, addJobRecord } = loadJobsFormModule();
  const { buildContractorsWithJobFallback, isJobDerivedContractor } = loadContractorsModule();

  let insertPayload = null;
  let createdContractorPayload = null;

  const supabase = {
    async rpc(name, payload) {
      assert.equal(name, 'admin_upsert_contractor');
      createdContractorPayload = payload;
      return {
        data: {
          id: 'con-robert-kolanko',
          company_name: payload.p_company_name,
          phone: payload.p_phone || '',
          email: payload.p_email || '',
          city: payload.p_city || '',
          street: payload.p_street || '',
          is_active: true,
        },
        error: null,
      };
    },
    from(table) {
      if (table === 'jobs') {
        return {
          insert(payload) {
            insertPayload = payload;
            return {
              select() {
                return { async single() { return { data: { id: 'job-robert' }, error: null }; } };
              },
            };
          },
        };
      }
      if (table === 'job_access') return { async insert() { return { error: null }; } };
      throw new Error(`Nieobsługiwana tabela w smoke teście: ${table}`);
    },
  };

  await addJobRecord({
    supabase,
    profile: { id: 'admin-1' },
    form: {
      ...EMPTY_JOB_FORM,
      client: 'Robert Kolanko',
      phone: '600 111 222',
      email: 'robert@example.com',
      city: 'Siamoszyce',
      street: 'Główna 1',
      device_model: 'Gree Amber',
      device_serial_number: 'SN-ROBERT-1',
      viewers: [],
    },
    contractors: [],
    isAdmin: true,
    normalizeStatus: (status) => status || 'Nowe',
    createNotification: async () => {},
    sendAssignmentPushFn: null,
  });

  assert.ok(createdContractorPayload, 'Nowe zlecenie bez contractor_id powinno utworzyć kontrahenta przez RPC');
  assert.equal(createdContractorPayload.p_company_name, 'Robert Kolanko');
  assert.equal(createdContractorPayload.p_phone, '600 111 222');
  assert.equal(createdContractorPayload.p_city, 'Siamoszyce');
  assert.equal(createdContractorPayload.p_addresses.length, 1);
  assert.equal(createdContractorPayload.p_addresses[0].street, 'Główna 1');
  assert.equal(insertPayload.contractor_id, 'con-robert-kolanko');
  assert.ok(insertPayload.contractor_address_id, 'Nowe zlecenie powinno zapisać identyfikator adresu kontrahenta.');

  const fallbackList = buildContractorsWithJobFallback([], [{
    id: 'job-legacy-robert',
    client: 'Robert Kolanko',
    phone: '600 111 222',
    city: 'Siamoszyce',
    street: 'Główna 1',
    contractor_id: '',
    device_model: 'Gree Amber',
    device_serial_number: 'SN-ROBERT-1',
  }]);
  assert.equal(fallbackList.length, 1);
  assert.equal(fallbackList[0].company_name, 'Robert Kolanko');
  assert.equal(fallbackList[0].source_job_ids[0], 'job-legacy-robert');
  assert.equal(isJobDerivedContractor(fallbackList[0]), true);

  const hiddenFallback = buildContractorsWithJobFallback([
    { id: 'con-existing', company_name: 'Robert Kolanko', city: 'Siamoszyce', is_active: true },
  ], [
    { id: 'job-legacy-robert', client: 'Robert Kolanko', contractor_id: '', city: 'Siamoszyce' },
  ]);
  assert.equal(hiddenFallback.length, 1);
  assert.equal(isJobDerivedContractor(hiddenFallback[0]), false);

  console.log('Job auto contractor create smoke OK');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
