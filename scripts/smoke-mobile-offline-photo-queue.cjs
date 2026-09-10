const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const queue = fs.readFileSync(path.join(root, 'src/mobile791/modules/photo-offline-queue.js'), 'utf8');
const photos = fs.readFileSync(path.join(root, 'src/mobile791/modules/photos.js'), 'utf8');
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
assert(panel.includes('Wyślij ponownie'), 'Brak ręcznego ponowienia błędnego uploadu.');
assert(requirements.includes("uploadStatus === 'local'"), 'Lokalna tabliczka błędnie pozwoliłaby zakończyć zlecenie przed synchronizacją.');

console.log('OK smoke-mobile-offline-photo-queue');
