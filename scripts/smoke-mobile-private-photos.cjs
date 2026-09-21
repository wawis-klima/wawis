const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const photos = read('src/mobile791/modules/photos.js');
const jobsFetch = read('src/mobile791/modules/jobs-fetch.js');
const app = read('src/mobile791/App.jsx');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

assert(photos.includes("export const PHOTO_BUCKET = 'job-photos'"), 'mobile photos module should use PHOTO_BUCKET');
assert(photos.includes("SIGNED_PHOTO_URL_SESSION_KEY = 'wawis:signed-photo-url-cache:v1'"), 'mobile signed URL cache should persist in sessionStorage');
assert(photos.includes('const signedPhotoUrlInFlight = new Map()'), 'mobile signed URL requests should deduplicate concurrent calls');
assert(photos.includes('.createSignedUrl(normalizedPath, expiresIn, signedUrlOptions)'), 'mobile signed URL helper should forward optional transforms');
assert(photos.includes('image_url: ""') || photos.includes("image_url: ''"), 'mobile upload should not save public URL into image_url');
assert(jobsFetch.includes('transform: {'), 'mobile jobs-fetch should request resized thumbnails');
assert(jobsFetch.includes('width: 400'), 'mobile jobs-fetch should render 400 px thumbnails');
assert(jobsFetch.includes('thumbnail_image_url'), 'mobile jobs-fetch should store thumbnail URL separately');
assert(jobsFetch.includes("image_url: ''"), 'mobile jobs-fetch should leave full image_url empty until preview');
assert(jobsFetch.includes("signed_url: ''"), 'mobile jobs-fetch should leave full signed_url empty until preview');
assert(jobsFetch.includes('photo_url_mode: DETAILS_PHOTO_URL_MODE'), 'mobile jobs-fetch should mark lazy full-photo mode');
assert(app.includes('const jobDetailsRequestsRef = useRef(new Map())'), 'mobile App should deduplicate in-flight detail loads');
assert(app.includes('resolveFullPhotoUrl'), 'mobile App should expose a lazy full-photo resolver');
assert(app.includes('usePhotoPreview(selectedJob, resolveFullPhotoUrl)'), 'mobile App should pass lazy preview resolver to the gallery hook');
assert(
  /loadJobDetailsData\(\{[\s\S]*getSignedPhotoUrl,[\s\S]*supabaseUrl,[\s\S]*\}\)/.test(app),
  'mobile App should forward signed photo config directly to loadJobDetailsData'
);

console.log('OK mobile private photos smoke');
