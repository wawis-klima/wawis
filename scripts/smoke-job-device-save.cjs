const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const modalSource = fs.readFileSync(path.join(root, 'src', 'components', 'modals', 'JobFormModal.jsx'), 'utf8');

assert.match(modalSource, /jobDevices\.map/);
assert.match(modalSource, /\+ Dodaj urządzenie/);
assert.match(modalSource, /addDeviceRow/);
assert.match(modalSource, /removeDeviceRow/);
assert.match(modalSource, /updateDeviceField\(index, "model", e\.target\.value\)/);
assert.match(modalSource, /function updateIndoorUnitField\(deviceIndex, indoorIndex, value\)/);
assert.match(modalSource, /function addIndoorUnit\(deviceIndex\)/);
assert.match(modalSource, /\+ Dodaj tylko jednostkę wewnętrzną/);
assert.match(modalSource, /updateDeviceField\(index, "outdoor_serial_number", e\.target\.value\)/);
assert.match(modalSource, /Stary zapis numeru seryjnego/);

function loadJobsFormModule() {
  const sourcePath = path.join(root, 'src', 'modules', 'jobs-form.js');
  let source = fs.readFileSync(sourcePath, 'utf8');
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
    `const applyAutoLinkedContractorToJobForm = (form = {}) => ({ form: { ...form }, contractor: null, autoLinked: false });`
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
    function formatSerial(device = {}) {
      const indoor = normalizeLine(device.indoor_serial_number);
      const outdoor = normalizeLine(device.outdoor_serial_number);
      const parts = [];
      if (indoor) parts.push(\`JW: \${indoor}\`);
      if (outdoor) parts.push(\`JZ: \${outdoor}\`);
      return parts.join(' | ');
    }
    function normalizeRows(input = {}, keepEmptyRow = false) {
      const sourceRows = Array.isArray(input.devices) && input.devices.length
        ? input.devices.map((device) => {
          const indoor = normalizeLine(device.indoor_serial_number);
          const outdoor = normalizeLine(device.outdoor_serial_number);
          const legacy = indoor || outdoor ? '' : normalizeLine(device.legacy_serial_number || device.serial_number);
          return {
            model: normalizeLine(device.model),
            indoor_serial_number: indoor,
            outdoor_serial_number: outdoor,
            legacy_serial_number: legacy,
            serial_number: formatSerial({ indoor_serial_number: indoor, outdoor_serial_number: outdoor }) || legacy,
          };
        })
        : (() => {
          const models = splitField(input.device_model);
          const serials = splitField(input.device_serial_number);
          return Array.from({ length: Math.max(models.length, serials.length) }, (_, index) => ({
            model: models[index] || '',
            serial_number: serials[index] || '',
          }));
        })();
      if (keepEmptyRow && Array.isArray(input.devices) && input.devices.length) {
        return sourceRows.length ? sourceRows : [{ model: '', serial_number: '', indoor_serial_number: '', outdoor_serial_number: '', legacy_serial_number: '' }];
      }
      const rows = sourceRows.filter((device) => device.model || device.serial_number || device.indoor_serial_number || device.outdoor_serial_number || device.legacy_serial_number);
      return rows.length ? rows : (keepEmptyRow ? [{ model: '', serial_number: '', indoor_serial_number: '', outdoor_serial_number: '', legacy_serial_number: '' }] : []);
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
  source += '\nmodule.exports = { EMPTY_JOB_FORM, saveEditedJobRecord };\n';
  const sandbox = { module: { exports: {} }, exports: {}, console, Promise, setTimeout, clearTimeout };
  vm.runInNewContext(source, sandbox, { filename: 'jobs-form.device-save-smoke.js' });
  return sandbox.module.exports;
}

async function assertSaveEditedJobRecord() {
  const { EMPTY_JOB_FORM, saveEditedJobRecord } = loadJobsFormModule();
  let jobsUpdatePayload = null;
  let updatedJobId = null;

  const supabase = {
    from(table) {
      if (table === 'jobs') {
        return {
          update(payload) {
            jobsUpdatePayload = payload;
            return {
              async eq(column, value) {
                assert.equal(column, 'id');
                updatedJobId = value;
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'job_access') {
        return {
          delete() {
            return {
              eq() {
                return {
                  async in() {
                    return { error: null };
                  },
                };
              },
            };
          },
          async insert() {
            return { error: null };
          },
        };
      }
      throw new Error(`Nieobsługiwana tabela w smoke teście: ${table}`);
    },
  };

  const form = {
    ...EMPTY_JOB_FORM,
    client: 'Klient testowy',
    city: 'Zawiercie',
    street: 'Przyjaźni 136',
    phone: '600700800',
    contractor_id: '',
    devices: [
      { model: '  Rotenso Imoto X  ', indoor_serial_number: '  JW-2026-0001  ', outdoor_serial_number: '  JZ-2026-0001  ' },
      { model: '  Daikin Stylish  ', indoor_serial_number: '  JW-2026-0002  ', outdoor_serial_number: '  JZ-2026-0002  ' },
    ],
    viewers: [],
  };

  await saveEditedJobRecord({
    supabase,
    editingJobId: 'job-456',
    form,
    jobs: [{ id: 'job-456', viewers: [], main_technician_id: null }],
    normalizeStatus: (status) => status || 'Nowe',
    sendAssignmentPushFn: null,
  });

  assert.equal(updatedJobId, 'job-456');
  assert.ok(jobsUpdatePayload, 'Nie zapisano payloadu dla aktualizacji jobs');
  assert.equal(jobsUpdatePayload.device_model, 'Rotenso Imoto X\nDaikin Stylish');
  assert.equal(jobsUpdatePayload.device_serial_number, 'JW: JW-2026-0001 | JZ: JZ-2026-0001\nJW: JW-2026-0002 | JZ: JZ-2026-0002');
  assert.equal(jobsUpdatePayload.contractor_id, null);
  assert.equal(jobsUpdatePayload.location, 'Zawiercie, Przyjaźni 136');
}

assertSaveEditedJobRecord().then(() => {
  console.log('Job device save smoke OK');
process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
