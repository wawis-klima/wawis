// WAWIS 14.99 (decyzja właściciela 24.11.2026): naklejki QR bez internetu — zapis na telefonie,
// przypisanie po powrocie zasięgu; naklejka zajęta w międzyczasie = konflikt, nic nie przepisujemy.
import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);
const ONLINE_FLAG = 'klima-e2e-network-state';
const wizard = (page) => page.locator('.mobileDeviceWizardOverlay .mobileDeviceWizard');

async function installControllableNetworkState(page) {
  await page.addInitScript(({ flag }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() { return window.localStorage.getItem(flag) !== 'offline'; },
    });
  }, { flag: ONLINE_FLAG });
}

async function setOnline(page, isOnline) {
  await page.evaluate(({ flag, online }) => {
    window.localStorage.setItem(flag, online ? 'online' : 'offline');
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  }, { flag: ONLINE_FLAG, online: isOnline });
}

const stickerDevice = (page, code) => page.evaluate((value) => (
  window.__KLIMA_MOCK_SUPABASE__.getStore().qr_stickers?.find((item) => item.code === value)?.device_id || null
), code);

async function start(page) {
  await installControllableNetworkState(page);
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);
  await page.getByText('Klient Testowy Multi-Split', { exact: true }).first().click();
}

async function assignFromCardOffline(page, code) {
  await page.getByRole('button', { name: 'Rozwiń Urządzenie 1' }).click();
  const row = page.getByTestId('job-device-qr-sticker').first();
  await expect(row).toContainText('Naklejka QR: brak', { timeout: 20_000 });
  await setOnline(page, false);
  await row.getByRole('button', { name: 'Przypisz naklejkę QR' }).click();
  const dialog = page.locator('.qrScannerModal');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Albo wpisz numer spod kodu').fill(code);
  await dialog.getByRole('button', { name: 'Zatwierdź' }).click();
  await expect(dialog).toHaveCount(0);
  return row;
}

test('@mobile 14.99 pracownik: naklejka z karty urządzenia bez internetu — przypisanie po powrocie zasięgu', async ({ page }) => {
  await start(page);
  const row = await assignFromCardOffline(page, 'uye8-eycq');
  await expect(row).toContainText('Brak internetu — naklejkę UYE8-EYCQ zapisano na telefonie');
  await expect(row).toContainText('Naklejka QR: UYE8-EYCQ');
  await expect(page.getByTestId('offline-banner')).toContainText('1 zmiana czeka na wysłanie');
  expect(await stickerDevice(page, 'UYE8EYCQ')).toBeNull();

  await setOnline(page, true);
  await expect.poll(() => stickerDevice(page, 'UYE8EYCQ'), { timeout: 20_000 }).not.toBeNull();
  await expect(row).toContainText('Naklejka QR: UYE8-EYCQ');
});

test('@mobile 14.99 pracownik: naklejka zajęta w międzyczasie — konflikt, nic nie przepisano', async ({ page }) => {
  await start(page);
  await assignFromCardOffline(page, 'uye8-eycq');
  // W tym czasie ta sama naklejka trafia na inne urządzenie (np. u innego pracownika).
  const otherDevice = await page.evaluate(() => {
    let id = null;
    window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
      const device = store.devices.find((item) => item.id === 'mock-device-001') || store.devices[0];
      id = device.id;
      store.qr_stickers = (store.qr_stickers || []).filter((item) => item.device_id !== id);
      const sticker = store.qr_stickers.find((item) => item.code === 'UYE8EYCQ');
      if (sticker) sticker.device_id = id; else store.qr_stickers.push({ code: 'UYE8EYCQ', device_id: id });
    });
    return id;
  });
  await setOnline(page, true);
  // Karta montażu: ogólny komunikat; szczegół („…jest już przypisana…”) zapisany przy wpisie w kolejce.
  await expect(page.getByText(/Konflikt synchronizacji/).first()).toBeVisible({ timeout: 20_000 });
  const conflict = await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('wawis-mobile-offline-data');
    request.onsuccess = () => {
      const db = request.result;
      const all = db.transaction('job-operations', 'readonly').objectStore('job-operations').getAll();
      all.onsuccess = () => { resolve(all.result.filter((item) => item.type === 'qr').map((item) => ({ status: item.status, error: item.error }))); db.close(); };
    };
  }));
  expect(conflict).toHaveLength(1);
  expect(conflict[0].status).toBe('conflict');
  expect(conflict[0].error).toContain('jest już przypisana');
  expect(await stickerDevice(page, 'UYE8EYCQ')).toBe(otherDevice);
});

test('@mobile 14.99 pracownik: naklejka w kreatorze urządzeń bez internetu — zapis na telefonie i przypisanie po powrocie', async ({ page }) => {
  await start(page);
  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
  await page.getByRole('button', { name: /^(Tabliczki|Urządzenia)$/ }).first().click();
  const w = wizard(page);
  await expect(w.getByRole('heading', { name: 'Urządzenia', exact: true })).toBeVisible({ timeout: 20_000 });
  await w.locator('.mobileDeviceOverviewOpen').first().click();
  await setOnline(page, false);
  const card = w.getByTestId('wizard-qr-sticker');
  await card.getByRole('button', { name: 'Zeskanuj' }).click();
  const scanner = page.locator('.qrScannerModal');
  await scanner.getByLabel('Albo wpisz numer spod kodu').fill('bnkj-xzdy');
  await scanner.getByRole('button', { name: 'Zatwierdź' }).click();
  await expect(scanner).toHaveCount(0);
  await expect(card).toContainText('BNKJ-XZDY');
  await w.getByRole('button', { name: 'Dalej do podsumowania' }).click();
  await w.locator('.mobileDeviceWizardFooter .btn.primary').click();
  const confirmWarning = page.getByRole('button', { name: 'Zapisz mimo ostrzeżenia', exact: true });
  if (await confirmWarning.isVisible().catch(() => false)) await confirmWarning.click();
  await expect.poll(() => dialogs.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(dialogs.join(' | ')).toContain('naklejki QR zapisano na telefonie');
  await expect(wizard(page)).toHaveCount(0);
  expect(await stickerDevice(page, 'BNKJXZDY')).toBeNull();

  await setOnline(page, true);
  await expect.poll(() => stickerDevice(page, 'BNKJXZDY'), { timeout: 30_000 }).not.toBeNull();
});
