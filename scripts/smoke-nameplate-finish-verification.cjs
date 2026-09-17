const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const fetchPath = path.join(root, 'src', 'mobile791', 'modules', 'jobs-fetch.js');
const actionsPath = path.join(root, 'src', 'mobile791', 'hooks', 'useSelectedJobActions.js');
const requirementsPath = path.join(root, 'src', 'mobile791', 'modules', 'nameplate-requirements.js');
const permissionsPath = path.join(root, 'src', 'mobile791', 'utils', 'jobPermissions.js');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260917093000_admin_manual_nameplate_completion_v1090.sql');
const fetchSource = fs.readFileSync(fetchPath, 'utf8');
const actionsSource = fs.readFileSync(actionsPath, 'utf8');
const requirementsSource = fs.readFileSync(requirementsPath, 'utf8');
const permissionsSource = fs.readFileSync(permissionsPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');

assert.match(fetchSource, /export async function loadJobNameplatePhotosData/);
assert.match(fetchSource, /retryDelaysMs = \[0, 350, 900\]/);
assert.match(fetchSource, /select\('id, job_id, image_url, storage_path, uploaded_by, created_at, photo_kind, device_index, unit_ref'\)/);
assert.doesNotMatch(
  fetchSource.slice(fetchSource.indexOf('export async function loadJobNameplatePhotosData'), fetchSource.indexOf('export async function loadJobDetailsData')),
  /comments|createSignedUrl|getSignedPhotoUrl/,
);
assert.match(actionsSource, /loadJobNameplatePhotosData\(\{ supabase, jobId \}\)/);
assert.match(actionsSource, /locallyConfirmedOnServer/);
assert.match(actionsSource, /Boolean\(String\(photo\.storage_path/);
assert.doesNotMatch(
  actionsSource.slice(actionsSource.indexOf('async function updateStatus'), actionsSource.indexOf('async function saveAdminNote')),
  /reloadJobDetails\?\.\(jobId, \{ force: true \}\)/,
);

// 10.90: administrator może zakończyć po jawnych ręcznych potwierdzeniach,
// ale pracownik nadal musi mieć prawdziwe zdjęcia.
assert.match(permissionsSource, /return normalizeStatus\(job\?\.status\) === "W trakcie";/, 'Akcja zakończenia ma być dostępna dla aktywnego montażu także administratorowi.');
const finishHelper = permissionsSource.slice(permissionsSource.indexOf('export function canWorkerFinishJob'), permissionsSource.indexOf('export function canWorkerRestartJob'));
assert.doesNotMatch(finishHelper, /if \(isAdmin/, '10.90 nie może ponownie ukrywać przycisku zakończenia administratorowi.');
assert.match(requirementsSource, /adminServerGuard/, 'Mobilny admin ma przekazać ostateczną weryfikację backendowi.');
assert.match(requirementsSource, /options\.allowLocal === false/, 'Admin-server-guard musi być rozpoznawany wyłącznie dla jawnego allowLocal:false.');
assert.match(requirementsSource, /isComplete:\s*photosComplete \|\| adminServerGuard/, 'UI administratora ma umożliwiać próbę zakończenia bez zdjęć.');
assert.match(migrationSource, /public\.current_user_is_admin\(\)/, 'Backend musi rozróżniać administratora od pracownika.');
assert.match(migrationSource, /public\.nameplate_manual_verifications/, 'Backend musi uznawać jawne ręczne potwierdzenia administratora.');
assert.match(migrationSource, /from public\.photos p/, 'Fizyczne zdjęcia nadal muszą być podstawową ścieżką zakończenia.');
assert.match(migrationSource, /raise exception 'job_nameplates_incomplete:/, 'Brak zdjęcia i brak ręcznego potwierdzenia nadal musi blokować zakończenie.');

(async () => {
  const [jobsFetch, requirements] = await Promise.all([
    import(pathToFileURL(fetchPath).href),
    import(pathToFileURL(requirementsPath).href),
  ]);

  const missingJob = { id: 'job-missing-nameplates', photos: [] };
  const workerCompletion = requirements.getJobNameplateCompletion(missingJob);
  assert.equal(workerCompletion.isComplete, false, 'Pracownik bez zdjęć nie może ominąć wymogu tabliczek.');
  assert.equal(workerCompletion.missingUnits.length, 2, 'Pusty montaż nadal wymaga JZ i JW.');

  const adminAttempt = requirements.getJobNameplateCompletion(missingJob, { allowLocal: false });
  assert.equal(adminAttempt.photosComplete, false, 'UI nie może udawać, że fizyczne zdjęcia istnieją.');
  assert.equal(adminAttempt.serverGuardRequired, true, 'Brak zdjęć u admina musi być oznaczony do weryfikacji serwerowej.');
  assert.equal(adminAttempt.isComplete, true, 'Admin ma móc wysłać próbę zakończenia do serwera po ręcznych potwierdzeniach.');

  const responses = [
    { data: null, error: { status: 503, message: 'Service unavailable' } },
    {
      data: [
        {
          id: 'photo-jz',
          job_id: 'job-1',
          image_url: '',
          storage_path: 'job-1/nameplates/device-1_jz_bez-numeru_123.jpg',
          uploaded_by: 'worker-1',
          created_at: '2026-07-27T10:00:00.000Z',
        },
        {
          id: 'photo-jw',
          job_id: 'job-1',
          image_url: '',
          storage_path: 'job-1/nameplates/device-1_jw-1_bez-numeru_124.jpg',
          uploaded_by: 'worker-1',
          created_at: '2026-07-27T10:01:00.000Z',
        },
      ],
      error: null,
    },
  ];
  let calls = 0;
  const supabase = {
    from(table) {
      assert.equal(table, 'photos');
      return {
        select(fields) {
          assert.equal(fields, 'id, job_id, image_url, storage_path, uploaded_by, created_at, photo_kind, device_index, unit_ref');
          return {
            eq(column, value) {
              assert.equal(column, 'job_id');
              assert.equal(value, 'job-1');
              return {
                async order(columnName, options) {
                  assert.equal(columnName, 'created_at');
                  assert.deepEqual(options, { ascending: true });
                  const result = responses[Math.min(calls, responses.length - 1)];
                  calls += 1;
                  return result;
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await jobsFetch.loadJobNameplatePhotosData({
    supabase,
    jobId: 'job-1',
    retryDelaysMs: [0, 0],
  });

  assert.equal(calls, 2, 'Weryfikacja powinna ponowić przejściowy błąd odczytu');
  assert.equal(result.photos.length, 2);
  assert.equal(result.photos[0].photo_kind, 'nameplate');
  assert.equal(result.photos[0].device_index, 1);
  assert.equal(result.photos[0].unit_ref, 'jz');
  assert.equal(result.photos[1].unit_ref, 'jw-1');
  console.log('Smoke OK: pracownik wymaga zdjęć, a administrator 10.90 może zakończyć po ręcznym potwierdzeniu weryfikowanym przez backend.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
