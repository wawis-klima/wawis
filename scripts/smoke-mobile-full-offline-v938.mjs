import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOfflineOperationsToJobs, createOfflineUuid } from '../src/mobile791/modules/job-offline-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const currentVersion = JSON.parse(read('app-version.json')).version;

const restored = applyOfflineOperationsToJobs([{
  id: 'job-1',
  status: 'W trakcie',
  device_model: 'stary',
  device_serial_number: 'stary-sn',
  comments: [],
}], [{
  id: 'device-1', user_id: 'worker-1', job_id: 'job-1', type: 'device',
  payload: { device_fields: { device_model: 'nowy', device_serial_number: 'nowy-sn' } },
}, {
  id: 'comment-1', user_id: 'worker-1', job_id: 'job-1', type: 'comment', created_at: '2026-08-15T10:00:00.000Z',
  payload: { comment_id: '9f1340f0-a779-4b40-909a-4758a5f7c100', type: 'Komentarz', text: 'Zapis offline' },
}, {
  id: 'status-1', user_id: 'worker-1', job_id: 'job-1', type: 'status',
  payload: { status: 'Zakończone' },
}], { id: 'worker-1', full_name: 'Jan Monter' });

assert.equal(restored[0].device_model, 'nowy');
assert.equal(restored[0].device_serial_number, 'nowy-sn');
assert.equal(restored[0].status, 'Zakończone');
assert.equal(restored[0].comments[0].text, 'Zapis offline');
assert.equal(restored[0].comments[0].offline_pending, true);
assert.equal(restored[0].offline_pending, true);
assert.match(createOfflineUuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

const store = read('src', 'mobile791', 'modules', 'job-offline-store.js');
const sync = read('src', 'mobile791', 'modules', 'job-offline-sync.js');
const actions = read('src', 'mobile791', 'hooks', 'useSelectedJobActions.js');
const session = read('src', 'mobile791', 'hooks', 'useAppSession.js');
const app = read('src', 'mobile791', 'App.jsx');
const center = read('src', 'mobile791', 'components', 'PhotoSyncStatus.jsx');
const worker = read('public', 'push-sw.js');
const main = read('src', 'main.jsx');

assert.match(store, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
assert.match(store, /app-snapshots/);
assert.match(store, /job-operations/);
assert.match(session, /loadOfflineAppSnapshot/);
assert.match(session, /applyOfflineOperationsToJobs/);
assert.match(actions, /queueDeviceSaveOffline/);
assert.match(actions, /queueCommentOffline/);
assert.match(actions, /queueStatusOffline/);
assert.match(actions, /Dodanie nowego klienta wymaga internetu/);
assert.match(sync, /OfflineConflictError/);
assert.match(sync, /Dane urządzenia zostały w międzyczasie zmienione/);
assert.match(sync, /OFFLINE_DEPENDENCY_WAITING/);
assert.match(app, /syncOfflineJobOperations/);
assert.match(app, /window\.addEventListener\('online', onlineHandler\)/);
assert.match(center, /Konflikt — nie wysłano/);
assert.match(center, /Zachowaj dane z systemu/);
assert.ok(worker.includes(`wawis-app-shell-v${currentVersion}`));
assert.match(worker, /self\.addEventListener\("fetch"/);
assert.match(worker, /WAWIS_CACHE_LOADED_ASSETS/);
assert.match(main, /navigator\.serviceWorker\.register\('\/push-sw\.js'\)/);
assert.match(main, /registration\.update\(\)/);
assert.match(main, /addEventListener\('controllerchange'/);
assert.match(main, /window\.location\.reload\(\)/);

console.log(`OK: pełny mobilny tryb offline v${currentVersion}.`);
