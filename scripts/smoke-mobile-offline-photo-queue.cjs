const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const queue = fs.readFileSync(path.join(root, 'src/mobile791/modules/photo-offline-queue.js'), 'utf8');
const photos = fs.readFileSync(path.join(root, 'src/mobile791/modules/photos.js'), 'utf8');
const jobsFetch = fs.readFileSync(path.join(root, 'src/mobile791/modules/jobs-fetch.js'), 'utf8');
const sessionHook = fs.readFileSync(path.join(root, 'src/mobile791/hooks/useAppSession.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/mobile791/App.jsx'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src/mobile791/components/JobDetailsPanel.jsx'), 'utf8');
const requirements = fs.readFileSync(path.join(root, 'src/mobile791/modules/nameplate-requirements.js'), 'utf8');

assert(queue.includes("indexedDB.open(DB_NAME, DB_VERSION)"), 'Brak trwałej kolejki IndexedDB.');
assert(queue.includes("local_file: localFile"), 'Lokalny plik nie jest zapisywany w kolejce.');
assert(photos.includes('persistenceResults = await Promise.all'), 'Zdjęcie nie jest zapisywane lokalnie przed wysyłką.');
assert(photos.includes('failedPhotos.forEach'), 'Brak obsługi błędu zapisu zdjęcia w pamięci telefonu.');
assert(photos.includes("upload_status: 'local'"), 'Brak stanu lokalnego zdjęcia.');
assert(photos.includes("upload_status_label: 'Zapisano na telefonie'"), 'Brak etykiety zapisu na telefonie.');
assert(photos.includes("upload_status_label: 'Wysyłanie'"), 'Brak etykiety wysyłania.');
assert(photos.includes("upload_status_label: 'Zapisano w systemie'"), 'Brak etykiety zapisu w systemie.');
assert(photos.includes('resumePersistedPhotoUploads'), 'Brak automatycznego wznowienia kolejki.');
assert(app.includes("window.addEventListener('online', onlineHandler)"), 'Brak automatycznej reakcji na odzyskanie internetu.');
assert(app.includes('restorePersistedJobPhotos'), 'Brak odtwarzania kolejki po ponownym uruchomieniu aplikacji.');
assert(app.includes('const offlineSyncJobCount = Array.isArray(jobs) ? jobs.length : 0;'), 'Odtwarzanie kolejki musi ponowić się, gdy pojawi się lista zleceń.');
assert(app.includes('offlinePhotoQueueUserRef.current !== userId && hasJobsReady'), 'Kolejka nie może zostać oznaczona jako odtworzona przed załadowaniem zleceń.');
const restoreCallIndex = app.indexOf('await restorePersistedJobPhotos({');
const restoreCommitIndex = app.indexOf('offlinePhotoQueueUserRef.current = userId;', restoreCallIndex);
assert(restoreCallIndex >= 0 && restoreCommitIndex > restoreCallIndex, 'Flaga odtworzonej kolejki musi być ustawiana dopiero po await restorePersistedJobPhotos().');
const sessionGuardIndex = app.indexOf('if (!isQueueSessionCurrent()) return;', restoreCallIndex);
assert(sessionGuardIndex > restoreCallIndex && sessionGuardIndex < restoreCommitIndex, 'Po restore trzeba ponownie sprawdzić aktualność sesji przed ustawieniem flagi odtworzenia.');
assert(jobsFetch.includes('export function preserveLatestQueuedPhotos'), 'Brak ochrony lokalnej kolejki przed spóźnionym pełnym refreshem.');
assert(sessionHook.includes('preserveLatestQueuedPhotos(freshJobs, jobsRef.current)'), 'Pierwsza odpowiedź serwera musi scalić najnowszą kolejkę zdjęć.');
assert(sessionHook.includes('preserveLatestQueuedPhotos(payloadJobs, jobsRef.current)'), 'Końcowa odpowiedź serwera nie może nadpisać zdjęcia odtworzonego po starcie requestu.');
assert(jobsFetch.includes("queuedPhotos: photos.filter((photo) => isLocalQueuedPhoto(photo))"), 'Pełny refresh nie może zgubić lokalnego zdjęcia odtworzonego z IndexedDB.');
assert(panel.includes('Wyślij ponownie'), 'Brak ręcznego ponowienia błędnego uploadu.');
assert(requirements.includes("uploadStatus === 'local'"), 'Lokalna tabliczka błędnie pozwoliłaby zakończyć zlecenie przed synchronizacją.');

console.log('OK smoke-mobile-offline-photo-queue');
