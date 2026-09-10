const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const count = (source, pattern) => (source.match(pattern) || []).length;

const desktopApp = read('src/App.jsx');
const mobileApp = read('src/mobile791/App.jsx');
const desktopActions = read('src/hooks/useSelectedJobActions.js');
const mobileActions = read('src/mobile791/hooks/useSelectedJobActions.js');
const desktopPhotos = read('src/modules/photos.js');
const mobilePhotos = read('src/mobile791/modules/photos.js');
const desktopPushHook = read('src/hooks/usePushNotificationsState.js');
const mobilePushHook = read('src/mobile791/hooks/usePushNotificationsState.js');
const desktopPush = read('src/modules/push-subscriptions.js');
const mobilePush = read('src/mobile791/modules/push-subscriptions.js');
const pushWorker = read('public/push-sw.js');
const appVersion = JSON.parse(read('app-version.json')).version;
const packageVersion = JSON.parse(read('package.json')).version;

assert(count(desktopActions, /refreshAll\s*\(/g) === 2, 'desktop: pełny refresh powinien zostać tylko po dodaniu i usunięciu montażu');
assert(count(mobileActions, /refreshAll\s*\(/g) === 1, 'mobile: pełny refresh powinien zostać tylko po usunięciu montażu');
assert(desktopActions.includes('reloadJobSummary?.(jobId)'), 'desktop: brak punktowego odświeżania zmienionego montażu');
assert(mobileActions.includes('reloadJobSummary?.(jobId)'), 'mobile: brak punktowego odświeżania zmienionego montażu');
assert(!desktopPhotos.includes('refreshAll'), 'desktop: moduł zdjęć nadal uruchamia pełne odświeżenie');
assert(!mobilePhotos.includes('refreshAll'), 'mobile: moduł zdjęć nadal uruchamia pełne odświeżenie');

for (const [label, hook] of [['desktop', desktopPushHook], ['mobile', mobilePushHook]]) {
  assert(hook.includes('PUSH_MIN_SYNC_INTERVAL_MS = 10 * 60 * 1000'), `${label}: brak ograniczenia częstotliwości PUSH`);
  assert(hook.includes('lastSuccessfulSyncAtRef'), `${label}: brak pamięci ostatniej poprawnej kontroli PUSH`);
  assert(hook.includes('syncPushState({ force: true })'), `${label}: brak wymuszonej kontroli PUSH po ważnym zdarzeniu`);
}

for (const [label, push] of [['desktop', desktopPush], ['mobile', mobilePush]]) {
  assert(push.includes('PUSH_SERVER_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000'), `${label}: brak ograniczenia zapisu last_seen_at`);
  assert(count(push, /\.select\("id, is_active, last_seen_at"\)/g) === 1, `${label}: kontrola PUSH nadal wykonuje drugi odczyt tego samego rekordu`);
}

assert(desktopApp.includes('DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000'), 'Centrum 360: brak pięciominutowego cache liczników');
assert(desktopApp.includes('dashboardMetricsCacheRef'), 'Centrum 360: brak cache RPC liczników');
assert(desktopApp.includes('dashboardAuxCacheRef'), 'Centrum 360: brak cache SMS/urządzeń');

assert(mobileApp.includes('offlineSyncContextRef'), 'offline: callback nadal zależy od całej listy montaży');
assert(mobileApp.includes('hasPendingOfflineWork'), 'offline: brak warunku uruchamiania okresowej kolejki');
assert(mobileApp.includes('hasPendingOfflineWork\n      ? window.setInterval'), 'offline: timer działa także przy pustej kolejce');

assert(appVersion === packageVersion, 'numery wersji aplikacji i pakietu są różne');
assert(pushWorker.includes(`wawis-app-shell-v${appVersion}`), `service worker nie ma cache v${appVersion}`);

console.log('PASS smoke-technical-refresh-v977');
