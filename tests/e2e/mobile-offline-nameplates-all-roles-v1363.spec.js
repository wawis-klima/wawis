import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.63 — urządzenia i tabliczki zapisuje bez internetu każdy, także administrator.
// 13.62 dla administratora pokazywało „Pełna edycja montażu wymaga połączenia z internetem”,
// a zmiany offline administratora nie były nigdy synchronizowane (performOfflineJobSync pomijał admina).
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const ONLINE_FLAG = 'klima-e2e-network-state';

test.use(iphone14);

async function installControllableNetworkState(page) {
  await page.addInitScript(({ flag }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() { return window.localStorage.getItem(flag) !== 'offline'; },
    });
  }, { flag: ONLINE_FLAG });
}

async function setLogicalOnlineState(page, online) {
  await page.evaluate(({ flag, value }) => {
    window.localStorage.setItem(flag, value ? 'online' : 'offline');
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  }, { flag: ONLINE_FLAG, value: online });
}

async function countOfflineDeviceOperations(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('wawis-mobile-offline-data');
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve(0);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('job-operations')) { db.close(); resolve(0); return; }
      const all = db.transaction('job-operations', 'readonly').objectStore('job-operations').getAll();
      all.onsuccess = () => { db.close(); resolve(all.result.filter((op) => op.type === 'device').length); };
      all.onerror = () => { db.close(); resolve(-1); };
    };
  }));
}

for (const [roleName, credentials, buttonName] of [['administrator', ADMIN, 'Urządzenia'], ['pracownik', WORKER, 'Tabliczki']]) {
  test(`@mobile ${roleName} zapisuje urządzenia i tabliczki bez internetu, a po powrocie internetu zmiana wysyła się sama`, async ({ page }) => {
    test.setTimeout(90_000);
    await installControllableNetworkState(page);
    await resetMockSupabase(page);
    await loginWithoutReset(page, credentials);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();

    const dialogs = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });

    await setLogicalOnlineState(page, false);
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    const saveButton = page.locator('.mobileDeviceWizardFooter .btn.primary');
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    if (await saveButton.isVisible() && /mimo ostrzeżenia/.test(await saveButton.innerText())) await saveButton.click();

    await expect.poll(() => dialogs.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(dialogs.join(' | ')).not.toContain('Pełna edycja montażu wymaga połączenia z internetem');
    expect(dialogs.join(' | ')).toContain('Dane urządzenia zapisano na telefonie');
    await expect(page.locator('.mobileDeviceWizardModal')).toHaveCount(0);
    await expect.poll(() => countOfflineDeviceOperations(page)).toBe(1);

    // Powrót internetu bez wylogowania: zmiana zapisana offline jest wysyłana automatycznie.
    await setLogicalOnlineState(page, true);
    await expect.poll(() => countOfflineDeviceOperations(page), { timeout: 30_000 }).toBe(0);
    await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible();
  });
}
