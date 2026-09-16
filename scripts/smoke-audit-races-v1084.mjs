import assert from 'node:assert/strict';
import fs from 'node:fs';

const mobileSession = fs.readFileSync('src/mobile791/hooks/useAppSession.js', 'utf8');
const desktopSession = fs.readFileSync('src/hooks/useAppSession.js', 'utf8');
const mobileApp = fs.readFileSync('src/mobile791/App.jsx', 'utf8');
const desktopApp = fs.readFileSync('src/App.jsx', 'utf8');
const mobileRealtime = fs.readFileSync('src/mobile791/hooks/useRealtimeRefresh.js', 'utf8');
const desktopRealtime = fs.readFileSync('src/hooks/useRealtimeRefresh.js', 'utf8');
const offline = fs.readFileSync('src/mobile791/modules/job-offline-store.js', 'utf8');

for (const source of [mobileSession, desktopSession]) {
  assert.match(source, /captureCurrentSessionToken/);
  assert.match(source, /isSessionTokenCurrent/);
  assert.match(source, /refreshRequestIdRef\.current \+ 1/);
  assert.match(source, /isCurrentDataRequest/);
  assert.match(source, /lastAppliedServerRequestIdRef\.current = Math\.max/);
}
assert.match(mobileSession, /const operations = await listOfflineJobOperations\(userId\);\s*if \(!isCurrentRefreshRequest\(\)\) return \{ ok: true, ignoredOlderResponse: true \};/);
for (const source of [mobileApp, desktopApp]) {
  assert.match(source, /sessionToken\.generation.*sessionToken\.userId.*targetId/s);
  assert.match(source, /if \(!isSessionTokenCurrent\(sessionToken\)\) return null/);
  assert.match(source, /hydrateJobThumbnails\(targetId, cleanDetails\.photos \|\| \[\], sessionToken\)/);
}
for (const source of [mobileRealtime, desktopRealtime]) {
  assert.match(source, /fallbackTimer[\s\S]*scheduleSelectedDetailsReload\(selectedId, \{ immediate: true \}\)[\s\S]*scheduleRefresh\(\)/);
}
const photoQueue = fs.readFileSync('src/mobile791/modules/photo-offline-queue.js', 'utf8');
const photoQueueUpdateBlock = photoQueue.slice(photoQueue.indexOf('export async function updatePhotoQueueItem'), photoQueue.indexOf('export async function deletePhotoQueueItem'));
assert.match(photoQueueUpdateBlock, /db\.transaction\(STORE_NAME, 'readwrite'\)/);
assert.match(photoQueueUpdateBlock, /store\.get\(String\(photoId\)\)/);
assert.match(photoQueueUpdateBlock, /store\.put\(/);
assert.doesNotMatch(photoQueueUpdateBlock, /withStore\('readonly'/);
const cursorBlock = offline.slice(offline.indexOf('export async function updateOfflineSyncCursor'), offline.indexOf('export async function loadOfflineAppSnapshot'));
assert.match(cursorBlock, /db\.transaction\(SNAPSHOT_STORE, 'readwrite'\)/);
assert.match(cursorBlock, /store\.get\(normalizedUserId\)/);
assert.match(cursorBlock, /store\.put\(/);
assert.doesNotMatch(cursorBlock, /withStore\(SNAPSHOT_STORE, 'readonly'/);
console.log('GO: 10.84 stale loaders, polling, request order and cursor transaction are guarded.');
