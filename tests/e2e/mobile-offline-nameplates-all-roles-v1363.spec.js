import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.66 (decyzja właściciela 25.10.2026): urządzeń i tabliczek nie zapisuje się bez internetu — u nikogo.
// Bez internetu: komunikat „zrób zdjęcia aparatem i dodaj później”, formularz zostaje otwarty, nic nie trafia
// do pamięci aplikacji. Po powrocie internetu ten sam formularz zapisuje się normalnie.
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

// 13.68: bez internetu okno „Brak internetu” z wyborem „Zamknij okno” / „Zostań w formularzu” (nie blokuje aplikacji).
for (const [roleName, credentials, buttonName, choice] of [['administrator', ADMIN, 'Urządzenia', 'stay'], ['pracownik', WORKER, 'Tabliczki', 'close']]) {
  test(`@mobile ${roleName}: bez internetu tabliczki nie są zapisywane (okno z wyborem), ${choice === 'stay' ? 'po powrocie internetu zapis działa' : '„Zamknij okno” wraca do aplikacji'}`, async ({ page }) => {
    test.setTimeout(90_000);
    await installControllableNetworkState(page);
    await resetMockSupabase(page);
    await loginWithoutReset(page, credentials);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();

    const dialogs = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });

    await page.getByRole('button', { name: buttonName, exact: true }).click();
    const saveButton = page.locator('.mobileDeviceWizardFooter .btn.primary');
    await expect(saveButton).toBeVisible();

    await setLogicalOnlineState(page, false);
    await saveButton.click();
    const confirmWarning = page.getByRole('button', { name: 'Zapisz mimo ostrzeżenia', exact: true });
    const offlinePrompt = page.locator('.confirmDeleteModal', { hasText: 'Brak internetu' });
    await expect.poll(async () => await offlinePrompt.isVisible().catch(() => false) || await confirmWarning.isVisible().catch(() => false), { timeout: 20_000 }).toBe(true);
    if (!(await offlinePrompt.isVisible().catch(() => false))) await confirmWarning.click();
    await expect(offlinePrompt).toBeVisible();
    await expect(offlinePrompt).toContainText('Zrób zdjęcia tabliczek aparatem telefonu');
    expect(dialogs).toEqual([]);
    expect(await countOfflineDeviceOperations(page)).toBe(0);

    if (choice === 'close') {
      await offlinePrompt.getByRole('button', { name: 'Zamknij okno', exact: true }).click();
      await expect(page.locator('.mobileDeviceWizardModal')).toHaveCount(0);
      await expect(offlinePrompt).toHaveCount(0);
      await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible();
      expect(await countOfflineDeviceOperations(page)).toBe(0);
      return;
    }

    await offlinePrompt.getByRole('button', { name: 'Zostań w formularzu', exact: true }).click();
    await expect(offlinePrompt).toHaveCount(0);
    await expect(page.locator('.mobileDeviceWizardModal')).toBeVisible();

    // Internet wrócił: ten sam formularz zapisuje się normalnie.
    await setLogicalOnlineState(page, true);
    await saveButton.click();
    await expect.poll(async () => dialogs.length > 0 || await confirmWarning.isVisible().catch(() => false), { timeout: 20_000 }).toBe(true);
    if (!dialogs.length && await confirmWarning.isVisible().catch(() => false)) await confirmWarning.click();
    await expect(page.locator('.mobileDeviceWizardModal')).toHaveCount(0, { timeout: 30_000 });
    expect(dialogs.join(' | ')).not.toContain('Brak internetu');
    expect(await countOfflineDeviceOperations(page)).toBe(0);
  });
}
