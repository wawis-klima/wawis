import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.76 — pełne pobranie wersji przez service worker.
// Scenariusz z audytu: po aktualizacji pracownik jedzie do klienta i BEZ zasięgu otwiera ekran, którego jeszcze
// nie otwierał z internetem („Tabliczki”). Dawniej ten ekran (osobny plik JS) nie był zapisany w telefonie.
// Prawdziwe wyłączenie sieci (context.setOffline) — tylko Chromium; w WebKit emulacja offline omija service worker.
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use({ ...iphone14, serviceWorkers: 'allow' });

// Bez tagu @mobile: lista plików wersji istnieje tylko w BUDOWIE produkcyjnej (vite build) — ten test uruchamia
// built-photo-queue-e2e (playwright.built.config.js), nie zestaw @mobile na serwerze deweloperskim.
test('13.76: po instalacji cała wersja jest w telefonie — bez internetu start aplikacji i nieotwierany wcześniej ekran „Tabliczki”', async ({ page, context }) => {
  test.setTimeout(180_000);
  await resetMockSupabase(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 60_000 });

  // Lista plików wersji istnieje tylko w budowie produkcyjnej. Serwer deweloperski (zestawy @mobile/desktop
  // w targeted-checks) zwraca w tym miejscu stronę HTML — wtedy test jest pomijany (uruchamia go built-photo-queue-e2e).
  const manifest = await page.evaluate(async () => {
    try { return await (await fetch('/precache-manifest.json', { cache: 'no-store' })).json(); } catch { return null; }
  });
  test.skip(!manifest, 'Lista plików wersji (precache-manifest.json) jest tylko w budowie produkcyjnej.');

  // Cache bieżącej wersji: wszystkie pliki krytyczne zapisane PRZED pracą bez sieci.
  const version = await page.evaluate(async () => (await (await fetch('/app-version.json', { cache: 'no-store' })).json()).version);
  expect(manifest.version).toBe(version);
  expect(manifest.critical).toContain('/');
  expect(manifest.critical.filter((url) => url.endsWith('.js')).length).toBeGreaterThan(5);
  expect(manifest.totalBytes, 'pełna wersja musi być rozsądnie mała do pobrania na telefonie').toBeLessThan(15 * 1024 * 1024);
  await expect.poll(async () => page.evaluate(async ({ cacheName, urls }) => {
    if (!(await caches.has(cacheName))) return ['brak cache'];
    const cache = await caches.open(cacheName);
    const missing = [];
    for (const url of urls) if (!(await cache.match(url))) missing.push(url);
    return missing;
  }, { cacheName: `wawis-app-shell-v${version}`, urls: manifest.critical }), { timeout: 60_000, intervals: [1000] }).toEqual([]);

  await loginWithoutReset(page, WORKER);
  await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible({ timeout: 30_000 });

  // Dane montaży muszą być już w telefonie (kopia listy zapisuje się w tle po pierwszym pobraniu z internetem) —
  // inaczej start bez sieci pokazałby pustą listę niezależnie od plików aplikacji.
  await expect.poll(async () => page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('wawis-mobile-offline-data');
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('app-snapshots')) { db.close(); resolve(0); return; }
      const count = db.transaction('app-snapshots', 'readonly').objectStore('app-snapshots').count();
      count.onsuccess = () => { db.close(); resolve(count.result); };
      count.onerror = () => { db.close(); resolve(0); };
    };
    request.onerror = () => resolve(0);
  })), { timeout: 30_000, intervals: [500] }).toBeGreaterThan(0);

  // Bez sieci: ponowne uruchomienie aplikacji i pierwszy raz otwierany ekran „Tabliczki”.
  const failedRequests = [];
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(page.url()).origin) failedRequests.push(`${url.pathname} ${request.failure()?.errorText || ''}`);
  });
  await context.setOffline(true);
  await page.reload();
  try {
    await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    const screen = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
    throw new Error(`${error.message}\nEkran bez sieci: ${screen}\nNieudane pliki: ${failedRequests.join('; ')}`);
  }
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  await expect(page.locator('.mobileDeviceWizardFooter .btn.primary'), `Pliki aplikacji niedostępne bez sieci: ${failedRequests.join('; ')}`)
    .toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Nie udało się pobrać modułu aplikacji')).toHaveCount(0);
  const failedAppFiles = failedRequests.filter((line) => /\.(?:js|css)\b|^\/ /.test(line));
  expect(failedAppFiles).toEqual([]);
  await context.setOffline(false);
});
