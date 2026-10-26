// WAWIS 13.76 — service worker: pełne pobranie wersji przed aktywacją, bezpieczna podmiana cache.
// Uruchamia prawdziwy public/push-sw.js w atrapie środowiska service workera (bez przeglądarki).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/push-sw.js'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(root, 'public/app-version.json'), 'utf8')).version;
const CURRENT = `wawis-app-shell-v${version}`;

function createEnvironment({ files, manifest, failing = new Set(), existingCaches = [] }) {
  const stores = new Map(existingCaches.map((name) => [name, new Map([['/', { body: `old ${name}` }]])]));
  const listeners = {};
  const fetchLog = [];
  let skipWaitingCalled = false;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(key, response) { store.set(typeof key === 'string' ? key : key.url, response); },
        async match(key) { return store.get(typeof key === 'string' ? key : key.url) || undefined; },
        async add(key) { store.set(key, { body: key }); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async has(name) { return stores.has(name); },
    async match(key) { for (const store of stores.values()) { const hit = store.get(key); if (hit) return hit; } return undefined; },
  };
  const context = {
    console,
    URL,
    setTimeout: (fn) => setTimeout(fn, 0),
    caches,
    importScripts() {},
    indexedDB: {},
    Request: class { constructor(url, init = {}) { this.url = url; this.init = init; } },
    async fetch(request) {
      const url = typeof request === 'string' ? request : request.url;
      const pathname = url.split('?')[0];
      fetchLog.push({ url: pathname, cache: request?.init?.cache });
      if (pathname === '/precache-manifest.json') {
        if (!manifest) return { ok: false, status: 404, type: 'basic' };
        return { ok: true, status: 200, type: 'basic', json: async () => manifest };
      }
      if (failing.has(pathname)) throw new Error('network down');
      if (!files.has(pathname)) return { ok: false, status: 404, type: 'basic' };
      return { ok: true, status: 200, type: 'basic', redirected: false, body: pathname, clone() { return this; } };
    },
    clients: { async claim() {}, async matchAll() { return []; } },
  };
  context.self = {
    location: { origin: 'https://wawis.test' },
    addEventListener(type, handler) { listeners[type] = handler; },
    async skipWaiting() { skipWaitingCalled = true; },
    registration: { showNotification() {} },
    clients: { async claim() {}, async matchAll() { return []; } },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  async function dispatch(type) {
    let pending = Promise.resolve();
    listeners[type]({ waitUntil(promise) { pending = promise; } });
    return pending;
  }
  return { stores, fetchLog, dispatch, skipWaiting: () => skipWaitingCalled };
}

(async () => {
  assert.match(source, new RegExp(`const APP_SHELL_CACHE = "${CURRENT.replace(/\./g, '\\.')}";`), 'nazwa cache = wersja aplikacji');
  const manifest = {
    version,
    critical: ['/', '/assets/index-abc.js', '/assets/tabliczki-def.js', '/assets/style-123.css'],
    optional: ['/logo.png', '/wawis-icon-192.png'],
  };
  const files = new Set([...manifest.critical, ...manifest.optional, '/manifest.webmanifest', '/push-safety.js', '/push-context-guard.js']);

  // 1. Instalacja pobiera WSZYSTKIE pliki wersji z serwera (cache: reload), potem skipWaiting.
  {
    const env = createEnvironment({ files, manifest });
    await env.dispatch('install');
    const cached = [...env.stores.get(CURRENT).keys()];
    for (const url of [...manifest.critical, ...manifest.optional]) assert.ok(cached.includes(url), `brak w cache: ${url}`);
    assert.ok(env.fetchLog.filter((entry) => entry.url.startsWith('/assets/')).every((entry) => entry.cache === 'reload'));
    assert.equal(env.skipWaiting(), true);
  }

  // 2. Brak pliku krytycznego (słaby zasięg) → instalacja NIE kończy się, stara wersja zostaje aktywna.
  {
    const env = createEnvironment({ files, manifest, failing: new Set(['/assets/tabliczki-def.js']) });
    await assert.rejects(env.dispatch('install'), /Nie pobrano 1 plików aplikacji/);
    assert.equal(env.skipWaiting(), false, 'niekompletna wersja nie może przejąć telefonu');
    const attempts = env.fetchLog.filter((entry) => entry.url === '/assets/tabliczki-def.js').length;
    assert.equal(attempts, 3, 'trzy próby pobrania pliku przed rezygnacją');
  }

  // 3. Brak obrazka (opcjonalny) nie blokuje aktualizacji.
  {
    const env = createEnvironment({ files, manifest, failing: new Set(['/wawis-icon-192.png']) });
    await env.dispatch('install');
    assert.equal(env.skipWaiting(), true);
  }

  // 4. Brak listy plików (tryb deweloperski) → zachowanie sprzed 13.76, bez blokowania.
  {
    const env = createEnvironment({ files, manifest: null });
    await env.dispatch('install');
    assert.equal(env.skipWaiting(), true);
    assert.ok(env.stores.get(CURRENT).has('/'));
  }

  // 5. Aktywacja: zostaje bieżąca i JEDNA poprzednia wersja; starsze usunięte; cache czytników nietknięty.
  {
    const env = createEnvironment({
      files,
      manifest,
      existingCaches: ['wawis-app-shell-v13.9', 'wawis-app-shell-v13.74', 'wawis-app-shell-v13.75', 'wawis-app-shell-v12.99', 'wawis-nameplate-readers-v1', CURRENT],
    });
    await env.dispatch('activate');
    const keys = [...env.stores.keys()].sort();
    const previous = ['wawis-app-shell-v13.9', 'wawis-app-shell-v13.74', 'wawis-app-shell-v13.75', 'wawis-app-shell-v12.99']
      .filter((key) => key !== CURRENT)
      .sort((a, b) => {
        const v = (k) => { const [, x, y] = /v(\d+)\.(\d+)$/.exec(k); return Number(x) * 1000 + Number(y); };
        return v(b) - v(a);
      })[0];
    assert.deepEqual(keys, [CURRENT, previous, 'wawis-nameplate-readers-v1'].sort());
  }

  console.log('smoke-sw-precache-v1376: OK');
})().catch((error) => { console.error(error); process.exit(1); });
