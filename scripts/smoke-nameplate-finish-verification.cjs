const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const fetchPath = path.join(root, 'src', 'mobile791', 'modules', 'jobs-fetch.js');
const actionsPath = path.join(root, 'src', 'mobile791', 'hooks', 'useSelectedJobActions.js');
const fetchSource = fs.readFileSync(fetchPath, 'utf8');
const actionsSource = fs.readFileSync(actionsPath, 'utf8');

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

(async () => {
  const jobsFetch = await import(pathToFileURL(fetchPath).href);
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
  console.log('Smoke OK: zakończenie używa lekkiej, ponawianej kontroli samych tabliczek.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
