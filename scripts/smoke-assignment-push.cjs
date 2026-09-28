const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

function assertPostCreateSafetyContract() {
  const desktopJobsForm = read('src/modules/jobs-form.js');
  const mobileJobsForm = read('src/mobile791/modules/jobs-form.js');
  const desktopActions = read('src/hooks/useSelectedJobActions.js');
  const mobileActions = read('src/mobile791/hooks/useSelectedJobActions.js');

  for (const source of [desktopJobsForm, mobileJobsForm]) {
    assert(source.includes('post_create_warnings'), 'C6: wynik utworzenia musi zachować ostrzeżenia etapów pobocznych.');
    assert(source.includes("phase: 'job_access'"), 'C6: błąd przypisań musi być odróżniony od błędu INSERT jobs.');
    assert(source.includes("phase: 'notification'"), 'C6: błąd powiadomienia musi być ostrzeżeniem po INSERT.');
    assert(source.includes("phase: 'push'"), 'C6: błąd PUSH musi być ostrzeżeniem po INSERT.');
    assert(source.includes('installer_ids: getAssignedUserIdsFromForm(resolvedForm)'), '11.68: nowy montaż musi od razu zapisać jawną listę monterów.');
  }
  assert(desktopActions.includes('createdJob?.post_create_warnings'), 'Desktop musi obsłużyć ostrzeżenia bez ponownego INSERT.');
  assert(mobileActions.includes('createdJob?.post_create_warnings'), 'Mobile musi obsłużyć ostrzeżenia bez ponownego INSERT.');
}

function assertServerSidePushDateGuard() {
  const source = read('supabase/functions/send-assignment-push/index.ts');
  assert(source.includes('installation_date'), 'Edge Function send-assignment-push musi pobierać installation_date z jobs');
  assert(source.includes('isInstallationDateInPast(job.installation_date)'), 'Edge Function musi blokować push dla historycznej daty montażu');
  assert(source.includes('Europe/Warsaw'), 'Porównanie daty push powinno używać lokalnej daty Europe/Warsaw');
}

function loadAssignmentModule() {
  let source = read('src/modules/jobs-assignment.js');
  source = source.replace(/import \{ supabaseAnonKey, supabaseUrl \} from "\.\.\/lib\/supabase\.js";\n/, "const supabaseAnonKey = 'mock-anon-key';\nconst supabaseUrl = 'mock://supabase';\n");
  source = source.replace(/export async function (\w+)\(/g, 'async function $1(');
  source = source.replace(/export function (\w+)\(/g, 'function $1(');
  source += '\nmodule.exports = { normalizeInstallerIds, getAssignedUserIdsFromForm, getAssignedUserIdsFromJob, getLegacyInstallerSuggestionIds, getLocalDateKey, isInstallationDateInPast, shouldSendAssignmentPushForInstallationDate, toggleJobViewer };\n';
  const sandbox = { module: { exports: {} }, exports: {}, console, Promise, Date, fetch: async () => ({ ok: true, json: async () => ({}) }) };
  vm.runInNewContext(source, sandbox, { filename: 'jobs-assignment.assignment-push-smoke.js' });
  return sandbox.module.exports;
}

async function main() {
  assertPostCreateSafetyContract();
  assertServerSidePushDateGuard();
  const assignment = loadAssignmentModule();

  const fixedToday = new Date(2026, 8, 28, 12, 0, 0);
  assert.equal(assignment.isInstallationDateInPast('2026-09-27', fixedToday), true);
  assert.equal(assignment.shouldSendAssignmentPushForInstallationDate('2026-09-27', fixedToday), false);
  assert.equal(assignment.shouldSendAssignmentPushForInstallationDate('2026-09-28', fixedToday), true);
  assert.equal(assignment.shouldSendAssignmentPushForInstallationDate('2026-09-29', fixedToday), true);

  assert.deepEqual(
    Array.from(assignment.getAssignedUserIdsFromJob({
      main_technician_id: 'main',
      installer_ids: ['tech-b', 'main'],
      viewers: [{ user_id: 'access-only' }],
    })),
    ['main', 'tech-b'],
    'Potwierdzona lista monterów nie może być rozszerzana przez techniczny job_access.',
  );

  assert.deepEqual(
    Array.from(assignment.getAssignedUserIdsFromJob({
      main_technician_id: 'main',
      installer_ids: null,
      viewers: [{ user_id: 'legacy-access' }],
    })),
    ['main'],
    'Historyczny job_access nie jest automatycznie potwierdzoną listą monterów.',
  );

  let rpcPayload = null;
  const supabase = {
    async rpc(name, payload) {
      assert.equal(name, 'save_job_concurrent_v1168');
      rpcPayload = payload;
      return { data: { id: payload.p_id, installer_ids: payload.p_installer_ids }, error: null };
    },
  };
  const pushes = [];
  const futureJob = {
    id: 'job-future',
    installation_date: '2026-09-29',
    main_technician_id: null,
    installer_ids: [],
    viewers: [{ user_id: 'access-only' }],
  };

  const added = await assignment.toggleJobViewer({
    supabase,
    jobId: futureJob.id,
    userId: 'tech-new',
    job: futureJob,
    sendAssignmentPushFn: async (payload) => pushes.push(payload),
  });

  assert.deepEqual(Array.from(rpcPayload.p_installer_ids), ['tech-new']);
  assert.deepEqual(Array.from(rpcPayload.p_expected_installer_ids), []);
  assert.equal(rpcPayload.p_update_installers, true);
  assert.equal(added.added, true);
  assert.equal(pushes.length, 1, 'Nowe przypisanie biznesowe przyszłego montażu nadal wysyła push.');

  rpcPayload = null;
  pushes.length = 0;
  const legacyJob = {
    id: 'job-legacy',
    installation_date: '2026-09-27',
    main_technician_id: 'main',
    installer_ids: null,
    viewers: [{ user_id: 'access-only' }],
  };
  const removed = await assignment.toggleJobViewer({
    supabase,
    jobId: legacyJob.id,
    userId: 'access-only',
    job: legacyJob,
    sendAssignmentPushFn: async (payload) => pushes.push(payload),
  });

  assert.deepEqual(Array.from(rpcPayload.p_installer_ids), ['main']);
  assert.equal(rpcPayload.p_expected_installer_ids, null, 'Pierwsze potwierdzenie starego montażu ma rozpoznać brak wcześniejszej jawnej listy.');
  assert.equal(removed.removed, true);
  assert.equal(pushes.length, 0, 'Usunięcie sugestii/historyczne przypisanie nie wysyła push.');

  const migration = read('supabase/migrations/20260928120000_job_installers_concurrency_v1168.sql');
  assert.match(migration, /add column if not exists installer_ids uuid\[\] null/);
  assert.match(migration, /for update/);
  assert.match(migration, /JOB_EDIT_CONFLICT:/);
  assert.match(migration, /insert into public\.job_access/);
  assert.doesNotMatch(migration, /delete from public\.job_access/, 'Usunięcie montera biznesowego nie może automatycznie odbierać technicznego dostępu.');

  console.log('Assignment/installer push smoke OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
