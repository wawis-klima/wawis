const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function loadModule(modulePath, replacements, exportedNames, filename) {
  let source = fs.readFileSync(modulePath, 'utf8');
  for (const [from, to] of replacements) {
    source = source.replace(from, to);
  }
  source += `\nmodule.exports = { ${exportedNames.join(', ')} };\n`;
  const sandbox = { module: { exports: {} }, exports: {}, console, Promise };
  vm.runInNewContext(source, sandbox, { filename });
  return sandbox.module.exports;
}

function loadModuleSwitcherModules() {
  const source = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'ModuleSwitcher.jsx'), 'utf8');
  const match = source.match(/const MODULES = \[(.*?)\];/s);
  assert.ok(match, 'Nie znaleziono listy modułów w ModuleSwitcher.jsx');
  const arrLiteral = `[${match[1]}]`;
  return vm.runInNewContext(arrLiteral, {}, { filename: 'module-switcher-modules.js' });
}

function getVisibleModuleIds(isAdmin) {
  const modules = loadModuleSwitcherModules();
  return Array.from(modules)
    .filter((module) => isAdmin || ['jobs', 'fuel'].includes(module.id))
    .map((module) => module.id);
}

function loadSmsFetchModule() {
  return loadModule(
    path.join(root, 'src', 'modules', 'sms-fetch.js'),
    [
      ["import { getDefaultSmsSettings } from './sms.js';", "const getDefaultSmsSettings = () => ({ id: null, is_enabled: true, sending_mode: 'approval', sender_name: '', service_phone: '', company_name: 'Wawis Klimatyzacja', template_service_reminder: 'Tpl' });"],
      [/export async function (\w+)\(/g, 'async function $1('],
    ],
    ['loadSmsModuleData', 'saveSmsSettings'],
    'sms-fetch.role-smoke.js'
  );
}

function loadContractorsFetchModule() {
  return loadModule(
    path.join(root, 'src', 'modules', 'contractors-fetch.js'),
    [
      ["import { buildContractorPayload, isJobDerivedContractor, normalizeContractorRecord } from './contractors.js';", `
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
      `],
      [/export async function (\w+)\(/g, 'async function $1('],
    ],
    ['loadContractors', 'saveContractor', 'removeContractor'],
    'contractors-fetch.role-smoke.js'
  );
}

function assertSourceGuards() {
  const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const moduleSwitcherSource = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'ModuleSwitcher.jsx'), 'utf8');
  const smsFetchSource = fs.readFileSync(path.join(root, 'src', 'modules', 'sms-fetch.js'), 'utf8');
  const contractorsFetchSource = fs.readFileSync(path.join(root, 'src', 'modules', 'contractors-fetch.js'), 'utf8');
  const devicesPanelSource = fs.readFileSync(path.join(root, 'src', 'components', 'devices', 'DevicesPanel.jsx'), 'utf8');

  assert.match(appSource, /if \(!isAdmin && !\["jobs", "fuel"\]\.includes\(activeModule\)\)/);
  assert.doesNotMatch(appSource, /!isAdmin[^\n]+activeModule === "fuel"/);
  assert.match(appSource, /isAdmin && isMobile && activeModule === "devices"/);
  assert.ok(/const SmsPanel = lazy\(/.test(appSource) || /import SmsPanel from ".*SmsPanel\.jsx";/.test(appSource));
  assert.ok(/const ContractorsPanel = lazy\(/.test(appSource) || /import ContractorsPanel from ".*ContractorsPanel\.jsx";/.test(appSource));
  assert.ok(/const DevicesPanel = lazy\(/.test(appSource) || /import DevicesPanel from ".*DevicesPanel\.jsx";/.test(appSource));
  assert.ok(/<Suspense fallback=\{adminModuleFallback\}>/.test(appSource) || /activeModule === "devices"/.test(appSource));
  assert.match(moduleSwitcherSource, /\{ id: "jobs", label: "Montaże" \}/);
  assert.match(moduleSwitcherSource, /\{ id: "contractors", label: "Kontrahenci" \}/);
  assert.doesNotMatch(moduleSwitcherSource, /Urządzenia/);
  assert.match(moduleSwitcherSource, /\{ id: "sms", label: "SMS" \}/);
  assert.match(smsFetchSource, /if \(!supabase \|\| !isAdmin\)/);
  assert.match(contractorsFetchSource, /if \(!supabase \|\| !isAdmin\)/);
  assert.match(devicesPanelSource, /!isAdmin/);
}

async function assertWorkerCannotCallAdminRpc() {
  const { loadSmsModuleData } = loadSmsFetchModule();
  const { loadContractors } = loadContractorsFetchModule();

  let smsRpcCalled = false;
  const smsResult = await loadSmsModuleData({
    supabase: { rpc() { smsRpcCalled = true; throw new Error('worker should not call sms rpc'); } },
    isAdmin: false,
  });
  assert.equal(smsRpcCalled, false);
  assert.equal(Array.isArray(smsResult.logs), true);
  assert.equal(smsResult.logs.length, 0);

  let contractorsRpcCalled = false;
  const contractorsResult = await loadContractors({
    supabase: { rpc() { contractorsRpcCalled = true; throw new Error('worker should not call contractors rpc'); } },
    isAdmin: false,
  });
  assert.equal(contractorsRpcCalled, false);
  assert.equal(Array.isArray(contractorsResult), true);
  assert.equal(contractorsResult.length, 0);
}

async function assertAdminCanSeeProtectedModules() {
  const workerModules = getVisibleModuleIds(false);
  const adminModules = getVisibleModuleIds(true);

  assert.deepEqual(workerModules, ['jobs', 'fuel']);
  assert.deepEqual(adminModules, ['jobs', 'contractors', 'fuel', 'sms']);

  const { loadSmsModuleData } = loadSmsFetchModule();
  const { loadContractors } = loadContractorsFetchModule();

  let smsRpcName = '';
  const smsResult = await loadSmsModuleData({
    supabase: { async rpc(name) { smsRpcName = name; return { data: { settings: { company_name: 'Firma Test' }, logs: [{ id: 'sms-1' }] }, error: null }; } },
    isAdmin: true,
  });
  assert.equal(smsRpcName, 'admin_get_sms_module_snapshot');
  assert.equal(smsResult.logs.length, 1);

  let contractorsRpcName = '';
  const contractors = await loadContractors({
    supabase: { async rpc(name) { contractorsRpcName = name; return { data: [{ id: 'con-1', company_name: 'Klima Test', is_active: true }], error: null }; } },
    isAdmin: true,
  });
  assert.equal(contractorsRpcName, 'admin_list_contractors');
  assert.equal(contractors[0].company_name, 'Klima Test');
}

(async function main() {
  assertSourceGuards();
  await assertWorkerCannotCallAdminRpc();
  await assertAdminCanSeeProtectedModules();
  console.log('Role access smoke OK');
process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
