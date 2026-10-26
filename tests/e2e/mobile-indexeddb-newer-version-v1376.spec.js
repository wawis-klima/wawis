import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.76 — lokalne bazy otwierane bez numeru wersji (wzór kolejki zdjęć z 13.62).
// Scenariusz: telefon ma bazę z NOWSZEJ wersji aplikacji (np. po powrocie do starszej wersji). Dawniej
// indexedDB.open(nazwa, 2) kończył się VersionError i zapis komentarza bez internetu nie działał.
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const ONLINE_FLAG = 'klima-e2e-network-state';
test.use(iphone14);

async function createNewerDatabase(page, name, version, stores) {
  await page.evaluate(({ name, version, stores }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      for (const [storeName, keyPath, indexes] of stores) {
        const store = request.result.objectStoreNames.contains(storeName)
          ? request.transaction.objectStore(storeName)
          : request.result.createObjectStore(storeName, { keyPath });
        for (const index of indexes) if (!store.indexNames.contains(index)) store.createIndex(index, index, { unique: false });
      }
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error || new Error('open failed'));
  }), { name, version, stores });
}

async function databaseVersion(page, name) {
  return page.evaluate((dbName) => new Promise((resolve) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = () => { const version = request.result.version; request.result.close(); resolve(version); };
    request.onerror = () => resolve(-1);
  }), name);
}

async function countOperations(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('wawis-mobile-offline-data');
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('job-operations')) { db.close(); resolve(0); return; }
      const all = db.transaction('job-operations', 'readonly').objectStore('job-operations').getAll();
      all.onsuccess = () => { db.close(); resolve(all.result.length); };
      all.onerror = () => { db.close(); resolve(-1); };
    };
    request.onerror = () => resolve(-1);
  }));
}

test('@mobile 13.76: baza z nowszej wersji aplikacji nie blokuje pracy offline (bez VersionError, bez obniżania wersji)', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  page.on('console', (message) => { if (/VersionError/i.test(message.text())) pageErrors.push(message.text()); });
  await page.addInitScript(({ flag }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() { return window.localStorage.getItem(flag) !== 'offline'; },
    });
  }, { flag: ONLINE_FLAG });
  await resetMockSupabase(page);

  // Bazy „z przyszłości”: wersje 7 i 5 (aplikacja wymaga 2 i 1), z wymaganymi magazynami.
  // Tworzone na stronie bez aplikacji (ten sam adres), żeby żadne otwarte połączenie aplikacji ich nie blokowało.
  await page.goto('/app-version.json');
  await createNewerDatabase(page, 'wawis-mobile-offline-data', 7, [
    ['app-snapshots', 'user_id', []],
    ['job-operations', 'id', ['user_id', 'job_id', 'created_at', 'status', 'next_attempt_at']],
  ]);
  await createNewerDatabase(page, 'wawis-app-read-cache', 5, [['session-snapshots', 'user_id', []]]);

  await loginWithoutReset(page, WORKER);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).first().click();

  // Bez internetu: komentarz trafia do pamięci telefonu (baza v7 otwarta bez błędu).
  await page.evaluate((flag) => {
    window.localStorage.setItem(flag, 'offline');
    window.dispatchEvent(new Event('offline'));
  }, ONLINE_FLAG);
  const before = await countOperations(page);
  const commentBox = page.getByPlaceholder('Napisz komentarz...');
  await commentBox.fill('Komentarz bez internetu 13.76');
  await page.getByRole('button', { name: 'Dodaj komentarz' }).click();
  await expect.poll(() => countOperations(page), { timeout: 20_000 }).toBe(before + 1);

  // Numer wersji baz nie został obniżony ani zmieniony.
  expect(await databaseVersion(page, 'wawis-mobile-offline-data')).toBe(7);
  expect(await databaseVersion(page, 'wawis-app-read-cache')).toBe(5);
  expect(pageErrors.filter((text) => /VersionError/i.test(text))).toEqual([]);
});
