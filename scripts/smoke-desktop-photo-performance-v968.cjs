const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');

const photos = fs.readFileSync(path.join(root, 'src/modules/photos.js'), 'utf8');
const fetch = fs.readFileSync(path.join(root, 'src/modules/jobs-fetch.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'src/hooks/usePhotoPreview.js'), 'utf8');
const details = fs.readFileSync(path.join(root, 'src/components/JobDetailsPanel.jsx'), 'utf8');
const realtime = fs.readFileSync(path.join(root, 'src/hooks/useRealtimeRefresh.js'), 'utf8');
const ocr = fs.readFileSync(path.join(root, 'src/components/desktop/DesktopNameplateOcrButton.jsx'), 'utf8');
const mobilePhotos = fs.readFileSync(path.join(root, 'src/mobile791/modules/photos.js'), 'utf8');
const mobileFetch = fs.readFileSync(path.join(root, 'src/mobile791/modules/jobs-fetch.js'), 'utf8');
const mobileApp = fs.readFileSync(path.join(root, 'src/mobile791/App.jsx'), 'utf8');
const mobilePreview = fs.readFileSync(path.join(root, 'src/mobile791/hooks/usePhotoPreview.js'), 'utf8');
const mobileDetails = fs.readFileSync(path.join(root, 'src/mobile791/components/JobDetailsPanel.jsx'), 'utf8');
const mobileRealtime = fs.readFileSync(path.join(root, 'src/mobile791/hooks/useRealtimeRefresh.js'), 'utf8');

for (const [label, photosSource, fetchSource, appSource, previewSource, detailsSource, realtimeSource] of [
  ['desktop', photos, fetch, app, preview, details, realtime],
  ['mobile', mobilePhotos, mobileFetch, mobileApp, mobilePreview, mobileDetails, mobileRealtime],
]) {
  assert(photosSource.includes("SIGNED_PHOTO_URL_SESSION_KEY = 'wawis:signed-photo-url-cache:v1'"), `${label}: signed URL cache must persist in sessionStorage`);
  assert(photosSource.includes('const signedPhotoUrlInFlight = new Map()'), `${label}: signed URL requests must have an in-flight deduplication map`);
  assert(photosSource.includes('signedPhotoUrlInFlight.get(cacheKey)'), `${label}: concurrent signed URL requests must reuse the same Promise`);
  assert(photosSource.includes('ttlMs - SIGNED_PHOTO_URL_CACHE_SAFETY_MS'), `${label}: cache must keep the existing ~55 minute safety window`);
  assert(fetchSource.includes('width: 400'), `${label}: thumbnail should remain 400 px`);
  assert(fetchSource.includes("signed_url: ''"), `${label}: full signed URL must not be created while loading job details`);
  assert(fetchSource.includes("image_url: ''"), `${label}: full image URL must stay empty until the user opens the image`);
  assert(fetchSource.includes('photo_url_mode: DETAILS_PHOTO_URL_MODE'), `${label}: loaded details must mark lazy full-photo mode`);
  assert(appSource.includes('const jobDetailsRequestsRef = useRef(new Map())'), `${label}: reloadJobDetails must deduplicate in-flight requests`);
  assert(appSource.includes('jobDetailsRequestsRef.current.get(targetId)'), `${label}: reloadJobDetails must reuse an active request`);
  assert(appSource.includes('resolveFullPhotoUrl'), `${label}: App must expose a lazy full-photo resolver`);
  assert(previewSource.includes('await resolvePhotoUrl(photoOrUrl)') || previewSource.includes('await resolvePhotoUrl(photoOrUrl);'), `${label}: full photo resolver must run when preview is requested`);
  assert(detailsSource.includes('src={photo.thumbnail_image_url}') || detailsSource.includes('photo.thumbnail_image_url || photo.local_preview_url'), `${label}: gallery must render only the thumbnail (or local preview) before click`);
  assert(!realtimeSource.includes('DETAILS_RETRY_DELAYS_MS'), `${label}: retry chain 1.2/5/12/20 s must be gone`);
  assert(realtimeSource.includes("tableName === 'photos' || tableName === 'comments'"), `${label}: photo/comment realtime details must be separate from refreshAll`);
}

assert(details.includes('openPreview(photo, photoIndex, installationPhotos)'), 'desktop: gallery must pass the photo object and resolve full URL on click');
assert(!details.includes('src={photo.thumbnail_image_url || photo.image_url}'), 'desktop: thumbnail must not fall back automatically to full image');
assert(ocr.includes('await getSignedPhotoUrl({'), 'desktop: nameplate OCR must resolve its full source lazily on user action');
assert(mobileDetails.includes('openPreview(photo, index, regularPhotos)'), 'mobile: gallery must pass the photo object and resolve full URL on click');

console.log('Smoke OK: v9.68/v9.69 photo loading is lazy, deduplicated, session-cached and realtime-decoupled on desktop and mobile');
