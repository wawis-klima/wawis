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
assert.match(appSource, /const JOB_DETAILS_TIMEOUT_MS = 3200;/);
assert.match(appSource, /JOB_DETAILS_RETRY_DELAYS_MS = Object\.freeze\(\[0, 500\]\)/);
assert.match(appSource, /for \(let attemptIndex = 0; attemptIndex < JOB_DETAILS_RETRY_DELAYS_MS\.length; attemptIndex \+= 1\)/);
assert.match(appSource, /job\.details\.retry/);
assert.match(appSource, /Aplikacja spróbowała ponownie/);
assert.doesNotMatch(appSource, /Serwer nie odpowiedział na szczegóły w 7 s/);
assert.match(detailsSource, /PROTOCOL_READ_TIMEOUT_MS = 3200/);
assert.match(detailsSource, /PROTOCOL_READ_RETRY_DELAYS_MS = Object\.freeze\(\[0, 500\]\)/);
assert.match(detailsSource, /if \(!selectedJob\?\.detailsLoaded\)/);
assert.match(detailsSource, /Nie udało się teraz sprawdzić protokołu\. Kliknij „Sprawdź”\./);

const { getSignedPhotoUrl } = await import(pathToFileURL(photosModulePath).href);
const requestTimeoutModulePath = path.join(root, 'src/mobile791/modules/request-timeout.js');
const {
  MOBILE_SUPABASE_REQUEST_TIMEOUT_MS,
  MOBILE_SUPABASE_AUTH_TIMEOUT_MS,
  MOBILE_SUPABASE_STORAGE_SIGN_TIMEOUT_MS,
  MOBILE_SUPABASE_STORAGE_TIMEOUT_MS,
  resolveSupabaseRequestTimeoutMs,
} = await import(pathToFileURL(requestTimeoutModulePath).href);

assert(MOBILE_SUPABASE_STORAGE_SIGN_TIMEOUT_MS < MOBILE_SUPABASE_STORAGE_TIMEOUT_MS, 'podpis zdjęcia musi kończyć się szybciej niż realny transfer pliku');
assert.equal(MOBILE_SUPABASE_REQUEST_TIMEOUT_MS, 45_000, 'zwykły REST nie może być ubijany po 12 s');
assert.equal(MOBILE_SUPABASE_AUTH_TIMEOUT_MS, 12_000, 'krótki limit pozostaje wyłącznie dla auth POST');
assert.equal(
  resolveSupabaseRequestTimeoutMs('https://x.supabase.co/storage/v1/object/sign/job-photos/a.jpg', { method: 'POST' }),
  MOBILE_SUPABASE_STORAGE_SIGN_TIMEOUT_MS,
);
assert.equal(
  resolveSupabaseRequestTimeoutMs('https://x.supabase.co/storage/v1/object/job-photos/a.jpg', { method: 'POST' }),
  MOBILE_SUPABASE_STORAGE_TIMEOUT_MS,
);
assert.equal(
  resolveSupabaseRequestTimeoutMs('https://x.supabase.co/auth/v1/token', { method: 'POST' }),
  MOBILE_SUPABASE_AUTH_TIMEOUT_MS,
);
assert.equal(
  resolveSupabaseRequestTimeoutMs('https://x.supabase.co/rest/v1/job_protocols', { method: 'POST' }),
  MOBILE_SUPABASE_REQUEST_TIMEOUT_MS,
);
assert.match(appSource, /if \(!thumbnailUrl && storagePath && isSessionTokenCurrent\(sessionToken\)\)[\s\S]*transform:\s*null,[\s\S]*forceRefresh:\s*true/);
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

console.log('OK: 11.12 szczegóły montażu retryują się automatycznie, protokół nie konkuruje z nimi o połączenie, a miniatury zachowują fallback do oryginału.');
