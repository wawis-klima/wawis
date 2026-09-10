const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const app = read('src', 'mobile791', 'App.jsx');
const hook = read('src', 'mobile791', 'hooks', 'usePhotoSyncStatus.js');
const component = read('src', 'mobile791', 'components', 'PhotoSyncStatus.jsx');
const centerCss = read('src', 'mobile791', 'components', 'photo-sync-center.css.js');
const layout = read('src', 'mobile791', 'components', 'jobs', 'MobileJobsLayout.jsx');
const photos = read('src', 'mobile791', 'modules', 'photos.js');
const packageJson = JSON.parse(read('package.json'));
const releaseRunner = read('scripts', 'run-release.cjs');

assert.match(component, /Synchronizacja zdjęć/);
assert.match(component, /Wyślij wszystkie/);
assert.match(component, /Ostatnia synchronizacja/);
assert.match(component, /Nie usuwaj aplikacji ani danych Safari/);
assert.match(component, /onRetryPhoto/);
assert.match(component, /onRetryAll/);
assert.match(component, /onOpenJob/);
assert.match(component, /queueItems\.map/);
assert.match(component, /Wszystko wysłane/);
assert.match(component, /AppModal/);
assert.match(centerCss, /\.photoSyncCenterModal/);
assert.match(centerCss, /max-height:min\(88vh,760px\)/);
assert.match(centerCss, /\.mobileConnectionSyncButton/);

assert.match(hook, /listPhotoQueueItems/);
assert.match(hook, /queueItems/);
assert.match(hook, /LAST_PHOTO_SYNC_STORAGE_KEY/);
assert.match(hook, /localStorage\.setItem/);
assert.match(hook, /Wszystko wysłane/);
assert.match(hook, /PHOTO_QUEUE_CHANGED_EVENT/);

assert.match(photos, /includeErrors = false/);
assert.match(photos, /retryAllPersistedPhotoUploads/);
assert.match(photos, /includeErrors: true/);
assert.match(app, /retryAllPersistedPhotoUploads/);
assert.match(app, /retryAllPhotoUploads/);
assert.match(app, /retryAllPhotoUploads=\{retryAllPhotoUploads\}/);
assert.match(layout, /onRetryAll=\{retryAllPhotoUploads\}/);
assert.match(layout, /onRetryPhoto=\{retryPhotoUpload\}/);

assert.equal(packageJson.scripts['test:smoke:mobile-photo-sync-center'], 'node scripts/smoke-mobile-photo-sync-center.cjs');
assert.match(releaseRunner, /test:smoke:mobile-photo-sync-center/);

console.log('Mobile photo sync center smoke OK');
