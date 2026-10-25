import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.62 — „Napraw kolejkę zdjęć” w Centrum synchronizacji pracownika (pełna aplikacja, mock Supabase).
// Czyszczenie tylko po wyraźnym potwierdzeniu; anulowanie niczego nie usuwa; sesja i dane mock pozostają.
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const ONLINE_FLAG = 'klima-e2e-network-state';
const MOCK_STORE_KEY = 'klima-mock-supabase-store-v3';
const tinyPng = {
  name: 'naprawa-kolejki-e2e.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==', 'base64'),
};

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

async function countQueuedPhotos(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('wawis-mobile-photo-queue');
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve(0);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('queued-photos')) { db.close(); resolve(0); return; }
      const count = db.transaction('queued-photos', 'readonly').objectStore('queued-photos').count();
      count.onsuccess = () => { db.close(); resolve(count.result); };
      count.onerror = () => { db.close(); resolve(-1); };
    };
  }));
}

async function addOfflinePhoto(page) {
  await installControllableNetworkState(page);
  await resetMockSupabase(page);
  await setLogicalOnlineState(page, false);
  await loginWithoutReset(page, WORKER);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).click();
  await page.locator('.photoUploadBtnGallery input[type="file"]').setInputFiles(tinyPng);
  await expect(page.getByText('Zapisano na telefonie', { exact: true })).toBeVisible();
  await expect.poll(() => countQueuedPhotos(page)).toBe(1);
}

test.describe('@mobile Napraw kolejkę zdjęć 13.62', () => {
  test('@mobile anulowanie nie usuwa niewysłanego zdjęcia', async ({ page }) => {
    await addOfflinePhoto(page);
    const dialogs = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.getByRole('button', { name: 'Otwórz Centrum synchronizacji' }).click();
    await page.getByTestId('photo-queue-repair').click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toContain('1 niewysłane zdjęcie');
    expect(dialogs[0]).toContain('USUNIE');
    await expect.poll(() => countQueuedPhotos(page)).toBe(1);
  });

  test('@mobile potwierdzona naprawa czyści tylko kolejkę zdjęć i zachowuje sesję', async ({ page }) => {
    await addOfflinePhoto(page);
    const mockStoreBefore = await page.evaluate((key) => window.localStorage.getItem(key), MOCK_STORE_KEY);
    const dialogs = [];
    page.on('dialog', async (dialog) => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); });
    await page.getByRole('button', { name: 'Otwórz Centrum synchronizacji' }).click();
    await page.getByTestId('photo-queue-repair').click();
    await expect.poll(() => dialogs.filter((d) => d.type === 'alert').length, { timeout: 20_000 }).toBe(1);
    expect(dialogs.filter((d) => d.type === 'confirm')).toHaveLength(2);
    expect(dialogs.find((d) => d.type === 'alert').message).toContain('wyczyszczona');
    await page.waitForLoadState('load');
    await expect.poll(() => countQueuedPhotos(page)).toBe(0);
    // Sesja i dane aplikacji nie są usuwane przez naprawę kolejki.
    await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible({ timeout: 20_000 });
    const mockStoreAfter = await page.evaluate((key) => window.localStorage.getItem(key), MOCK_STORE_KEY);
    expect(Boolean(mockStoreAfter)).toBe(true);
    expect(JSON.parse(mockStoreAfter).jobs?.length).toBe(JSON.parse(mockStoreBefore).jobs?.length);
  });
});
