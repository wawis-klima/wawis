const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const actionsSource = fs.readFileSync(path.join(root, 'src', 'hooks', 'useSelectedJobActions.js'), 'utf8');
const detailsSource = fs.readFileSync(path.join(root, 'src', 'components', 'JobDetailsPanel.jsx'), 'utf8');

assert.match(actionsSource, /title:\s*"Usunąć kartę montażu\?"/);
assert.match(actionsSource, /confirmLabel:\s*"Usuń na stałe"/);
assert.match(actionsSource, /await confirmDeleteJobRecord\(\{ supabase, jobToDelete: job \}\);/);
assert.match(actionsSource, /await refreshAll\(sessionUser\);/);
assert.match(detailsSource, /deleteJob\(selectedJob\)/);
assert.match(detailsSource, /Usuń kartę/);

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
  const calls = { removed: null, deletedTable: null, deletedId: null, selectArg: null };
  const supabase = {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'job-photos');
        return {
          async remove(paths) {
            calls.removed = paths;
            return { data: paths, error: null };
          },
        };
      },
    },
    from(table) {
      assert.equal(table, 'jobs');
      calls.deletedTable = table;
      return {
        delete() {
          return {
            eq(column, value) {
              assert.equal(column, 'id');
              calls.deletedId = value;
              return {
                async select(selection) {
                  calls.selectArg = selection;
                  return { data: [{ id: value }], error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  await confirmDeleteJobRecord({
    supabase,
    jobToDelete: {
      id: 'job-123',
      photos: [
        { storage_path: 'jobs/job-123/photo-1.jpg' },
        { storage_path: '' },
        { storage_path: 'jobs/job-123/photo-2.jpg' },
      ],
    },
  });

  assert.deepEqual(calls.removed, ['jobs/job-123/photo-1.jpg', 'jobs/job-123/photo-2.jpg']);
  assert.equal(calls.deletedTable, 'jobs');
  assert.equal(calls.deletedId, 'job-123');
  assert.equal(calls.selectArg, 'id');
}

assertDeleteFlow().then(() => {
  console.log('Job delete smoke OK');
process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
