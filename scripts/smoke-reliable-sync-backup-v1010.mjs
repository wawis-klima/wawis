import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const version = JSON.parse(read('app-version.json')).version;
const offlineStore = read('src', 'mobile791', 'modules', 'job-offline-store.js');
const offlineSync = read('src', 'mobile791', 'modules', 'job-offline-sync.js');
const incremental = read('src', 'mobile791', 'modules', 'incremental-sync.js');
const session = read('src', 'mobile791', 'hooks', 'useAppSession.js');
const realtime = read('src', 'mobile791', 'hooks', 'useRealtimeRefresh.js');
const desktopSession = read('src', 'hooks', 'useAppSession.js');
const desktopRealtime = read('src', 'hooks', 'useRealtimeRefresh.js');
const desktopApp = read('src', 'App.jsx');
const photoQueue = read('src', 'mobile791', 'modules', 'photo-offline-queue.js');
const photos = read('src', 'mobile791', 'modules', 'photos.js');
const diagnostics = read('src', 'modules', 'diagnostics.js');
const mobileDiagnostics = read('src', 'mobile791', 'modules', 'diagnostics.js');
const adminPanel = read('src', 'components', 'diagnostics', 'DiagnosticsPanel.jsx');
const migration = read('supabase', 'migrations', '20260907120000_reliable_sync_diagnostics_backup_v1010.sql');
const backupFunction = read('supabase', 'functions', 'backup-storage-assets', 'index.ts');

const [versionMajor, versionMinor] = String(version).split('.').map(Number);
assert(
  versionMajor > 10 || (versionMajor === 10 && versionMinor >= 10),
  'Test mechanizmów v10.10 wymaga wersji 10.10 lub nowszej.',
);

assert.match(offlineStore, /change_cursor/);
assert.match(offlineStore, /updateOfflineSyncCursor/);
assert.match(offlineStore, /lease_until/);
assert.match(offlineSync, /recoverStaleOfflineJobOperations/);
assert.match(offlineSync, /mobile_sync_receipts/);
assert.match(offlineSync, /next_attempt_at/);

assert.match(incremental, /get_mobile_change_batch/);
assert.match(incremental, /get_mobile_change_head/);
assert.match(session, /refreshChanged/);
assert.match(session, /updateOfflineSyncCursor\(userId, nextCursor\)/);
assert.match(realtime, /refreshChangedRef\.current/);
assert.match(desktopSession, /const refreshChanged = useCallback/);
assert.match(desktopRealtime, /refreshChangedRef\.current/);
assert.match(desktopApp, /refreshChanged,\n\s+reloadJobSummary/);

assert.match(photoQueue, /prepared_file/);
assert.match(photoQueue, /recoverStalePhotoQueueItems/);
assert.match(photos, /upload_stage: 'prepared'/);
assert.match(photos, /upload_stage: 'storage_uploaded'/);
assert.match(photos, /getPhotoRetryDelayMs/);

for (const source of [diagnostics, mobileDiagnostics]) {
  assert.match(source, /startSilentDiagnosticSync/);
  assert.match(source, /app_diagnostic_events/);
  assert.match(source, /technicalOnly: true/);
}
assert.match(adminPanel, /Cicha diagnostyka urządzeń/);
assert.match(adminPanel, /Kopie zdjęć i protokołów/);

for (const table of ['mobile_change_feed', 'mobile_sync_receipts', 'app_diagnostic_events', 'storage_backup_queue']) {
  assert(migration.includes(`alter table public.${table} enable row level security`), `${table}: brak RLS`);
  assert(migration.includes(`grant `) && migration.includes(`table public.${table}`), `${table}: brak jawnego GRANT`);
}
assert.match(migration, /get_mobile_change_batch/);
assert.match(migration, /photos_enqueue_storage_backup/);
assert.match(migration, /job_protocols_enqueue_storage_backup/);
assert.match(backupFunction, /BACKUP_SUPABASE_URL/);
assert.match(backupFunction, /BACKUP_SUPABASE_SERVICE_ROLE_KEY/);
assert.match(backupFunction, /source_version/);
assert.match(backupFunction, /status: "completed"/);
assert(!backupFunction.includes('console.log'), 'Funkcja kopii nie może wypisywać danych plików do logów.');

const incrementalModule = await import('../src/mobile791/modules/incremental-sync.js');
const rpcCalls = [];
const fakeSupabase = {
  async rpc(name, params) {
    rpcCalls.push({ name, params });
    if (name === 'get_mobile_change_head') return { data: 41, error: null };
    return {
      data: [
        { change_seq: 43, job_id: 'job-b', change_kind: 'update', changed_at: '2026-09-07T10:01:00Z' },
        { change_seq: 42, job_id: 'job-a', change_kind: 'update', changed_at: '2026-09-07T10:00:00Z' },
      ],
      error: null,
    };
  },
};
assert.equal(await incrementalModule.loadMobileChangeHead({ supabase: fakeSupabase }), 41);
const delta = await incrementalModule.loadMobileChangeBatch({ supabase: fakeSupabase, afterCursor: 41, limit: 100 });
assert.equal(delta.available, true);
assert.deepEqual(delta.changes.map((item) => item.changeSeq), [42, 43]);
assert.equal(rpcCalls[1].params.p_after_seq, 41);

console.log(`OK: ${version} zachowuje mechanizmy v10.10 — trwały punkt synchronizacji, przyrostowe odświeżanie, cichą diagnostykę, wznowienia zdjęć i zewnętrzną kopię.`);
