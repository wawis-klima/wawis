const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const app = read('src', 'mobile791', 'App.jsx');
const hook = read('src', 'mobile791', 'hooks', 'usePhotoSyncStatus.js');
const component = read('src', 'mobile791', 'components', 'PhotoSyncStatus.jsx');
const layout = read('src', 'mobile791', 'components', 'jobs', 'MobileJobsLayout.jsx');
const actions = read('src', 'mobile791', 'hooks', 'useSelectedJobActions.js');
const photos = read('src', 'mobile791', 'modules', 'photos.js');
const styles = read('src', 'mobile791', 'styles.css');

assert.match(hook, /navigator\.onLine/);
assert.match(hook, /effectiveType/);
assert.match(hook, /markPhotoSyncing/);
assert.match(hook, /markPhotoSynced/);
assert.match(hook, /markPhotoSyncError/);
assert.match(component, /role="status"/);
assert.match(component, /Połączenie:/);
assert.match(layout, /!isAdmin \? \(\s*<PhotoSyncStatus/);
assert.match(app, /photoSyncStatus=\{photoSyncStatus\}/);
assert.match(actions, /onPhotoSyncStart/);
assert.match(actions, /onPhotoSyncSuccess/);
assert.match(actions, /onPhotoSyncError/);
assert.match(photos, /onPhotoUploadError/);
assert.match(styles, /\.mobileConnectionSyncRow/);
assert.match(styles, /\.sync-synced/);

console.log('Mobile photo sync indicator smoke OK');
