import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

for (const relativePath of [
  'src/hooks/useAppSession.js',
  'src/mobile791/hooks/useAppSession.js',
]) {
  const source = read(relativePath);
  const cacheReadIndex = source.indexOf('loadAppDataSnapshot') >= 0
    ? source.indexOf('await loadAppDataSnapshot')
    : source.indexOf('await loadOfflineAppSnapshot');
  const cacheApplyIndex = Math.max(
    source.indexOf('setJobs(cached.jobs)'),
    source.indexOf('setJobs(restoredJobs)'),
  );
  const serverRequestIndex = source.indexOf('loadServerPayloadOnce', cacheReadIndex);
  const serverApplyIndex = Math.max(
    source.indexOf('setJobs(payload.jobs)', serverRequestIndex),
    source.indexOf('setJobs(finalJobs)', serverRequestIndex),
  );

  assert(cacheReadIndex >= 0, `${relativePath}: brak odczytu lokalnej kopii przed serwerem.`);
  assert(cacheApplyIndex > cacheReadIndex, `${relativePath}: cache-first musi najpierw pokazać lokalny snapshot.`);
  assert(serverRequestIndex > cacheApplyIndex, `${relativePath}: po snapshotcie musi rozpocząć się odczyt Supabase.`);
  assert(serverApplyIndex > serverRequestIndex, `${relativePath}: Supabase musi podmienić wcześniej pokazany snapshot.`);
  assert.match(source, /lastAppliedServerRequestIdRef/);
  assert.match(source, /ignoredOlderResponse/);
  assert.match(source, /serverStateUnchanged/);
  assert.match(source, /isRefreshingData/);
  assert.match(source, /setIsRefreshingData\(true\)/);
  assert.match(source, /setIsRefreshingData\(false\)/);
}

const mobileSession = read('src/mobile791/hooks/useAppSession.js');
assert.match(mobileSession, /const payloadRequest = loadServerPayloadOnce\(activeUser\);/);
assert.match(mobileSession, /payload = await payloadRequest\.request;/);
assert.match(mobileSession, /payloadRequestId < lastAppliedServerRequestIdRef\.current/);

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
