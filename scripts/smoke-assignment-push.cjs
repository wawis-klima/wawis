const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function assertServerSidePushDateGuard() {
  const edgeFunctionPath = path.join(root, 'supabase', 'functions', 'send-assignment-push', 'index.ts');
  const source = fs.readFileSync(edgeFunctionPath, 'utf8');

  assert(source.includes('installation_date'), 'Edge Function send-assignment-push musi pobierać installation_date z jobs');
  assert(source.includes('isInstallationDateInPast(job.installation_date)'), 'Edge Function musi blokować push dla historycznej daty montażu');
  assert(source.includes('Data montażu jest w przeszłości'), 'Edge Function musi zapisać powód pominięcia push dla historycznego montażu');
  assert(source.includes('Europe/Warsaw'), 'Porównanie daty push powinno używać lokalnej daty Europe/Warsaw');
}

assertServerSidePushDateGuard();

function loadAssignmentModule() {
  const sourcePath = path.join(root, 'src', 'modules', 'jobs-assignment.js');
  let source = fs.readFileSync(sourcePath, 'utf8');
  source = source.replace(/import \{ supabaseAnonKey, supabaseUrl \} from "\.\.\/lib\/supabase\.js";\n/, "const supabaseAnonKey = 'mock-anon-key';\nconst supabaseUrl = 'mock://supabase';\n");
  source = source.replace(/export async function (\w+)\(/g, 'async function $1(');
  source = source.replace(/export function (\w+)\(/g, 'function $1(');
  source += '\nmodule.exports = { getAssignedUserIdsFromForm, getAssignedUserIdsFromJob, getLocalDateKey, isInstallationDateInPast, shouldSendAssignmentPushForInstallationDate, toggleJobViewer };\n';
  const sandbox = { module: { exports: {} }, exports: {}, console, Promise, Date, fetch: async () => ({ ok: true, json: async () => ({}) }) };
  vm.runInNewContext(source, sandbox, { filename: 'jobs-assignment.assignment-push-smoke.js' });
  return sandbox.module.exports;
}

function loadJobsFormModule(assignmentHelpers) {
  const sourcePath = path.join(root, 'src', 'modules', 'jobs-form.js');
  let source = fs.readFileSync(sourcePath, 'utf8');
  source = source.replace(
    /import \{[\s\S]*?\} from '\.\/jobs-assignment\.js';/,
    `const { getAssignedUserIdsFromForm, getAssignedUserIdsFromJob, shouldSendAssignmentPushForInstallationDate } = assignmentHelpers;`
  );
  source = source.replace(
    /import \{ applyAutoLinkedContractorToJobForm \} from '\.\/job-contractors\.js';/,
    `const applyAutoLinkedContractorToJobForm = (form = {}) => ({ form: { ...form }, contractor: null, autoLinked: false });`
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
  const sandbox = { module: { exports: {} }, exports: {}, console, Promise, setTimeout, clearTimeout, assignmentHelpers };
  vm.runInNewContext(source, sandbox, { filename: 'jobs-form.assignment-push-smoke.js' });
  return sandbox.module.exports;
}

function createSupabaseMock() {
  return {
    from(table) {
      if (table === 'jobs') {
        return {
          insert(payload) {
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: 'job-new', payload }, error: null };
                  },
                };
              },
            };
          },
          update(payload) {
            return {
              async eq(column, value) {
                assert.equal(column, 'id');
                return { data: { id: value, payload }, error: null };
              },
            };
          },
        };
      }
      if (table === 'job_access') {
        return {
          async insert() {
            return { error: null };
          },
          delete() {
            return {
              eq() {
                return {
                  async eq() {
                    return { error: null };
                  },
                  async in() {
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Nieobsługiwana tabela w smoke teście: ${table}`);
    },
  };
}

function dateKeyWithOffset(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function flushBackgroundJobs() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  const assignment = loadAssignmentModule();
  const jobsForm = loadJobsFormModule(assignment);

  const fixedToday = new Date(2026, 3, 30, 12, 0, 0);
  assert.equal(assignment.isInstallationDateInPast('2026-04-29', fixedToday), true, 'Wczorajszy montaż ma być traktowany jako historyczny');
  assert.equal(assignment.shouldSendAssignmentPushForInstallationDate('2026-04-29', fixedToday), false, 'Dla historycznego montażu push ma być wyłączony');
  assert.equal(assignment.shouldSendAssignmentPushForInstallationDate('2026-04-30', fixedToday), true, 'Dzisiejszy montaż nadal może wysłać push');
  assert.equal(assignment.shouldSendAssignmentPushForInstallationDate('2026-05-01', fixedToday), true, 'Przyszły montaż nadal może wysłać push');
  assert.equal(assignment.shouldSendAssignmentPushForInstallationDate('', fixedToday), true, 'Brak daty nie może blokować istniejącego flow');

  const yesterday = dateKeyWithOffset(-1);
  const tomorrow = dateKeyWithOffset(1);
  const baseForm = {
    ...jobsForm.EMPTY_JOB_FORM,
    client: 'Klient Push',
    city: 'Zawiercie',
    street: 'Testowa 1',
    phone: '600700800',
    main_technician_id: 'tech-main',
    viewers: ['tech-viewer'],
    devices: [{ model: 'Rotenso', serial_number: 'JW: 1 | JZ: 2' }],
  };

  const profile = { id: 'admin-1' };
  let pushes = [];
  await jobsForm.addJobRecord({
    supabase: createSupabaseMock(),
    profile,
    form: { ...baseForm, installation_date: yesterday },
    normalizeStatus: (status) => status || 'Nowe',
    createNotification: async () => {},
    sendAssignmentPushFn: async (payload) => { pushes.push(payload); },
  });
  assert.deepEqual(pushes, [], 'Nowe zlecenie z datą sprzed dzisiaj nie może wysłać push do instalatorów');

  await jobsForm.addJobRecord({
    supabase: createSupabaseMock(),
    profile,
    form: { ...baseForm, installation_date: tomorrow },
    normalizeStatus: (status) => status || 'Nowe',
    createNotification: async () => {},
    sendAssignmentPushFn: async (payload) => { pushes.push(payload); },
  });
  assert.equal(pushes.length, 1, 'Przyszły montaż powinien nadal wysłać push przy przypisaniu');

  pushes = [];
  await jobsForm.saveEditedJobRecord({
    supabase: createSupabaseMock(),
    editingJobId: 'job-edit-old',
    form: { ...baseForm, installation_date: yesterday },
    jobs: [{ id: 'job-edit-old', main_technician_id: null, viewers: [] }],
    normalizeStatus: (status) => status || 'Nowe',
    sendAssignmentPushFn: async (payload) => { pushes.push(payload); },
  });
  await flushBackgroundJobs();
  assert.deepEqual(pushes, [], 'Edycja historycznego montażu z nowymi instalatorami nie może wysłać push');

  await jobsForm.saveEditedJobRecord({
    supabase: createSupabaseMock(),
    editingJobId: 'job-edit-future',
    form: { ...baseForm, installation_date: tomorrow },
    jobs: [{ id: 'job-edit-future', main_technician_id: null, viewers: [] }],
    normalizeStatus: (status) => status || 'Nowe',
    sendAssignmentPushFn: async (payload) => { pushes.push(payload); },
  });
  await flushBackgroundJobs();
  assert.equal(pushes.length, 1, 'Edycja przyszłego montażu z nowymi instalatorami powinna nadal wysłać push');

  pushes = [];
  await assignment.toggleJobViewer({
    supabase: createSupabaseMock(),
    jobId: 'job-toggle-old',
    userId: 'tech-viewer',
    viewers: [],
    jobs: [{ id: 'job-toggle-old', installation_date: yesterday }],
    sendAssignmentPushFn: async (payload) => { pushes.push(payload); },
  });
  assert.deepEqual(pushes, [], 'Dodanie instalatora z poziomu szczegółów historycznego montażu nie może wysłać push');

  await assignment.toggleJobViewer({
    supabase: createSupabaseMock(),
    jobId: 'job-toggle-future',
    userId: 'tech-viewer',
    viewers: [],
    jobs: [{ id: 'job-toggle-future', installation_date: tomorrow }],
    sendAssignmentPushFn: async (payload) => { pushes.push(payload); },
  });
  assert.equal(pushes.length, 1, 'Dodanie instalatora do przyszłego montażu z poziomu szczegółów powinno nadal wysłać push');

  console.log('Assignment push smoke OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
