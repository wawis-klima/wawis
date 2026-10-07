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
  assert.match(source, /admin_delete_job_idempotent/, `${label}: usunięcie karty musi korzystać z idempotentnego odzyskiwalnego RPC`);
  assert.match(source, /p_operation_id/, `${label}: retry usunięcia musi używać stabilnego operation_id`);
  assert.match(source, /already_applied/, `${label}: retry po utracie odpowiedzi musi uznawać wcześniej wykonane usunięcie`);
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
      return {
        data: {
          outcome: 'deleted',
          id: 'job-123',
          operation_id: payload.p_operation_id,
        },
        error: null,
      };
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
  const normalizedRpc = JSON.parse(JSON.stringify(rpcCall));
  assert.equal(normalizedRpc.name, 'admin_delete_job_idempotent');
  assert.equal(normalizedRpc.payload.p_job_id, 'job-123');
  assert.match(normalizedRpc.payload.p_operation_id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(JSON.parse(JSON.stringify(result)).deletedJobIds, ['job-123']);
  assert.equal(result.outcome, 'deleted');

  await assert.rejects(
    () => confirmDeleteJobRecord({
      supabase: {
        async rpc(name, payload) {
          return {
            data: {
              outcome: 'not_found',
              id: 'job-missing',
              operation_id: payload.p_operation_id,
            },
            error: null,
          };
        },
      },
      jobToDelete: { id: 'job-missing', photos: [{ storage_path: 'must-stay.jpg' }] },
    }),
    /karta nie istnieje|odśwież listę montaży/i,
  );
}

assertDeleteFlow().then(() => {
  console.log('Job delete smoke OK');
process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
