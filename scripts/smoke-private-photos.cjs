const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { readSql } = require('./sql-paths.cjs');

const root = path.resolve(__dirname, '..');
const photosSource = fs.readFileSync(path.join(root, 'src/modules/photos.js'), 'utf8');
const jobsFetchSource = fs.readFileSync(path.join(root, 'src/modules/jobs-fetch.js'), 'utf8');
const migrationSource = readSql(root, 'private-photos-dashboard-indexes-v8.06.sql');

assert(photosSource.includes('createSignedUrl'), 'photos.js musi używać createSignedUrl dla prywatnych zdjęć');
assert(photosSource.includes('SIGNED_PHOTO_URL_TTL_SECONDS'), 'photos.js musi mieć jawny TTL signed URL');
assert(photosSource.includes('signedPhotoUrlCache = new Map()'), 'Desktop musi cache\'ować signed URL zdjęć');
assert(photosSource.includes('SIGNED_PHOTO_URL_CACHE_SAFETY_MS = 5 * 60 * 1000'), 'Cache desktop signed URL powinien wygasać ok. 5 min przed linkiem');
assert(photosSource.includes('const cachedUrl = getCachedSignedUrl(normalizedPath, transform)'), 'Desktop musi używać cache (osobno dla oryginału i miniatury) przed createSignedUrl');
assert(!photosSource.includes('.getPublicUrl('), 'photos.js nie może generować nowych publicznych URL-i');
assert(photosSource.includes("image_url: ''"), 'Nowe zdjęcia nie powinny zapisywać publicznego URL w image_url');
assert(jobsFetchSource.includes('loadJobDetailsData'), 'Brak lazy loadera szczegółów zdjęć/komentarzy');
assert(jobsFetchSource.includes('getSignedPhotoUrl'), 'Lazy loader musi podpisywać zdjęcia signed URL');
assert(migrationSource.includes("values ('job-photos', 'job-photos', false)"), 'Migracja musi ustawiać bucket job-photos jako prywatny');
assert(migrationSource.includes('job_photos_storage_select_accessible_job'), 'Brak polityki SELECT dla prywatnych zdjęć');
assert(migrationSource.includes('current_user_can_access_job'), 'Brak funkcji ograniczającej dostęp do zdjęć po zleceniu');
assert(migrationSource.includes('grant execute on function public.current_user_can_access_job(uuid)'), 'Brak jawnego GRANT dla helpera dostępu');

console.log('Smoke OK: prywatne zdjęcia + signed URL + RLS storage');
