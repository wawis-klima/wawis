const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readSql } = require('./sql-paths.cjs');

const root = path.resolve(__dirname, '..');

function loadRefreshAppData() {
  const sourcePath = path.join(__dirname, '..', 'src', 'modules', 'jobs-fetch.js');
  let source = fs.readFileSync(sourcePath, 'utf8');

  source = source.replace(
    'import { normalizeStatus as normalizeJobStatus } from "../utils/jobPermissions.js";',
    `const normalizeJobStatus = (status) => {
      if (status === "Nowe zlecenie") return "Nowe";
      if (status === "Nowe") return "Nowe";
      return status || "Nowe";
    };`
  );
  source = source.replace(
    'import { getPhotoStoragePath } from "./photos.js";',
    `const getPhotoStoragePath = ({ photo }) => photo?.storage_path || '';`
  );
  source = source.replace(/export async function (\w+)\(/g, 'async function $1(');
  source += '\nmodule.exports = { refreshAppData, loadJobDetailsData };\n';

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    Promise,
  };

  vm.runInNewContext(source, sandbox, { filename: 'jobs-fetch.smoke-eval.js' });
  return sandbox.module.exports.refreshAppData;
}

function loadJobPermissions() {
  const sourcePath = path.join(__dirname, '..', 'src', 'utils', 'jobPermissions.js');
  let source = fs.readFileSync(sourcePath, 'utf8');

  source = source.replace(/export const (\w+) =/g, 'const $1 =');
  source = source.replace(/export function (\w+)/g, 'function $1');
  source += '\nmodule.exports = { STATUSES, normalizeStatus, isCompletedJob, isWorkerLockedCompletedJob, canWorkerFinishJob, canEditJob, canModifyJobPhotos, canAddJobComment, canManageJobViewers, canManageAdminNote, canDeleteJobComment, canDeleteJob, canChangeJobStatus };\n';

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
  };

  vm.runInNewContext(source, sandbox, { filename: 'job-permissions.smoke-eval.js' });
  return sandbox.module.exports;
}


function loadJobContractorsModule() {
  const sourcePath = path.join(__dirname, '..', 'src', 'modules', 'job-contractors.js');
  let source = fs.readFileSync(sourcePath, 'utf8');

  source = source.replace(/export function (\w+)/g, 'function $1');
  source += '\nmodule.exports = { filterContractorsByQuery, getDuplicateContractorMatch, buildContractorOptionLabel };\n';

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
  };

  vm.runInNewContext(source, sandbox, { filename: 'job-contractors.smoke-eval.js' });
  return sandbox.module.exports;
}

function runContractorLookupSmoke({ filterContractorsByQuery, getDuplicateContractorMatch, buildContractorOptionLabel }) {
  const contractors = [
    { id: 'c-1', company_name: 'Jan Kowalski', phone: '500 600 700', email: 'jan@test.pl', city: 'Katowice', street: 'Lipowa 10', nip: '1234567890' },
    { id: 'c-2', company_name: 'Firma Testowa', phone: '111222333', email: 'firma@test.pl', city: 'Gliwice', street: 'Dworcowa 5', nip: '9876543210' },
  ];

  assert.equal(filterContractorsByQuery(contractors, 'Kowalski').length, 1);
  assert.equal(filterContractorsByQuery(contractors, '1234567890').length, 1);
  assert.equal(filterContractorsByQuery(contractors, '500600700').length, 1);
  assert.equal(filterContractorsByQuery(contractors, 'Lipowa').length, 1);
  assert.equal(filterContractorsByQuery(contractors, 'Dworcowa 5').length, 1);

  const duplicate = getDuplicateContractorMatch({ contractors, client: '  jan kowalski ' });
  assert.equal(duplicate?.id, 'c-1');
  assert.equal(getDuplicateContractorMatch({ contractors, contractorId: 'c-1', client: 'Jan Kowalski' }), null);

  const optionLabel = buildContractorOptionLabel(contractors[0]);
  assert.match(optionLabel, /Jan Kowalski/);
  assert.match(optionLabel, /Lipowa 10/);
  assert.match(optionLabel, /500 600 700/);
  assert.match(optionLabel, /1234567890/);
}

function loadContractorsModule() {
  const sourcePath = path.join(__dirname, '..', 'src', 'modules', 'contractors.js');
  let source = fs.readFileSync(sourcePath, 'utf8');

  source = source.replace(/export function (\w+)/g, 'function $1');
  source += '\nmodule.exports = { getEmptyContractorForm, normalizeContractorRecord, buildContractorPayload, getContractorAddress, findContractorDuplicates };\n';

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
  };

  vm.runInNewContext(source, sandbox, { filename: 'contractors.smoke-eval.js' });
  return sandbox.module.exports;
}

function runContractorsDuplicateSmoke({ findContractorDuplicates }) {
  const contractors = [
    { id: 'con-1', company_name: 'Jan Kowalski', phone: '500 600 700', email: 'jan@test.pl', street: 'Lipowa 10', city: 'Katowice', nip: '1234567890' },
    { id: 'con-2', company_name: 'Firma Testowa', phone: '111222333', email: 'firma@test.pl', street: 'Dworcowa 5', city: 'Gliwice', nip: '9876543210' },
  ];

  const duplicatesByName = findContractorDuplicates(contractors, { company_name: ' jan kowalski ' });
  assert.equal(duplicatesByName[0]?.contractor?.id, 'con-1');
  assert.match(duplicatesByName[0]?.reasons?.join(' '), /nazwa/);

  const duplicatesByPhone = findContractorDuplicates(contractors, { phone: '500600700' });
  assert.equal(duplicatesByPhone[0]?.contractor?.id, 'con-1');
  assert.match(duplicatesByPhone[0]?.reasons?.join(' '), /telefon/);

  const duplicatesByStreet = findContractorDuplicates(contractors, { street: ' Dworcowa 5 ' });
  assert.equal(duplicatesByStreet[0]?.contractor?.id, 'con-2');
  assert.match(duplicatesByStreet[0]?.reasons?.join(' '), /ulica/);

  const duplicatesByNip = findContractorDuplicates(contractors, { nip: '987-654-32-10' });
  assert.equal(duplicatesByNip[0]?.contractor?.id, 'con-2');
  assert.match(duplicatesByNip[0]?.reasons?.join(' '), /NIP/);

  assert.equal(findContractorDuplicates(contractors, { id: 'con-1', company_name: 'Jan Kowalski' }).length, 0);
}


function runDevicesModuleSmoke() {
  const moduleSwitcherPath = path.join(__dirname, '..', 'src', 'components', 'layout', 'ModuleSwitcher.jsx');
  const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
  const devicesPanelPath = path.join(__dirname, '..', 'src', 'components', 'devices', 'DevicesPanel.jsx');

  const moduleSwitcherSource = fs.readFileSync(moduleSwitcherPath, 'utf8');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const devicesPanelSource = fs.readFileSync(devicesPanelPath, 'utf8');

  assert.match(moduleSwitcherSource, /id:\s*"devices"/);
  assert.match(moduleSwitcherSource, /Urządzenia/);
  assert.match(appSource, /activeModule === "devices"/);
  assert.match(appSource, /DevicesPanel/);
  assert.match(devicesPanelSource, /<h1>Urządzenia<\/h1>|Przegląd urządzeń na desktopie/);
  assert.match(devicesPanelSource, /admin_update_device_status|Status urządzenia/);
  assert.match(devicesPanelSource, /Źródło: tabela devices|Źródło awaryjne: montaże/);
  assert.match(devicesPanelSource, /Import XLSX/);
}

function runContractorDevicesEditSmoke() {
  const contractorsPanelPath = path.join(__dirname, '..', 'src', 'components', 'contractors', 'ContractorsPanel.jsx');
  const xlsxImportPath = path.join(__dirname, '..', 'src', 'utils', 'xlsxImport.js');
  const contractorsPanelSource = fs.readFileSync(contractorsPanelPath, 'utf8');
  const xlsxImportSource = fs.readFileSync(xlsxImportPath, 'utf8');

  assert.match(contractorsPanelSource, /Edytuj urządzenie/);
  assert.match(contractorsPanelSource, /saveDeviceRecord/);
  assert.match(xlsxImportSource, /parseXlsxDevicesFile/);
  assert.match(xlsxImportSource, /DEVICE_HEADER_ALIASES/);
}

function runDevicesSqlSmoke() {
  const sql = readSql(root, 'devices-module-stage-3-sync.sql');
  assert.match(sql, /create table if not exists public\.devices/i);
  assert.match(sql, /admin_list_devices_with_contractor/i);
  assert.match(sql, /admin_update_device_status/i);
  assert.match(sql, /admin_sync_devices_from_jobs/i);
  assert.match(sql, /jobs_sync_device_after_change/i);
}

function runStage10SqlSmoke() {
  const sql = readSql(root, 'contractors-module-stage-10-contact-duplicate-guards.sql');
  assert.match(sql, /normalize_contractors_email/i);
  assert.match(sql, /normalize_contractors_phone/i);
  assert.match(sql, /normalize_contractors_nip/i);
  assert.match(sql, /contractors_contact_duplicates_guard/i);
  assert.match(sql, /duplikat po polu/i);
}

function sortRows(rows, field, ascending = true) {
  return [...rows].sort((a, b) => {
    const left = a?.[field];
    const right = b?.[field];
    if (left === right) return 0;
    if (left == null) return ascending ? 1 : -1;
    if (right == null) return ascending ? -1 : 1;
    return ascending ? String(left).localeCompare(String(right)) : String(right).localeCompare(String(left));
  });
}

function createSupabaseMock(seed) {
  const tables = {
    profiles: [...(seed.profiles || [])],
    jobs: [...(seed.jobs || [])],
    job_access: [...(seed.job_access || [])],
    comments: [...(seed.comments || [])],
    photos: [...(seed.photos || [])],
    nameplate_manual_verifications: [...(seed.nameplate_manual_verifications || [])],
    notifications: [...(seed.notifications || [])],
  };

  function makeBuilder(tableName) {
    let mode = 'select';
    let filters = [];
    let singleMode = null;
    let orderBy = null;
    let pendingUpdate = null;

    const builder = {
      select() {
        mode = 'select';
        return builder;
      },
      update(payload) {
        mode = 'update';
        pendingUpdate = payload;
        return builder;
      },
      upsert(payload) {
        const row = Array.isArray(payload) ? payload[0] : payload;
        const index = tables[tableName].findIndex((item) => item.id === row.id);
        if (index >= 0) tables[tableName][index] = { ...tables[tableName][index], ...row };
        else tables[tableName].push(row);
        return Promise.resolve({ data: row, error: null });
      },
      eq(field, value) {
        filters.push({ type: 'eq', field, value });
        return builder;
      },
      in(field, values) {
        filters.push({ type: 'in', field, values });
        if (mode === 'update') return Promise.resolve(execute());
        return builder;
      },
      order(field, options = {}) {
        orderBy = { field, ascending: options.ascending !== false };
        return builder;
      },
      maybeSingle() {
        singleMode = 'maybeSingle';
        return Promise.resolve(execute());
      },
      then(resolve, reject) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };

    function execute() {
      if (mode === 'update') {
        let changed = 0;
        tables[tableName] = tables[tableName].map((row) => {
          const matches = filters.every((filter) => {
            if (filter.type === 'eq') return row?.[filter.field] === filter.value;
            if (filter.type === 'in') return filter.values.includes(row?.[filter.field]);
            return true;
          });
          if (!matches) return row;
          changed += 1;
          return { ...row, ...pendingUpdate };
        });
        return { data: changed ? { count: changed } : null, error: null };
      }

      let rows = [...tables[tableName]];
      for (const filter of filters) {
        if (filter.type === 'eq') rows = rows.filter((row) => row?.[filter.field] === filter.value);
        if (filter.type === 'in') rows = rows.filter((row) => filter.values.includes(row?.[filter.field]));
      }
      if (orderBy) rows = sortRows(rows, orderBy.field, orderBy.ascending);
      if (singleMode === 'maybeSingle') return { data: rows[0] || null, error: null };
      return { data: rows, error: null };
    }

    return builder;
  }

  return {
    from(tableName) {
      if (!(tableName in tables)) throw new Error(`Unknown table in smoke test: ${tableName}`);
      return makeBuilder(tableName);
    },
    __tables: tables,
  };
}

async function runSmokeRefreshWithExplicitNormalizeStatus(refreshAppData) {
  const supabase = createSupabaseMock({
    profiles: [
      { id: 'admin-1', full_name: 'Admin Test', email: 'admin@test.pl', role: 'Administrator' },
      { id: 'worker-1', full_name: 'Monter One', email: 'worker@test.pl', role: 'Pracownik' },
    ],
    jobs: [
      {
        id: 'job-1', title: 'Jan Kowalski', client: 'Jan Kowalski', email: 'jan@test.pl', phone: '123456789',
        city: 'Warszawa', street: 'Prosta 1', location: 'Warszawa, Prosta 1', status: 'Nowe zlecenie',
        installation_date: null, admin_note: '', created_at: '2026-02-01T10:00:00.000Z', created_by: 'admin-1', main_technician_id: 'worker-1',
      },
    ],
    job_access: [{ id: 'acc-1', job_id: 'job-1', user_id: 'worker-1' }],
    comments: [{ id: 'com-1', job_id: 'job-1', author_id: 'admin-1', type: 'note', text: 'Test', created_at: '2026-03-01T10:00:00.000Z' }],
    photos: [{ id: 'pho-1', job_id: 'job-1', image_url: 'fallback.jpg', storage_path: 'job-1/photo.jpg', uploaded_by: 'worker-1', created_at: '2026-03-01T11:00:00.000Z' }],
    notifications: [{ id: 'not-1', user_id: 'admin-1', title: 'Powiadomienie', body: 'Treść', is_read: false, created_at: '2026-03-01T12:00:00.000Z', link_job_id: 'job-1' }],
  });

  const payload = await refreshAppData({
    supabase,
    user: { id: 'admin-1', email: 'admin@test.pl', user_metadata: { full_name: 'Admin Test', role: 'Administrator' } },
    normalizeStatus: (status) => (status === 'Nowe zlecenie' ? 'Nowe' : status || 'Nowe'),
    isOlderThan30Days: () => true,
  });

  assert.equal(payload.profile.role, 'Administrator');
  assert.equal(payload.jobs.length, 1);
  assert.equal(payload.jobs[0].status, 'Niezrealizowane');
  assert.equal(payload.jobs[0].detailsLoaded, false);
  assert.equal(payload.jobs[0].comments.length, 0);
  assert.equal(payload.jobs[0].photos.length, 0);
  assert.equal(payload.notifications.length, 1);
}

async function runSmokeRefreshWithoutExplicitNormalizeStatus(refreshAppData) {
  const supabase = createSupabaseMock({
    profiles: [{ id: 'worker-2', full_name: 'Pracownik Testowy', email: 'pracownik@test.pl', role: 'Pracownik' }],
    jobs: [{
      id: 'job-2', title: 'Anna Nowak', client: 'Anna Nowak', email: 'anna@test.pl', phone: '987654321',
      city: 'Kraków', street: 'Długa 2', location: 'Kraków, Długa 2', status: 'Nowe zlecenie', installation_date: null,
      admin_note: '', created_at: '2026-01-01T10:00:00.000Z', created_by: 'worker-2', main_technician_id: null,
    }],
    job_access: [], comments: [], photos: [], notifications: [],
  });

  const payload = await refreshAppData({
    supabase,
    user: { id: 'worker-2', email: 'pracownik@test.pl', user_metadata: { full_name: 'Pracownik Testowy', role: 'Pracownik' } },
    isOlderThan30Days: () => true,
  });

  assert.equal(payload.profile.role, 'Pracownik');
  assert.equal(payload.jobs.length, 1);
  assert.equal(payload.jobs[0].status, 'Niezrealizowane');
}

function loadSmsFetchModule() {
  const sourcePath = path.join(__dirname, '..', 'src', 'modules', 'sms-fetch.js');
  let source = fs.readFileSync(sourcePath, 'utf8');

  source = source.replace("import { getDefaultSmsSettings } from './sms.js';", `const getDefaultSmsSettings = () => ({ id: null, is_enabled: true, sending_mode: 'approval', sender_name: '', service_phone: '', company_name: 'Wawis Klimatyzacja', template_service_reminder: 'Tpl' });`);
  source = source.replace(/export async function (\w+)\(/g, 'async function $1(');
  source += '\nmodule.exports = { loadSmsModuleData, saveSmsSettings };\n';

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    Promise,
  };

  vm.runInNewContext(source, sandbox, { filename: 'sms-fetch.smoke-eval.js' });
  return sandbox.module.exports;
}



function loadContractorsFetchModule() {
  const sourcePath = path.join(__dirname, '..', 'src', 'modules', 'contractors-fetch.js');
  let source = fs.readFileSync(sourcePath, 'utf8');

  source = source.replace("import { buildContractorPayload, isJobDerivedContractor, normalizeContractorRecord } from './contractors.js';", `
    const normalizeContractorRecord = (record = {}) => ({
      id: record.id || null,
      company_name: String(record.company_name || '').trim(),
      contact_person: String(record.contact_person || '').trim(),
      phone: String(record.phone || '').trim(),
      email: String(record.email || '').trim(),
      city: String(record.city || '').trim(),
      street: String(record.street || '').trim(),
      notes: String(record.notes || '').trim(),
      nip: String(record.nip || record.tax_id || '').trim(),
      is_active: record.is_active !== false,
      is_job_fallback: Boolean(record.is_job_fallback),
      source_job_ids: Array.isArray(record.source_job_ids) ? record.source_job_ids : [],
      created_at: record.created_at || null,
      updated_at: record.updated_at || null,
    });
    const isJobDerivedContractor = (contractor = {}) => Boolean(contractor?.is_job_fallback) || String(contractor?.id || '').startsWith('job-derived:');
    const buildContractorPayload = (contractor = {}) => {
      const normalized = normalizeContractorRecord(contractor);
      return {
        p_id: normalized.id || null,
        p_company_name: normalized.company_name,
        p_contact_person: normalized.contact_person || null,
        p_phone: normalized.phone || null,
        p_email: normalized.email || null,
        p_city: normalized.city || null,
        p_street: normalized.street || null,
        p_notes: normalized.notes || null,
        p_nip: normalized.nip || null,
        p_is_active: normalized.is_active,
      };
    };
  `);
  source = source.replace(/export async function (\w+)\(/g, 'async function $1(');
  source += '\nmodule.exports = { loadContractors, saveContractor, removeContractor, removeJobFallbackContractor };\n';

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    Promise,
  };

  vm.runInNewContext(source, sandbox, { filename: 'contractors-fetch.smoke-eval.js' });
  return sandbox.module.exports;
}

function runPermissionsSmoke() {
  const permissions = loadJobPermissions();
  const completedJob = { id: 'job-10', status: 'Zakończone' };
  const inProgressJob = { id: 'job-11', status: 'W trakcie' };
  const newJob = { id: 'job-12', status: 'Nowe' };

  assert.equal(permissions.normalizeStatus('Nowe zlecenie'), 'Nowe');
  assert.equal(permissions.canEditJob(completedJob, false), false);
  assert.equal(permissions.canModifyJobPhotos(completedJob, false), false);
  assert.equal(permissions.canAddJobComment(completedJob, false), false);
  assert.equal(permissions.canWorkerFinishJob(inProgressJob, false), true);
  assert.equal(permissions.canWorkerFinishJob(newJob, false), false);
  assert.equal(permissions.canChangeJobStatus(inProgressJob, 'Zakończone', false), true);
  assert.equal(permissions.canChangeJobStatus(newJob, 'Zakończone', false), false);
  assert.equal(permissions.canChangeJobStatus(completedJob, 'W trakcie', false), false);
  assert.equal(permissions.canManageJobViewers(newJob, false), false);
  assert.equal(permissions.canManageJobViewers(newJob, true), true);
  assert.equal(permissions.canManageAdminNote(newJob, true), true);
  assert.equal(permissions.canDeleteJob(completedJob, true), true);
  assert.equal(permissions.canDeleteJob(completedJob, false), false);
  assert.equal(permissions.canDeleteJobComment({ id: 'comment-1' }, true), true);
  assert.equal(permissions.canDeleteJobComment({ id: 'comment-1' }, false), false);
}

async function runSmsModuleSmoke() {
  const moduleSwitcherPath = path.join(__dirname, '..', 'src', 'components', 'layout', 'ModuleSwitcher.jsx');
  const smsFetchPath = path.join(__dirname, '..', 'src', 'modules', 'sms-fetch.js');
  const appSourcePath = path.join(__dirname, '..', 'src', 'App.jsx');

  const moduleSwitcherSource = fs.readFileSync(moduleSwitcherPath, 'utf8');
  const smsFetchSource = fs.readFileSync(smsFetchPath, 'utf8');
  const sqlGuardSource = readSql(root, 'sms-module-stage-6-admin-guards.sql');
  const appSource = fs.readFileSync(appSourcePath, 'utf8');
  const { loadSmsModuleData, saveSmsSettings } = loadSmsFetchModule();

  assert.ok(moduleSwitcherSource.includes('const MODULES = ['));
  assert.match(moduleSwitcherSource, /!\["sms", "contractors"\]\.includes\(module\.id\) \|\| isAdmin/);
  assert.match(appSource, /if \(!isAdmin && \(activeModule === "sms" \|\| activeModule === "contractors" \|\| activeModule === "calendar"\)\) \{/);
  assert.match(appSource, /jobsPanel=\{activeModule === "jobs" \|\| !isAdmin \?/);
  assert.match(smsFetchSource, /if \(!supabase \|\| !isAdmin\)/);
  assert.match(smsFetchSource, /rpc\('admin_get_sms_module_snapshot'\)/);
  assert.match(smsFetchSource, /rpc\('admin_upsert_sms_settings'/);
  assert.match(sqlGuardSource, /create or replace function public\.current_user_is_admin\(\)/);
  assert.match(sqlGuardSource, /create policy "sms_settings_admin_delete"/);
  assert.match(sqlGuardSource, /create policy "sms_log_admin_update"/);
  assert.match(sqlGuardSource, /create policy "sms_log_admin_delete"/);
  assert.match(sqlGuardSource, /guard_job_sms_runtime_columns/);
  assert.match(sqlGuardSource, /admin_get_sms_module_snapshot/);
  assert.match(sqlGuardSource, /admin_upsert_sms_settings/);

  let workerRpcCalled = false;
  const workerResult = await loadSmsModuleData({
    supabase: {
      rpc() {
        workerRpcCalled = true;
        throw new Error('worker should not call rpc');
      },
    },
    isAdmin: false,
  });
  assert.equal(workerRpcCalled, false);
  assert.equal(workerResult.logs.length, 0);
  assert.equal(workerResult.settings.sending_mode, 'approval');

  let adminRpcName = '';
  const adminResult = await loadSmsModuleData({
    supabase: {
      async rpc(name) {
        adminRpcName = name;
        return {
          data: {
            settings: { company_name: 'Firma Test', sending_mode: 'approval' },
            logs: [{ id: 'log-1', status: 'pending_approval' }],
          },
          error: null,
        };
      },
    },
    isAdmin: true,
  });
  assert.equal(adminRpcName, 'admin_get_sms_module_snapshot');
  assert.equal(adminResult.settings.company_name, 'Firma Test');
  assert.equal(adminResult.logs.length, 1);

  let saveRpcPayload = null;
  const savedSettings = await saveSmsSettings({
    supabase: {
      async rpc(name, payload) {
        saveRpcPayload = { name, payload };
        return { data: { id: 'cfg-1', sending_mode: 'approval', company_name: 'Firma Test' }, error: null };
      },
    },
    settings: { is_enabled: true, sender_name: ' WAWIS ', service_phone: ' 123 ', company_name: ' Firma Test ', template_service_reminder: ' Szablon ' },
    isAdmin: true,
  });
  assert.equal(saveRpcPayload.name, 'admin_upsert_sms_settings');
  assert.equal(saveRpcPayload.payload.p_sender_name, 'WAWIS');
  assert.equal(saveRpcPayload.payload.p_service_phone, '123');
  assert.equal(saveRpcPayload.payload.p_company_name, 'Firma Test');
  assert.equal(saveRpcPayload.payload.p_template_service_reminder, 'Szablon');
  assert.equal(savedSettings.sending_mode, 'approval');
}


async function runContractorsModuleSmoke() {
  const moduleSwitcherPath = path.join(__dirname, '..', 'src', 'components', 'layout', 'ModuleSwitcher.jsx');
  const contractorsFetchPath = path.join(__dirname, '..', 'src', 'modules', 'contractors-fetch.js');
  const contractorsPanelPath = path.join(__dirname, '..', 'src', 'components', 'contractors', 'ContractorsPanel.jsx');
  const appSourcePath = path.join(__dirname, '..', 'src', 'App.jsx');

  const moduleSwitcherSource = fs.readFileSync(moduleSwitcherPath, 'utf8');
  const contractorsFetchSource = fs.readFileSync(contractorsFetchPath, 'utf8');
  const contractorsPanelSource = fs.readFileSync(contractorsPanelPath, 'utf8');
  const contractorsSqlSource = readSql(root, 'contractors-module-stage-8.sql');
  const appSource = fs.readFileSync(appSourcePath, 'utf8');
  const { loadContractors, saveContractor, removeContractor, removeJobFallbackContractor } = loadContractorsFetchModule();

  assert.match(moduleSwitcherSource, /{ id: "contractors", label: "Kontrahenci" }/);
  assert.match(moduleSwitcherSource, /!\["sms", "contractors"\]\.includes\(module\.id\) \|\| isAdmin/);
  assert.match(appSource, /activeModule === "contractors"/);
  assert.match(appSource, /if \(!isAdmin && \(activeModule === "sms" \|\| activeModule === "contractors" \|\| activeModule === "calendar"\)\)/);
  assert.match(contractorsFetchSource, /rpc\('admin_list_contractors'\)/);
  assert.match(contractorsFetchSource, /rpc\('admin_upsert_contractor'/);
  assert.match(contractorsFetchSource, /rpc\('admin_delete_contractor'/);
  assert.match(contractorsFetchSource, /removeJobFallbackContractor/);
  assert.match(contractorsFetchSource, /\.from\('jobs'\)[\s\S]*\.delete\(\)[\s\S]*\.is\('contractor_id', null\)/);
  assert.match(contractorsPanelSource, /removeJobFallbackContractor/);
  assert.match(contractorsPanelSource, /Usunięcie tego wpisu usunie/);
  assert.match(contractorsPanelSource, /deletedFallbackJobIds/);
  assert.match(contractorsPanelSource, /Kontrahenci/);
  assert.match(contractorsPanelSource, /Wszyscy kontrahenci/);
  assert.match(contractorsPanelSource, /Tabela kontrahentów/);
  assert.match(contractorsPanelSource, /Nowy kontrahent/);
  assert.match(contractorsPanelSource, /Import XLSX/);
  assert.match(contractorsPanelSource, /Zapisz kontrahenta/);
  assert.match(contractorsPanelSource, /Podobny kontrahent już istnieje w bazie/);
  assert.match(contractorsPanelSource, /Duplikat po:/);
  assert.match(contractorsPanelSource, /Edytuj istniejącego kontrahenta/);
  assert.match(contractorsPanelSource, /NIP \(opcjonalnie\)/);
  assert.match(contractorsPanelSource, /handleSort\('street'\)/);
  assert.match(contractorsPanelSource, /contractorsDetailsModal/);
  assert.match(contractorsPanelSource, /Pokaż dane kontrahenta/);
  assert.doesNotMatch(contractorsPanelSource, /<span>Aktywni<\/span>/);
  assert.match(contractorsSqlSource, /create table if not exists public\.contractors/);
  assert.match(contractorsSqlSource, /create policy "contractors_admin_select"/);
  assert.match(contractorsSqlSource, /create policy "contractors_admin_insert"/);
  assert.match(contractorsSqlSource, /create policy "contractors_admin_update"/);
  assert.match(contractorsSqlSource, /create policy "contractors_admin_delete"/);
  assert.match(contractorsSqlSource, /admin_list_contractors/);
  assert.match(contractorsSqlSource, /admin_upsert_contractor/);
  assert.match(contractorsSqlSource, /admin_delete_contractor/);
  assert.match(contractorsSqlSource, /alter table public\.jobs add column if not exists contractor_id/);

  let workerRpcCalled = false;
  const workerList = await loadContractors({
    supabase: { rpc() { workerRpcCalled = true; throw new Error('worker should not call rpc'); } },
    isAdmin: false,
  });
  assert.equal(workerRpcCalled, false);
  assert.equal(workerList.length, 0);

  let listRpcName = '';
  const adminList = await loadContractors({
    supabase: {
      async rpc(name) {
        listRpcName = name;
        return { data: [{ id: 'con-1', company_name: ' Klima Tech ', is_active: true }], error: null };
      },
    },
    isAdmin: true,
  });
  assert.equal(listRpcName, 'admin_list_contractors');
  assert.equal(adminList[0].company_name, 'Klima Tech');

  let saveRpcCall = null;
  const savedContractor = await saveContractor({
    supabase: {
      async rpc(name, payload) {
        saveRpcCall = { name, payload };
        return { data: { id: 'con-2', company_name: payload.p_company_name, is_active: payload.p_is_active }, error: null };
      },
    },
    contractor: { company_name: ' Hurtownia Test ', phone: ' 123 ', city: ' Warszawa ', is_active: true },
    isAdmin: true,
  });
  assert.equal(saveRpcCall.name, 'admin_upsert_contractor');
  assert.equal(saveRpcCall.payload.p_company_name, 'Hurtownia Test');
  assert.equal(saveRpcCall.payload.p_phone, '123');
  assert.equal(saveRpcCall.payload.p_city, 'Warszawa');
  assert.equal(saveRpcCall.payload.p_nip, null);
  assert.equal(savedContractor.company_name, 'Hurtownia Test');

  let deleteRpcCall = null;
  const deleteResult = await removeContractor({
    supabase: {
      async rpc(name, payload) {
        deleteRpcCall = { name, payload };
        return { error: null };
      },
    },
    contractorId: 'con-2',
    isAdmin: true,
  });
  assert.equal(deleteRpcCall.name, 'admin_delete_contractor');
  assert.equal(deleteRpcCall.payload.p_id, 'con-2');
  assert.equal(deleteResult, true);

  let removedPhotoBucket = '';
  let removedPhotoPaths = [];
  let deletedTable = '';
  let deletedIds = [];
  let contractorNullFilter = null;
  const fallbackDeleteResult = await removeJobFallbackContractor({
    supabase: {
      storage: {
        from(bucket) {
          removedPhotoBucket = bucket;
          return {
            async remove(paths) {
              removedPhotoPaths = paths;
              return { error: null };
            },
          };
        },
      },
      from(table) {
        deletedTable = table;
        return {
          delete() { return this; },
          in(field, ids) {
            assert.equal(field, 'id');
            deletedIds = ids;
            return this;
          },
          is(field, value) {
            contractorNullFilter = { field, value };
            return this;
          },
          async select(fields) {
            assert.equal(fields, 'id');
            return { data: deletedIds.map((id) => ({ id })), error: null };
          },
        };
      },
    },
    contractor: { id: 'job-derived:robertkolanko', is_job_fallback: true, source_job_ids: ['job-robert'] },
    jobs: [{ id: 'job-robert', photos: [{ storage_path: 'job-photos/robert.jpg' }] }],
    isAdmin: true,
  });
  assert.equal(removedPhotoBucket, 'job-photos');
  assert.deepEqual(removedPhotoPaths, ['job-photos/robert.jpg']);
  assert.equal(deletedTable, 'jobs');
  assert.deepEqual([...deletedIds], ['job-robert']);
  assert.deepEqual(contractorNullFilter, { field: 'contractor_id', value: null });
  assert.deepEqual(JSON.parse(JSON.stringify(fallbackDeleteResult)), { deletedJobs: 1, deletedJobIds: ['job-robert'] });

  await assert.rejects(
    () => removeJobFallbackContractor({ supabase: {}, contractor: { id: 'job-derived:blocked', is_job_fallback: true, source_job_ids: ['job-blocked'] }, isAdmin: false }),
    /Tylko administrator/,
  );
}

async function runConfirmationSmoke() {
  const appSourcePath = path.join(__dirname, '..', 'src', 'App.jsx');
  const appLayoutPath = path.join(__dirname, '..', 'src', 'components', 'layout', 'AppAuthenticatedLayout.jsx');
  const jobsPanelPath = path.join(__dirname, '..', 'src', 'components', 'JobsPanel.jsx');
  const mobileJobsLayoutPath = path.join(__dirname, '..', 'src', 'components', 'jobs', 'MobileJobsLayout.jsx');
  const desktopJobsLayoutPath = path.join(__dirname, '..', 'src', 'components', 'jobs', 'DesktopJobsLayout.jsx');
  const jobDetailsPanelPath = path.join(__dirname, '..', 'src', 'components', 'JobDetailsPanel.jsx');
  const jobHelpersPath = path.join(__dirname, '..', 'src', 'utils', 'jobHelpers.jsx');
  const jobAddressLinkPath = path.join(__dirname, '..', 'src', 'components', 'JobAddressLink.jsx');
  const jobFormModalHookPath = path.join(__dirname, '..', 'src', 'hooks', 'useJobFormModal.js');
  const jobFormModalPath = path.join(__dirname, '..', 'src', 'components', 'modals', 'JobFormModal.jsx');
  const confirmDialogHookPath = path.join(__dirname, '..', 'src', 'hooks', 'useConfirmDialog.js');
  const realtimeRefreshHookPath = path.join(__dirname, '..', 'src', 'hooks', 'useRealtimeRefresh.js');
  const pushStateHookPath = path.join(__dirname, '..', 'src', 'hooks', 'usePushNotificationsState.js');
  const pushStateUtilsPath = path.join(__dirname, '..', 'src', 'utils', 'pushState.js');
  const appSessionHookPath = path.join(__dirname, '..', 'src', 'hooks', 'useAppSession.js');
  const selectedJobActionsHookPath = path.join(__dirname, '..', 'src', 'hooks', 'useSelectedJobActions.js');
  const jobSelectionStatePath = path.join(__dirname, '..', 'src', 'utils', 'jobSelectionState.js');
  const photosModulePath = path.join(__dirname, '..', 'src', 'modules', 'photos.js');
  const appSource = fs.readFileSync(appSourcePath, 'utf8');
  const appLayoutSource = fs.readFileSync(appLayoutPath, 'utf8');
  const jobsPanelSource = fs.readFileSync(jobsPanelPath, 'utf8');
  const mobileJobsLayoutSource = fs.readFileSync(mobileJobsLayoutPath, 'utf8');
  const desktopJobsLayoutSource = fs.readFileSync(desktopJobsLayoutPath, 'utf8');
  const jobDetailsPanelSource = fs.readFileSync(jobDetailsPanelPath, 'utf8');
  const jobHelpersSource = fs.readFileSync(jobHelpersPath, 'utf8');
  const jobAddressLinkSource = fs.readFileSync(jobAddressLinkPath, 'utf8');
  const hookSource = fs.readFileSync(jobFormModalHookPath, 'utf8');
  const jobFormModalSource = fs.readFileSync(jobFormModalPath, 'utf8');
  const confirmDialogHookSource = fs.readFileSync(confirmDialogHookPath, 'utf8');
  const realtimeRefreshHookSource = fs.readFileSync(realtimeRefreshHookPath, 'utf8');
  const pushStateHookSource = fs.readFileSync(pushStateHookPath, 'utf8');
  const pushStateUtilsSource = fs.readFileSync(pushStateUtilsPath, 'utf8');
  const appSessionHookSource = fs.readFileSync(appSessionHookPath, 'utf8');
  const selectedJobActionsHookSource = fs.readFileSync(selectedJobActionsHookPath, 'utf8');
  const jobSelectionStateSource = fs.readFileSync(jobSelectionStatePath, 'utf8');
  const photosModuleSource = fs.readFileSync(photosModulePath, 'utf8');

  assert.match(appSource, /useJobFormModal/);
  assert.match(appSource, /AppAuthenticatedLayout/);
  assert.match(jobsPanelSource, /MobileJobsLayout/);
  assert.match(jobsPanelSource, /DesktopJobsLayout/);
  assert.match(appLayoutSource, /desktopDetailColumnTight/);
  assert.match(jobFormModalSource, /contractor_id/);
  assert.match(jobFormModalSource, /Czy chodzi o tego kontrahenta\?/);
  assert.match(jobFormModalSource, /jobContractorSuggestion/);
  assert.doesNotMatch(jobFormModalSource, /Baza kontrahentów/);
  assert.doesNotMatch(jobFormModalSource, /Wyszukaj kontrahenta w bazie/);
  assert.match(hookSource, /contractor_id/);
  assert.match(mobileJobsLayoutSource, /getJobAddress/);
  assert.match(mobileJobsLayoutSource, /mobileJobAddressValue/);
  assert.match(mobileJobsLayoutSource, /Brak adresu/);
  assert.doesNotMatch(mobileJobsLayoutSource, /JobAddressLink/);
  assert.match(jobDetailsPanelSource, /JobAddressLink/);
  assert.match(jobDetailsPanelSource, /infoLabelWithIcon/);
  assert.match(jobDetailsPanelSource, /<IconMail \/>/);
  assert.match(jobDetailsPanelSource, /<IconPhone \/>/);
  assert.match(jobDetailsPanelSource, /<IconMapPin \/>/);
  assert.match(jobDetailsPanelSource, /<IconCalendar \/>/);
  assert.match(jobDetailsPanelSource, /<IconUsers \/>/);
  assert.match(jobDetailsPanelSource, /<IconClock \/>/);
  assert.match(jobDetailsPanelSource, /<IconCamera \/>/);
  assert.match(jobDetailsPanelSource, /<IconImage \/>/);
  assert.match(jobDetailsPanelSource, /<IconMessageCircle \/>/);
  assert.match(jobDetailsPanelSource, /<IconFileText \/>/);
  assert.match(jobDetailsPanelSource, /Kliknij, aby otworzyć klienta poczty/);
  assert.match(jobDetailsPanelSource, /Kliknij, aby zadzwonić/);
  assert.match(jobDetailsPanelSource, /Kliknij, aby otworzyć adres w Google Maps/);
  assert.doesNotMatch(jobDetailsPanelSource, /copyBtn/);
  assert.doesNotMatch(jobDetailsPanelSource, /Skopiuj adres email/);
  assert.doesNotMatch(jobDetailsPanelSource, /Skopiuj numer telefonu/);
  assert.doesNotMatch(jobDetailsPanelSource, /showMapIcon/);
  assert.match(desktopJobsLayoutSource, /DesktopJobsTableRow/);
  const desktopColumnsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'desktop-jobs-table.columns.jsx'), 'utf8');
  assert.match(desktopColumnsSource, /getJobAddress/);
  assert.doesNotMatch(desktopColumnsSource, /JobAddressLink/);
  assert.doesNotMatch(desktopColumnsSource, /Otwórz adres w Google Maps/);
  assert.match(jobHelpersSource, /export function getJobAddress/);
  assert.match(jobHelpersSource, /export function getGoogleMapsUrl/);
  assert.match(jobDetailsPanelSource, /Data utworzenia/);
  assert.match(jobDetailsPanelSource, /Monterzy/);
  assert.match(jobDetailsPanelSource, /Komentarz administratora/);
  assert.match(jobDetailsPanelSource, /sectionHeadingWithIcon/);
  assert.match(jobDetailsPanelSource, /detailsSection/);
  assert.match(jobDetailsPanelSource, /detailsSectionCompact/);
  assert.match(jobDetailsPanelSource, /<section className="detailsSection jobDetailsSectionCard">/);
  assert.match(jobDetailsPanelSource, /<h4 className="sectionHeadingWithIcon"><IconFileText \/><span>Komentarz administratora<\/span><\/h4>/);
  assert.match(jobDetailsPanelSource, /<h4 className="sectionHeadingWithIcon"><IconCamera \/><span>Zdjęcia montażu<\/span><\/h4>/);
  assert.match(jobDetailsPanelSource, /<h4 className="sectionHeadingWithIcon"><IconMessageCircle \/><span>Komentarze i pytania<\/span><\/h4>/);
  assert.match(jobDetailsPanelSource, /premiumActionBtn premiumDangerBtn adminNoteDeleteBtn compactDangerBtn/);
  assert.match(jobDetailsPanelSource, /<h4 className="sectionHeadingWithIcon"><IconUsers \/><span>Monterzy<\/span><\/h4>/);
  assert.match(jobDetailsPanelSource, /<h4 className="sectionHeadingWithIcon"><IconCheckCircle \/><span>Zarządzanie<\/span><\/h4>/);
  assert.match(jobDetailsPanelSource, /photoUploadActions/);
  assert.match(jobDetailsPanelSource, /photoUploadBtn/);
  assert.match(jobDetailsPanelSource, /photoUploadBtnCamera/);
  assert.match(jobDetailsPanelSource, /photoUploadBtnGallery/);
  assert.match(jobDetailsPanelSource, /premiumActionBtn premiumDangerBtn photoDeleteBtn compactDangerBtn/);
  assert.doesNotMatch(jobDetailsPanelSource, /photoNumber/);
  assert.match(jobDetailsPanelSource, /disabled=\{deletingPhotoId === photo\.id \|\| busy\}/);
  assert.match(jobDetailsPanelSource, /deletingPhotoId === photo\.id \? "Usuwanie\.\.\." : "Usuń"/);
  assert.doesNotMatch(jobDetailsPanelSource, /Zrób zdjęcie na miejscu/);
  assert.doesNotMatch(jobDetailsPanelSource, /Wybierz zdjęcia z telefonu/);
  assert.match(jobDetailsPanelSource, /className="btn premiumActionBtn commentAddBtn"/);
  assert.match(jobDetailsPanelSource, /className="btn premiumActionBtn premiumDangerBtn deleteCardBtn mobileActionCompact"/);
  assert.match(jobDetailsPanelSource, /className="btn premiumActionBtn finishJobBtn mobileActionCompact"/);
  assert.match(jobDetailsPanelSource, /className="btn premiumActionBtn premiumDangerBtn commentDeleteBtn compactDangerBtn"/);
  assert.match(jobDetailsPanelSource, /photoUploadBtnLabel">Aparat/);
  assert.match(jobDetailsPanelSource, /photoUploadBtnLabel">Galeria/);
  assert.match(jobDetailsPanelSource, /disabled=\{!canSubmitComment\}/);
  assert.match(jobDetailsPanelSource, /className="photoMetaText">\{formatDate\(photo\.created_at\)\}<\/span>/);
  assert.match(jobDetailsPanelSource, /className="photoMetaText" title=\{photo\.uploader_name \|\| "Pracownik"\}>\{getInitials\(photo\.uploader_name \|\| "Pracownik"\)\}<\/span>/);
  const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
  assert.match(stylesSource, /\.infoValueActions/);
  assert.match(stylesSource, /\.photoMetaText/);
  assert.match(stylesSource, /\.thumbGrid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(110px,1fr\)\);gap:12px;align-items:start\}/);
  assert.match(stylesSource, /\.thumbCard\{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid #e7edf6;border-radius:16px;background:#fbfdff\}/);
  assert.match(stylesSource, /\.photoUploadActions\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(160px,1fr\)\);gap:10px;align-items:stretch\}/);
  assert.match(stylesSource, /\.photoUploadBtn\{position:relative;display:inline-flex;align-items:center;gap:10px;justify-content:center;width:100%;min-height:50px;/);
  assert.match(stylesSource, /\.photoUploadBtn::after/);
  assert.match(stylesSource, /\.photoUploadBtn:active/);
  assert.match(stylesSource, /\.photoUploadBtnCamera\{border-color:#cbdcf6/);
  assert.match(stylesSource, /\.photoUploadBtnGallery\{border-color:#d7ddff/);
  assert.match(stylesSource, /\.photoUploadBtnIcon/);
  assert.match(stylesSource, /\.photoUploadBtnLabel\{font-size:14px;font-weight:800;color:#10203a;line-height:1;letter-spacing:\.01em\}/);
  assert.match(stylesSource, /\.premiumActionBtn\{display:inline-flex;align-items:center;justify-content:center;min-height:44px;/);
  assert.match(stylesSource, /\.premiumDangerBtn\{background:linear-gradient\(180deg,#fff7f7 0%,#ffeaea 100%\);/);
  assert.match(stylesSource, /\.commentAddBtn\{min-width:170px\}/);
  assert.match(stylesSource, /\.commentDeleteBtn\{min-width:72px\}/);
  assert.match(stylesSource, /\.adminNoteDeleteBtn\{min-width:72px\}/);
  assert.match(stylesSource, /\.photoUploadActions\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:8px\}/);
  assert.match(stylesSource, /\.detailsSection\{gap:10px;margin-top:20px;\}/);
  assert.match(stylesSource, /\.photoDeleteBtn\{width:100%;margin-top:2px\}/);
  assert.match(stylesSource, /\.compactDangerBtn\{min-height:32px;padding:6px 10px;font-size:12px;border-radius:10px;line-height:1\.1\}/);
  assert.match(stylesSource, /\.mobileThreeButtons > \.mobileActionCompact,\s*\.mobileFourButtons > \.mobileActionCompact \{/);
  assert.match(stylesSource, /padding:9px 4px !important;/);
  assert.match(stylesSource, /font-size:11px !important;/);
  assert.match(stylesSource, /@media \(max-width:700px\)\{\s*\.photoMeta\{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px !important;line-height:1\.15 !important;\}/);
  assert.match(stylesSource, /\.photoMetaText\{min-width:0;font-size:11px !important;\}/);
  assert.match(stylesSource, /\.premiumActionBtn:disabled\{cursor:not-allowed;opacity:1;/);
  assert.match(stylesSource, /\.finishJobBtn:disabled,[\s\S]*cursor:not-allowed !important;/);
  assert.match(stylesSource, /\.detailsSection\{display:grid;gap:12px;margin-top:24px;\}/);
  assert.match(stylesSource, /\.detailsSectionCompact\{gap:10px;\}/);
  assert.match(stylesSource, /\.sectionHeadingWithIcon\{display:flex;align-items:center;gap:8px;margin:0 0 2px;\}/);
  assert.doesNotMatch(jobAddressLinkSource, /IconMapPin/);
  assert.doesNotMatch(jobAddressLinkSource, /addressLinkContent/);
  assert.match(jobAddressLinkSource, /title = "Otwórz adres w Google Maps"/);
  assert.match(jobAddressLinkSource, /ariaLabel \|\| `Otwórz adres w Google Maps: \$\{address\}`/);
  assert.match(appSource, /useConfirmDialog/);
  assert.match(appSource, /useRealtimeRefresh/);
  assert.match(appSource, /usePushNotificationsState/);
  assert.match(appSource, /useAppSession/);
  assert.match(appSource, /useSelectedJobActions/);
  assert.match(appSessionHookSource, /const refreshAll = useCallback\(async \(user, options = \{\}\) =>/);
  assert.match(appSessionHookSource, /await restoreAuthSession\(/);
  assert.match(appSessionHookSource, /const unsubscribe = subscribeToAuthState\(/);
  assert.match(
    selectedJobActionsHookSource,
    /onConfirm:\s*async \(\) => runConfirmAction\(async \(\) => \{[\s\S]*const deleted = await deleteJobPhoto\(/,
  );
  assert.match(
    selectedJobActionsHookSource,
    /if \(deleted\) \{[\s\S]*reloadJobDetails\?\.\(photo\.job_id, \{ force: true, background: true \}\)/,
  );
  assert.match(selectedJobActionsHookSource, /onConfirm:\s*async \(\) => runConfirmAction\(\(\) => removeComment\(comment\.id\)\)/);
  assert.match(selectedJobActionsHookSource, /confirmLabel:\s*"Usuń na stałe"/);
  assert.match(selectedJobActionsHookSource, /await runConfirmAction\(async \(\) => \{[\s\S]*confirmDeleteJobRecord\(/);
  assert.match(selectedJobActionsHookSource, /setBusy\(true\)/);
  assert.match(selectedJobActionsHookSource, /setBusy\(false\)/);
  assert.match(hookSource, /variant:\s*"discard"/);
  assert.match(confirmDialogHookSource, /clearConfirmDialog\(\)/);
  assert.match(hookSource, /title:\s*"Zamknąć bez zapisu\?"/);
  assert.match(hookSource, /Masz niezapisane zmiany w formularzu montażu/);
  assert.match(hookSource, /if \(isJobFormDirty\(\)\)/);
  assert.match(hookSource, /resetJobModalState\(\);/);
  assert.match(confirmDialogHookSource, /async function runConfirmAction\(action\)/);
  assert.match(confirmDialogHookSource, /setConfirmBusy\(true\)/);
  assert.match(confirmDialogHookSource, /setConfirmBusy\(false\)/);
  assert.match(realtimeRefreshHookSource, /channel\(`live-refresh-\$\{sessionUser\.id\}`\)/);
  assert.match(realtimeRefreshHookSource, /window\.setInterval/);
  assert.match(realtimeRefreshHookSource, /document\.addEventListener\(["\']visibilitychange["\']/);
  assert.match(pushStateHookSource, /setPushState\(INITIAL_PUSH_STATE\)/);
  assert.match(pushStateUtilsSource, /export const INITIAL_PUSH_STATE = \{/);
  assert.match(jobSelectionStateSource, /export function getRequestedJobIdFromLocation/);
  assert.match(appSource, /const requestedJobId = getRequestedJobIdFromLocation\(window\.location\.href\)/);
  assert.match(appSource, /const requestedJob = jobs\.find\(\(job\) => String\(job\.id\) === String\(requestedJobId\)\)/);
  assert.match(jobSelectionStateSource, /searchParams\.get\(["\']jobId["\']\)/);
  assert.match(photosModuleSource, /if \(!supabase \|\| !photo \|\| deletingPhotoId\) return false;/);

  const jobSelectionState = jobSelectionStateSource
    .replace(/export function /g, 'function ')
    .concat('\nmodule.exports = { getRequestedJobIdFromLocation };');
  const selectionSandbox = { module: { exports: {} }, exports: {}, URL };
  vm.runInNewContext(jobSelectionState, selectionSandbox, { filename: 'job-selection-state.smoke-eval.js' });
  const addressHelpersMatch = jobHelpersSource.match(/export function getJobCity[\s\S]*?(?=\nexport function getJobTypeLabel)/);
  assert.ok(addressHelpersMatch, 'Brak helperów adresu w src/utils/jobHelpers.jsx');
  const helpersSmokeSource = addressHelpersMatch[0]
    .replace(/export function /g, 'function ')
    .concat('\nmodule.exports = { getJobCity, getJobStreet, getJobAddress, getGoogleMapsUrl };');
  const helpersSandbox = { module: { exports: {} }, exports: {}, encodeURIComponent };
  vm.runInNewContext(helpersSmokeSource, helpersSandbox, { filename: 'job-helpers.smoke-eval.js' });
  const { getJobAddress, getGoogleMapsUrl } = helpersSandbox.module.exports;
  assert.equal(getJobAddress({ city: 'Warszawa', street: 'Marszałkowska 10' }), 'Warszawa, Marszałkowska 10');
  assert.equal(getGoogleMapsUrl({ city: 'Warszawa', street: 'Marszałkowska 10' }), 'https://www.google.com/maps/search/?api=1&query=Warszawa%2C%20Marsza%C5%82kowska%2010');
  assert.equal(getJobAddress({ city: 'Warszawa', street: '' }), 'Warszawa');
  assert.equal(getGoogleMapsUrl({ city: 'Warszawa', street: '' }), 'https://www.google.com/maps/search/?api=1&query=Warszawa');
  assert.equal(getJobAddress({ city: '', street: 'Spacerowa 7' }), 'Spacerowa 7');
  assert.equal(getGoogleMapsUrl({ city: '', street: 'Spacerowa 7' }), 'https://www.google.com/maps/search/?api=1&query=Spacerowa%207');

  const { getRequestedJobIdFromLocation } = selectionSandbox.module.exports;
  assert.equal(getRequestedJobIdFromLocation('https://example.com/app?jobId=job-77'), 'job-77');
  assert.equal(getRequestedJobIdFromLocation('https://example.com/app?foo=1'), '');
}


async function main() {
  const refreshAppData = loadRefreshAppData();
  await runSmokeRefreshWithExplicitNormalizeStatus(refreshAppData);
  await runSmokeRefreshWithoutExplicitNormalizeStatus(refreshAppData);
  runPermissionsSmoke();
  const jobContractorsModule = loadJobContractorsModule();
  runContractorLookupSmoke(jobContractorsModule);
  await runConfirmationSmoke();
  await runSmsModuleSmoke();
  await runContractorsModuleSmoke();
  runStage10SqlSmoke();
  runDevicesModuleSmoke();
  runDevicesSqlSmoke();
  console.log('Smoke auth+refresh+permissions+lookup+confirmations+sms+contractors+devices+stage10 OK');
process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
