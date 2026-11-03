// WAWIS 14.13 — region funkcji Vercel (Frankfurt) i limit plików w buckecie job-photos.
// Statyczna kontrola konfiguracji i SQL; wykonanie migracji w czystej bazie sprawdza próba odtworzenia
// (scripts/audit-v1089/rebuild-rehearsal.mjs, manifest-v1089.json), a stan produkcji — SELECT po wykonaniu.
import fs from 'node:fs';
import assert from 'node:assert/strict';

// 1. Funkcje /api (odczyt tabliczki i licznika AI) w Frankfurcie, obok bazy Supabase eu-central-1.
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.deepEqual(vercel.regions, ['fra1'], 'vercel.json: funkcje w regionie fra1 (Frankfurt)');
assert.equal(vercel.functions, undefined, 'brak nadpisań regionu dla pojedynczych funkcji');
assert.equal(vercel.git?.deploymentEnabled?.['*'], false, 'deploy tylko z main — bez zmian');
assert.equal(vercel.git?.deploymentEnabled?.main, true);
assert.match(vercel.buildCommand, /vercel-deploy-guard\.cjs/, 'guard wdrożenia bez zmian');
assert.match(vercel.buildCommand, /release-policy-gate\.cjs --deploy/, 'bramka wdrożenia bez zmian');
for (const file of fs.readdirSync('api')) {
  const source = fs.readFileSync(`api/${file}`, 'utf8');
  assert.doesNotMatch(source, /export\s+const\s+config\s*=[^;]*regions?/s, `${file}: brak własnego regionu`);
}

// 2. Migracja: wyłącznie limit nowych wysyłek w job-photos, bez zmian danych i innych bucketów.
const sqlFile = 'supabase/migrations/20261103110000_job_photos_bucket_limits_v1413.sql';
const sql = fs.readFileSync(sqlFile, 'utf8');
const statements = sql.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);
assert.equal(statements.length, 1, 'migracja ma dokładnie jedno polecenie');
assert.match(statements[0], /^update storage\.buckets\s+set file_size_limit = 20971520,\s+allowed_mime_types = array\['image\/\*'\]\s+where id = 'job-photos'$/);
assert.doesNotMatch(sql, /\b(delete|drop|truncate|insert)\b/i, 'nic nie jest usuwane ani dodawane');
const manifest = JSON.parse(fs.readFileSync('supabase/rebuild/manifest-v1089.json', 'utf8'));
assert.ok(manifest.files.includes(sqlFile), 'migracja w manifeście próby odtworzenia bazy');

// 3. Limit nie blokuje zdjęć, które aplikacja wysyła: zawsze typ obrazu, kompresja do JPG.
const desktop = fs.readFileSync('src/modules/photos.js', 'utf8');
assert.ok(desktop.includes(".jpg'), { type: 'image/jpeg' }));"), 'desktop: kompresja do image/jpeg');
assert.ok(desktop.includes('const maxWidth = 1600;'), 'desktop: zdjęcie zmniejszane do 1600 px');
const mobile = fs.readFileSync('src/mobile791/modules/photos.js', 'utf8');
assert.match(mobile, /\.from\(PHOTO_BUCKET\)\s*\.upload\(storagePath, uploadBytes, \{[^}]*contentType: uploadFile\.type \|\| 'image\/jpeg' \}\)/,
  'telefon: wysyłka zawsze z typem obrazu (domyślnie image/jpeg)');

console.log('PASS WAWIS 14.13 — funkcje Vercel w fra1, limit job-photos 20 MB i image/* bez wpływu na zdjęcia aplikacji.');
