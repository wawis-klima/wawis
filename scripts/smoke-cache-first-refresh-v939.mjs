import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

for (const relativePath of [
  'src/hooks/useAppSession.js',
  'src/mobile791/hooks/useAppSession.js',
]) {
  const source = read(relativePath);
  const cacheReadIndex = source.indexOf('loadAppDataSnapshot') >= 0
    ? source.indexOf('await loadAppDataSnapshot')
    : source.indexOf('await loadOfflineAppSnapshot');
  const serverReadIndex = Math.max(
    source.indexOf('const payload = await refreshAppData'),
    source.indexOf('payload = await loadServerPayloadOnce'),
    source.indexOf('payload = await withRefreshTimeout(loadServerPayload'),
  );
  assert(cacheReadIndex >= 0, `${relativePath}: brak odczytu lokalnej kopii przed serwerem.`);
  assert(serverReadIndex > cacheReadIndex, `${relativePath}: Supabase musi podmienić wcześniej pokazany snapshot.`);
  assert.match(source, /lastAppliedServerRequestIdRef/);
  assert.match(source, /ignoredOlderResponse/);
  assert.match(source, /serverStateUnchanged/);
  assert.match(source, /isRefreshingData/);
  assert.match(source, /setIsRefreshingData\(true\)/);
  assert.match(source, /setIsRefreshingData\(false\)/);
}

const desktopSnapshot = read('src/modules/app-data-snapshot.js');
assert.match(desktopSnapshot, /server_fetched_at_ms/);
assert.match(desktopSnapshot, /currentVersion > normalizedServerFetchedAtMs/);
assert.match(desktopSnapshot, /photos: _photos/);
assert.match(desktopSnapshot, /comments: _comments/);

const mobileSnapshot = read('src/mobile791/modules/job-offline-store.js');
assert.match(mobileSnapshot, /server_fetched_at_ms/);
assert.match(mobileSnapshot, /currentVersion > normalizedServerFetchedAtMs/);

for (const relativePath of [
  'src/components/layout/AppAuthenticatedLayout.jsx',
  'src/mobile791/components/layout/AppAuthenticatedLayout.jsx',
]) {
  const source = read(relativePath);
  assert.match(source, /appDataRefreshStatus/);
  assert.match(source, />Odświeżanie</);
}

const desktopAuth = read('src/modules/auth.js');
assert.match(desktopAuth, /Promise\.race\(\[\s*supabase\.auth\.signOut\(\{ scope: 'local' \}\)/, 'Desktop logout nie może czekać na wolny endpoint Auth.');

console.log('OK: cache-first pokazuje snapshot, odświeża z Supabase i blokuje nadpisanie nowszego stanu starszą odpowiedzią.');
