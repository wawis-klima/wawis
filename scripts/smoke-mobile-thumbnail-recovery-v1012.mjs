import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const photosModulePath = path.join(root, 'src/mobile791/modules/photos.js');
const photosSource = read('src/mobile791/modules/photos.js');
const appSource = read('src/mobile791/App.jsx');
const detailsSource = read('src/mobile791/components/JobDetailsPanel.jsx');

assert.match(photosSource, /export function invalidateSignedPhotoUrl/);
assert.match(photosSource, /forceRefresh\s*=\s*false/);
assert.match(photosSource, /if \(forceRefresh\)[\s\S]*invalidateSignedPhotoUrl/);
assert.match(appSource, /photo\.thumbnail\.load\.failed/);
assert.match(appSource, /phase:\s*useOriginal \? 'original_fallback' : 'thumbnail_retry'/);
assert.match(appSource, /phase:\s*'original_fallback'/);
assert.match(appSource, /transform:\s*useOriginal \? null : MOBILE_THUMBNAIL_TRANSFORM/);
assert.match(detailsSource, /onError=\{\(\) => \{ void onThumbnailLoadError\?\.\(photo\); \}\}/);
assert.match(detailsSource, /thumbnail_load_failed/);
assert.match(detailsSource, /Otwórz zdjęcie/);

const { getSignedPhotoUrl } = await import(pathToFileURL(photosModulePath).href);
let signingCalls = 0;
const fakeSupabase = {
  storage: {
    from(bucket) {
      assert.equal(bucket, 'job-photos');
      return {
        async createSignedUrl(storagePath, expiresIn, options) {
          signingCalls += 1;
          return {
            data: {
              signedUrl: `https://example.test/${storagePath}?call=${signingCalls}&ttl=${expiresIn}&mode=${options ? 'thumb' : 'original'}`,
            },
            error: null,
          };
        },
      };
    },
  },
};

const storagePath = 'job-id/uploads/photo-id.jpg';
const transform = { width: 400, quality: 72, resize: 'contain' };
const firstUrl = await getSignedPhotoUrl({ storagePath, supabase: fakeSupabase, transform });
const cachedUrl = await getSignedPhotoUrl({ storagePath, supabase: fakeSupabase, transform });
assert.equal(cachedUrl, firstUrl, 'zwykły odczyt powinien użyć cache');
assert.equal(signingCalls, 1, 'cache nie może ponownie podpisywać tego samego wariantu');

const refreshedUrl = await getSignedPhotoUrl({
  storagePath,
  supabase: fakeSupabase,
  transform,
  forceRefresh: true,
  expiresIn: 3599,
});
assert.notEqual(refreshedUrl, firstUrl, 'odzyskanie musi wymusić nowy podpisany URL');
assert.equal(signingCalls, 2);

const originalUrl = await getSignedPhotoUrl({
  storagePath,
  supabase: fakeSupabase,
  transform: null,
  forceRefresh: true,
  expiresIn: 3598,
});
assert.match(originalUrl, /mode=original/);
assert.equal(signingCalls, 3, 'oryginał musi mieć osobny podpis od transformacji miniatury');

console.log('OK: 10.12 automatycznie odświeża miniaturę, omija wadliwy cache i ma fallback do oryginału.');
