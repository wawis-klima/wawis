const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
  const queueSource = read('src/mobile791/modules/photo-offline-queue.js');
  const photosSource = read('src/mobile791/modules/photos.js');
  const requirementsSource = read('src/mobile791/modules/nameplate-requirements.js');
  const appSource = read('src/mobile791/App.jsx');
  const migrationSource = read('photo-upload-idempotency-v8.82.sql');

  const queueVersion = Number(queueSource.match(/const DB_VERSION = (\d+);/)?.[1] || 0);
  assert(queueVersion >= 2, 'Kolejka IndexedDB nie zachowuje migracji identyfikatorów uploadu z wersji 2.');
  assert(queueSource.includes("ensureIndex(store, 'upload_key', 'upload_key')"), 'Brak indeksu stałego identyfikatora uploadu.');
  assert(queueSource.includes('file_fingerprint'), 'Kolejka nie przechowuje odcisku pliku.');
  assert(queueSource.includes('planned_storage_path'), 'Kolejka nie przechowuje stałej ścieżki wysyłki.');
  assert(photosSource.includes('activePhotoUploadPromises'), 'Brak blokady równoległego wysyłania tego samego zdjęcia.');
  assert(photosSource.includes('findExistingServerPhotoForQueuedPhoto'), 'Brak kontroli serwera przed ponownym uploadem.');
  assert(photosSource.includes('reconcileQueuedPhotoFromServer'), 'Brak uzgodnienia lokalnego błędu z poprawnym zdjęciem serwerowym.');
  assert(photosSource.includes('findLegacyServerNameplate'), 'Brak naprawy starych wpisów kolejki z wersji 8.81.');
  assert(photosSource.includes('new Map(queuedCandidates.map((photo) => [String(photo.id), photo]))'), 'Brak deduplikacji identycznych zdjęć przed zapisem kolejki.');
  assert(requirementsSource.includes('priority = isNameplatePhotoReady(photo)'), 'Poprawna tabliczka serwerowa nie ma pierwszeństwa nad lokalnym błędem.');
  assert(appSource.includes('supabaseUrl,\n          profile: currentProfile,\n          setJobs'), 'Odtwarzanie kolejki nie uzgadnia już danych z Supabase.');
  assert(migrationSource.includes('create unique index if not exists photos_storage_path_unique_v882'), 'Brak unikalności ścieżki zdjęcia po stronie Supabase.');

  const photosModule = await import(pathToFileURL(path.join(root, 'src/mobile791/modules/photos.js')).href);
  const sameBytesA = new File([Buffer.from('wawis-identyczne-zdjecie')], 'tabliczka-a.jpg', { type: 'image/jpeg', lastModified: 1 });
  const sameBytesB = new File([Buffer.from('wawis-identyczne-zdjecie')], 'inna-nazwa.jpg', { type: 'image/jpeg', lastModified: 999 });
  const otherBytes = new File([Buffer.from('wawis-inne-zdjecie')], 'tabliczka-b.jpg', { type: 'image/jpeg', lastModified: 1 });
  const metadata = { photo_kind: 'nameplate', device_index: 1, unit_ref: 'jz' };

  const first = await photosModule.createPhotoUploadIdentity({ file: sameBytesA, jobId: 'job-1', metadata });
  const duplicate = await photosModule.createPhotoUploadIdentity({ file: sameBytesB, jobId: 'job-1', metadata });
  const changedFile = await photosModule.createPhotoUploadIdentity({ file: otherBytes, jobId: 'job-1', metadata });
  const otherUnit = await photosModule.createPhotoUploadIdentity({ file: sameBytesA, jobId: 'job-1', metadata: { ...metadata, unit_ref: 'jw-1' } });

  assert.strictEqual(first.fileFingerprint, duplicate.fileFingerprint, 'Odcisk identycznych bajtów powinien być taki sam.');
  assert.strictEqual(first.uploadKey, duplicate.uploadKey, 'Identyczne zdjęcie tej samej tabliczki powinno dostać ten sam identyfikator uploadu.');
  assert.strictEqual(first.localId, duplicate.localId, 'Identyczne zdjęcie nie może tworzyć drugiego rekordu lokalnego.');
  assert.notStrictEqual(first.uploadKey, changedFile.uploadKey, 'Inne zdjęcie powinno dostać inny identyfikator.');
  assert.notStrictEqual(first.uploadKey, otherUnit.uploadKey, 'To samo zdjęcie przypisane do innej jednostki powinno mieć osobny identyfikator.');

  const requirementsModule = await import(pathToFileURL(path.join(root, 'src/mobile791/modules/nameplate-requirements.js')).href);
  const remotePhoto = {
    id: 'server-photo',
    job_id: 'job-1',
    storage_path: 'job-1/nameplates/device-1_jz_SN_server.jpg',
    created_at: '2026-07-30T05:00:00.000Z',
    upload_status: 'uploaded',
  };
  const newerLocalError = {
    id: 'local-photo-upload-error',
    job_id: 'job-1',
    photo_kind: 'nameplate',
    device_index: 1,
    unit_ref: 'jz',
    created_at: '2026-07-30T05:05:00.000Z',
    upload_status: 'error',
    image_url: 'blob:local-error',
  };
  const preferred = requirementsModule.getLatestNameplatePhotoForUnit([remotePhoto, newerLocalError], 1, 'jz');
  assert.strictEqual(preferred.id, 'server-photo', 'Poprawna tabliczka serwerowa musi wygrać z nowszym lokalnym błędem.');
  assert.strictEqual(requirementsModule.isNameplatePhotoReady(preferred), true, 'Zlecenie powinno uznać serwerową tabliczkę za zapisaną.');

  console.log('OK smoke-mobile-photo-idempotency');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
