const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const actionsSource = fs.readFileSync(path.join(root, 'src', 'hooks', 'useSelectedJobActions.js'), 'utf8');
const detailsSource = fs.readFileSync(path.join(root, 'src', 'components', 'JobDetailsPanel.jsx'), 'utf8');
const desktopCrudSource = fs.readFileSync(path.join(root, 'src', 'modules', 'jobs-crud.js'), 'utf8');
const mobileCrudSource = fs.readFileSync(path.join(root, 'src', 'mobile791', 'modules', 'jobs-crud.js'), 'utf8');

assert.match(actionsSource, /title:\s*"Usunąć kartę montażu\?"/);
assert.match(actionsSource, /confirmLabel:\s*"Usuń na stałe"/);
assert.match(actionsSource, /await confirmDeleteJobRecord\(\{ supabase, jobToDelete: job \}\);/);
assert.match(actionsSource, /await refreshAll\(sessionUser\);/);
assert.match(detailsSource, /deleteJob\(selectedJob\)/);
assert.match(detailsSource, /Usuń kartę/);
for (const [label, source] of [['desktop', desktopCrudSource], ['mobile', mobileCrudSource]]) {
  assert.match(source, /admin_delete_jobs_recoverable/, `${label}: usunięcie karty musi korzystać z odzyskiwalnego RPC`);
  assert.match(source, /p_only_unlinked:\s*false/, `${label}: zwykłe usunięcie karty nie może wymagać contractor_id IS NULL`);
  assert.doesNotMatch(source, /storage\.from\(['"]job-photos['"]\)\.remove/, `${label}: pliki nie mogą być kasowane przed archiwizacją karty`);
}

function loadConfirmDeleteJobRecord() {
  const sourcePath = path.join(root, 'src', 'modules', 'jobs-crud.js');
  let source = fs.readFileSync(sourcePath, 'utf8');
  source = source.replace(/export async function (\w+)\(/g, 'async function $1(');
  source += '\nmodule.exports = { confirmDeleteJobRecord };\n';
  const sandbox = { module: { exports: {} }, exports: {}, console, Promise };
  vm.runInNewContext(source, sandbox, { filename: 'jobs-crud.delete-smoke.js' });
  return sandbox.module.exports.confirmDeleteJobRecord;
}

async function assertDeleteFlow() {
  const confirmDeleteJobRecord = loadConfirmDeleteJobRecord();
  let rpcCall = null;
  let storageTouched = false;
  const supabase = {
    storage: {
      from() {
        storageTouched = true;
        throw new Error('Storage must not be touched by recoverable job delete');
      },
    },
    async rpc(name, payload) {
      rpcCall = { name, payload };
      return { data: [{ id: 'job-123' }], error: null };
    },
  };

  const result = await confirmDeleteJobRecord({
    supabase,
    jobToDelete: {
      id: 'job-123',
      photos: [
        { storage_path: 'jobs/job-123/photo-1.jpg' },
        { storage_path: 'jobs/job-123/photo-2.jpg' },
      ],
    },
  });

  assert.equal(storageTouched, false);
  assert.deepEqual(JSON.parse(JSON.stringify(rpcCall)), {
    name: 'admin_delete_jobs_recoverable',
    payload: { p_ids: ['job-123'], p_only_unlinked: false },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { deletedJobIds: ['job-123'] });

  await assert.rejects(
    () => confirmDeleteJobRecord({
      supabase: {
        async rpc() {
          return { data: [], error: null };
        },
      },
      jobToDelete: { id: 'job-missing', photos: [{ storage_path: 'must-stay.jpg' }] },
    }),
    /karta nie została usunięta/i,
  );
}

assertDeleteFlow().then(() => {
  console.log('Job delete smoke OK');
process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
