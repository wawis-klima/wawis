// WAWIS 14.50 — porządek w repozytorium (audyt 20.11.2026, decyzja właściciela).
// RED na 14.49: w katalogu głównym 57 plików SQL (41 identycznych kopii z supabase/migrations/archive,
// jedna nowsza niż kopia w archiwum), 66 notatek RELEASE-RESULT-*, katalogi CSV i stare instrukcje;
// supabase/*.sql (setup) obok katalogu migracji. Nie było wiadomo, który plik SQL jest aktualny.
// GREEN: historyczne SQL tylko w supabase/migrations/archive, historyczne notatki w docs/archive,
// testy i manifest odbudowy czytają nowe ścieżki, a nowy bałagan w katalogu głównym zatrzymuje CI.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const rootFiles = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);

assert.deepEqual(rootFiles.filter((name) => /\.sql$/i.test(name)), [], 'katalog główny bez plików SQL — archiwum: supabase/migrations/archive');
assert.deepEqual(rootFiles.filter((name) => /^RELEASE-RESULT-.+\.md$/.test(name)), [], 'notatki dawnych wydań w docs/archive/release-results');
assert.deepEqual(rootFiles.filter((name) => /\.csv$/i.test(name)), [], 'katalogi CSV w docs/archive/catalogs');
assert.ok(rootFiles.includes('RELEASE-RESULT.md'), 'bieżący RELEASE-RESULT.md zostaje (używa go automatyka wydania)');
const supabaseLooseSql = fs.readdirSync(path.join(root, 'supabase')).filter((name) => /\.sql$/i.test(name));
assert.deepEqual(supabaseLooseSql, [], 'supabase/*.sql przeniesione do supabase/migrations/archive');

const archive = path.join(root, 'supabase', 'migrations', 'archive');
for (const file of [
  'sms-module-stage-9-log-cleanup.sql', 'nameplate-product-catalog-v8.92.sql', 'worker-create-contractor-v9.19.sql',
  'setup-fuel-module-v10.14.sql', 'setup-job-protocols-v9.79.sql', 'mobile-photo-upload-rls-v8.32.sql',
]) {
  assert.ok(fs.existsSync(path.join(archive, file)), `archiwum: ${file}`);
}
// Kopia w archiwum to nowsza wersja z katalogu głównego (v12.17), nie starsza z etapu 9.
assert.match(fs.readFileSync(path.join(archive, 'sms-module-stage-9-log-cleanup.sql'), 'utf8'), /^-- v12\.17:/);
assert.ok(fs.existsSync(path.join(root, 'docs', 'archive', 'catalogs', 'wawis-katalog-ean-rotenso-v9.02.csv')));
assert.ok(fs.existsSync(path.join(root, 'docs', 'archive', 'release-results', 'RELEASE-RESULT-9.05.md')));
assert.ok(fs.existsSync(path.join(root, 'docs', 'archive', 'notes', 'SUPABASE-EDGE-DEPLOY-v9.87.md')));
assert.ok(fs.existsSync(path.join(root, 'docs', 'archive', 'README.md')), 'opis archiwum');

// Manifest odbudowy bazy wskazuje wyłącznie istniejące pliki.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase', 'rebuild', 'manifest-v1089.json'), 'utf8'));
const missing = manifest.files.filter((file) => !fs.existsSync(path.join(root, file)));
assert.deepEqual(missing, [], 'manifest odbudowy bez nieistniejących plików');

// Testy, które czytały te pliki (np. smoke-fuel-module-v1014, smoke-nameplate-product-catalog), czytają je teraz
// z archiwum — sprawdza to ich własne uruchomienie w CI (brak pliku = błąd odczytu).

console.log(`PASS WAWIS 14.50 — porządek w repozytorium: katalog główny ${rootFiles.length} plików, SQL tylko w supabase/migrations/archive, notatki w docs/archive, manifest odbudowy kompletny.`);
