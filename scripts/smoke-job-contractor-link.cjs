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
    /import \{[\s\S]*?getAssignedUserIdsFromForm[\s\S]*?getAssignedUserIdsFromJob[\s\S]*?\} from '\.\/jobs-assignment\.js';/,
    `const getAssignedUserIdsFromForm = (form = {}) => {
      const userIds = [];
      if (form.main_technician_id) userIds.push(form.main_technician_id);
      for (const viewerId of Array.isArray(form.viewers) ? form.viewers : []) {
        if (viewerId) userIds.push(viewerId);
      }
      return [...new Set(userIds)];
    };
    const getAssignedUserIdsFromJob = (job = {}) => {
      const userIds = [];
      if (job?.main_technician_id) userIds.push(job.main_technician_id);
      for (const viewer of Array.isArray(job?.viewers) ? job.viewers : []) {
        if (viewer?.user_id) userIds.push(viewer.user_id);
      }
      return [...new Set(userIds)];
    };
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
    /import \{[\s\S]*?ensureJobFormDevices[\s\S]*?serializeJobDevicesToFields[\s\S]*?\} from '\.\/job-devices\.js';/,
    `const DEVICE_TYPE_SINGLE = 'single-split';
    function ensureJobFormDevices(input = {}) { return { ...input, devices: input.devices || [] }; }
    function serializeJobDevicesToFields(input = {}) {
      const first = Array.isArray(input.devices) ? input.devices[0] || {} : {};
      return { device_model: first.model || input.device_model || '', device_serial_number: first.serial_number || input.device_serial_number || '' };
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

function assertAutoLinkResolver() {
  const { findAutoLinkedContractor, applyAutoLinkedContractorToJobForm } = loadJobContractorsModule();
  const contractors = [
    { id: 'con-1', company_name: 'Michał Szota', city: 'Poręba', street: 'Jasna 5', phone: '600700800', email: 'michal@example.com' },
    { id: 'con-2', company_name: 'Michał Szota', city: 'Katowice', street: 'Długa 1', phone: '111222333', email: 'katowice@example.com' },
  ];

  const match = findAutoLinkedContractor({
    contractors,
    client: 'Michał Szota',
    city: 'Poręba',
    phone: '600-700-800',
  });
  assert.equal(match?.id, 'con-1');

  const ambiguous = findAutoLinkedContractor({
    contractors,
    client: 'Michał Szota',
  });
  assert.equal(ambiguous, null);

  const resolved = applyAutoLinkedContractorToJobForm({
    client: 'Michał Szota',
    email: '',
    phone: '',
    city: 'Poręba',
    street: '',
    contractor_id: '',
  }, contractors);
  assert.equal(resolved.form.contractor_id, 'con-1');
  assert.equal(resolved.form.phone, '600700800');
  assert.equal(resolved.form.email, 'michal@example.com');
  assert.equal(resolved.form.street, 'Jasna 5');
}

async function assertAddJobAutoLink() {
  const { EMPTY_JOB_FORM, addJobRecord, saveEditedJobRecord } = loadJobsFormModule();
  const contractors = [
    { id: 'con-1', company_name: 'Michał Szota', city: 'Poręba', street: 'Jasna 5', phone: '600700800', email: 'michal@example.com' },
  ];

  let insertPayload = null;
  let updatePayload = null;

  const supabase = {
    from(table) {
      if (table === 'jobs') {
        return {
          insert(payload) {
            insertPayload = payload;
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: 'job-1' }, error: null };
                  },
                };
              },
            };
          },
          update(payload) {
            updatePayload = payload;
            return {
              async eq() {
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'job_access') {
        return {
          async insert() { return { error: null }; },
          delete() {
            return {
              eq() {
                return {
                  async in() { return { error: null }; },
                };
              },
            };
          },
        };
      }
      throw new Error(`Nieobsługiwana tabela w smoke teście: ${table}`);
    },
  };

  const form = {
    ...EMPTY_JOB_FORM,
    client: 'Michał Szota',
    city: 'Poręba',
    street: '',
    phone: '',
    email: '',
    viewers: [],
  };

  await addJobRecord({
    supabase,
    profile: { id: 'admin-1' },
    form: { ...form, street: 'Jasna 5' },
    contractors,
    isAdmin: true,
    normalizeStatus: (status) => status || 'Nowe',
    createNotification: async () => {},
    sendAssignmentPushFn: null,
  });

  assert.ok(insertPayload, 'Brak payloadu insert dla addJobRecord');
  assert.equal(insertPayload.contractor_id, 'con-1');
  assert.equal(insertPayload.phone, '600700800');
  assert.equal(insertPayload.email, 'michal@example.com');

  await saveEditedJobRecord({
    supabase,
    editingJobId: 'job-1',
    form: { ...form, street: 'Jasna 5' },
    contractors,
    isAdmin: true,
    jobs: [{ id: 'job-1', viewers: [], main_technician_id: null }],
    normalizeStatus: (status) => status || 'Nowe',
    sendAssignmentPushFn: null,
  });

  assert.ok(updatePayload, 'Brak payloadu update dla saveEditedJobRecord');
  assert.equal(updatePayload.contractor_id, 'con-1');
  assert.equal(updatePayload.phone, '600700800');
  assert.equal(updatePayload.email, 'michal@example.com');
}

(async () => {
  assertAutoLinkResolver();
  await assertAddJobAutoLink();
  console.log('Job contractor auto-link smoke OK');
process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
