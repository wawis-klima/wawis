// WAWIS 14.05 — przeładowanie po aktualizacji nie cofa do pierwszego ekranu (zgłoszenie 01.11.2026).
// Wykonuje rzeczywisty kod: update-reload-position.js, update-reload-guard.js oraz funkcję
// pageMatchesLiveVersion i obsługę controllerchange wyjęte z src/main.jsx.
import assert from 'node:assert/strict';
import fs from 'node:fs';

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
const position = await import('../src/modules/update-reload-position.js');

// ---------- 1. Pamięć pozycji ----------
let win = { sessionStorage: memoryStorage() };
const allowed = ['jobs', 'fuel', 'devices'];
position.rememberActivePosition('devices', 'devices', win);
let r = position.restorePositionAfterUpdate({ fallbackModule: 'jobs', fallbackSection: 'orders', allowedModules: allowed, now: 1000, win });
assert.deepEqual(r, { module: 'jobs', section: 'orders', restored: false }, 'Bez znacznika aktualizacji — ekran startowy.');
position.markUpdateReload(10_000, win);
r = position.restorePositionAfterUpdate({ fallbackModule: 'jobs', allowedModules: allowed, now: 12_000, win });
assert.deepEqual(r, { module: 'devices', section: 'devices', restored: true }, 'Po aktualizacji — ten sam moduł.');
r = position.restorePositionAfterUpdate({ fallbackModule: 'jobs', allowedModules: allowed, now: 12_500, win });
assert.equal(r.restored, false, 'Znacznik jednorazowy.');
position.markUpdateReload(10_000, win);
assert.equal(position.restorePositionAfterUpdate({ fallbackModule: 'jobs', allowedModules: allowed, now: 50_001, win }).restored, false, 'Znacznik starszy niż 30 s ignorowany.');
position.rememberActivePosition('sms', 'sms', win); position.markUpdateReload(10_000, win);
assert.equal(position.restorePositionAfterUpdate({ fallbackModule: 'jobs', allowedModules: allowed, now: 11_000, win }).module, 'jobs', 'Nieznany moduł → ekran startowy.');
win = { get sessionStorage() { throw new Error('SecurityError'); } };
assert.doesNotThrow(() => position.rememberActivePosition('fuel', 'fuel', win));
assert.equal(position.restorePositionAfterUpdate({ fallbackModule: 'jobs', allowedModules: allowed, win }).module, 'jobs', 'Zablokowany sessionStorage nie psuje startu.');

// ---------- 2. update-reload-guard zapisuje znacznik tuż przed przeładowaniem ----------
const store = memoryStorage();
let reloaded = 0;
globalThis.window = {
  sessionStorage: store,
  location: { reload: () => { reloaded++; assert.ok(store.getItem('wawis-update-reload-at'), 'Znacznik zapisany PRZED reload.'); } },
  setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id),
  dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
};
const guard = await import('../src/modules/update-reload-guard.js');
guard.__resetUpdateReloadGuardForTests();
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
guard.requestUpdateReload('test');
await tick();
assert.equal(reloaded, 1);
store.removeItem('wawis-update-reload-at');
const release = guard.blockUnsavedWork('formularz');
guard.requestUpdateReload('test-2');
await tick();
assert.equal(reloaded, 1, 'Niezapisana praca nadal blokuje przeładowanie (13.81).');
assert.equal(store.getItem('wawis-update-reload-at'), null, 'Wstrzymane przeładowanie nie zostawia znacznika.');
release();
await tick();
assert.equal(reloaded, 2);

// ---------- 3. controllerchange: przeładowanie tylko dla nieaktualnej strony ----------
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const fnSrc = main.match(/async function pageMatchesLiveVersion\(\) \{[\s\S]*?\n\}\n/)?.[0];
assert.ok(fnSrc, 'pageMatchesLiveVersion istnieje.');
async function check(appVersion, fetchImpl) {
  const fn = new Function('APP_VERSION', 'fetch', fnSrc + '\nreturn pageMatchesLiveVersion;')(appVersion, fetchImpl);
  return fn();
}
const json = v => async () => ({ ok: true, json: async () => ({ version: v }) });
assert.equal(await check('14.05', json('14.05')), true, 'Strona już w nowej wersji → bez przeładowania.');
assert.equal(await check('14.04', json('14.05')), false, 'Strona starsza niż serwer → przeładowanie.');
assert.equal(await check('14.05', async () => { throw new Error('offline'); }), false, 'Brak sieci → bezpiecznie przeładuj (jak dotąd).');
assert.equal(await check('14.05', async () => ({ ok: false })), false);
assert.equal(await check('14.05', json('')), false);

const handler = main.match(/addEventListener\('controllerchange', \(\) => \{[\s\S]*?\n    \}\)/)?.[0] || '';
assert.match(handler, /pageMatchesLiveVersion\(\)\.then\(\(current\) => \{\s*if \(current\) \{/, 'Decyzja o przeładowaniu po sprawdzeniu wersji.');
assert.match(handler, /requestUpdateReload\('service-worker-controllerchange'\)/, 'Nieaktualna strona nadal przeładowywana.');
assert.ok(handler.indexOf('if (current)') < handler.indexOf("requestUpdateReload('service-worker-controllerchange')"));

// ---------- 4. Obie aplikacje używają przywracania, strażniki ról bez zmian ----------
const mobile = fs.readFileSync(new URL('../src/mobile791/App.jsx', import.meta.url), 'utf8');
const desktop = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
for (const [name, src] of [['mobile', mobile], ['desktop', desktop]]) {
  assert.match(src, /useState\(initialPosition\.module\)/, name + ': moduł startowy z przywrócenia.');
  assert.match(src, /rememberActivePosition\(activeModule, desktopNavKey\)/, name + ': zapamiętanie pozycji.');
}
assert.match(mobile, /if \(!isAdmin && !\["jobs", "fuel", "pricelist"\]\.includes\(activeModule\)\)/, 'Strażnik ról telefonu bez zmian.');
assert.match(desktop, /if \(!isAdmin && !\["jobs", "fuel"\]\.includes\(activeModule\)\)/, 'Strażnik ról komputera bez zmian.');
console.log('WAWIS 14.05 update reload keeps module: PASS');
