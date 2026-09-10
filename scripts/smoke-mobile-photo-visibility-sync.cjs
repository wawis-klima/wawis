const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mobilePhotosPath = path.join(root, 'src', 'mobile791', 'modules', 'photos.js');
const mobileActionsPath = path.join(root, 'src', 'mobile791', 'hooks', 'useSelectedJobActions.js');
const mobileAppPath = path.join(root, 'src', 'mobile791', 'App.jsx');
const desktopPhotosPath = path.join(root, 'src', 'modules', 'photos.js');

const mobilePhotos = fs.readFileSync(mobilePhotosPath, 'utf8');
const mobileActions = fs.readFileSync(mobileActionsPath, 'utf8');
const mobileApp = fs.readFileSync(mobileAppPath, 'utf8');
const desktopPhotos = fs.readFileSync(desktopPhotosPath, 'utf8');

assert.match(mobilePhotos, /image_url: localPreviewUrl \|\| signedUrl/, 'Uploaded mobile photo should keep local preview as the immediate visible thumbnail');
assert.match(mobilePhotos, /Celowo nie wywołujemy tutaj revokeObjectURL\(localPreviewUrl\)/, 'Mobile upload must not revoke the local preview before details sync');
assert.match(mobilePhotos, /onPhotoUploaded\?\.\(photoForUi, queuedPhoto\)/, 'Mobile upload queue should notify the app after a successful photo upload');
assert.match(mobileActions, /function schedulePhotoDetailsSync\(jobId\)/, 'Mobile actions should schedule a quiet details sync after upload');
assert.match(mobileActions, /reloadJobDetails\?\.\(targetId, \{ force: true, background: true \}\)/, 'Quiet sync should reload only the current job details in the background');
assert.match(mobileApp, /function mergeMobilePhotoDetails\(currentPhotos = \[\], loadedPhotos = \[\]\)/, 'Mobile app should merge details without dropping fresh uploaded photos');
assert.match(mobileApp, /isFreshMobileUploadedPhoto\(photo\)/, 'Fresh uploaded photos should be preserved if a fast refresh misses them');
assert.match(mobileApp, /carryMobilePhotoDisplayState\(photo, existingById\.get\(id\)\)/, 'Details reload should carry existing display URL if Supabase returns a temporary empty URL');
assert.match(mobileApp, /mergeJobDetailsForMobile\(job, cleanDetails\)/, 'Mobile details reload should use the protective merge helper');
assert.doesNotMatch(desktopPhotos, /onPhotoUploaded|localPreviewUrl \|\| signedUrl|mergeMobilePhotoDetails/, 'Desktop photo module must remain untouched by the mobile visibility hotfix');

console.log('Mobile photo visibility sync smoke OK');
process.exit(0);
