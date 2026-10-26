import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.77 — ochrona podpisu klienta, poziom 1 (plan po audycie):
// bez zasięgu u klienta podpis nie przepada — zostaje w aplikacji, wraca po ponownym otwarciu protokołu,
// a po powrocie internetu protokół zapisuje się sam (przy otwartym oknie).
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const ONLINE_FLAG = 'klima-e2e-network-state';
const STORE_KEY = 'klima-mock-supabase-store-v3';
test.use(iphone14);

async function setOnline(page, online) {
  await page.evaluate(({ flag, value }) => {
    window.localStorage.setItem(flag, value ? 'online' : 'offline');
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  }, { flag: ONLINE_FLAG, value: online });
}

async function openProtocol(page, dialogs = [], step = '') {
  const protocolButton = page.locator('.mobileInlineJobDetails .workerActionProtocolV1295');
  await expect(protocolButton).toBeEnabled({ timeout: 20_000 });
  await protocolButton.click();
  try {
    await expect(page.locator('.protocolWizardModal')).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    const screen = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
    throw new Error(`${error.message}\nKrok: ${step}\nOkna dialogowe: ${dialogs.join(' | ')}\nEkran: ${screen}`);
  }
}

test('@mobile 13.77: podpis bez internetu jest zachowany, wraca po ponownym otwarciu i zapisuje się po powrocie zasięgu', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
  page.on('pageerror', (error) => dialogs.push(`BŁĄD STRONY: ${String(error?.message || error).slice(0, 300)}`));
  await page.addInitScript(({ flag }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() { return window.localStorage.getItem(flag) !== 'offline'; },
    });
  }, { flag: ONLINE_FLAG });
  await resetMockSupabase(page);
  await page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    for (const unitRef of ['jz', 'jw-1']) {
      store.photos.push({
        id: 'mock-1377-plate-' + unitRef, job_id: 'mock-job-002',
        photo_kind: 'nameplate', device_index: 1, unit_ref: unitRef,
        storage_path: 'mock-job-002/nameplates/device-1_' + unitRef + '_1377.jpg',
        ocr_status: 'approved', ocr_checked_at: '2026-10-26T13:00:00.000Z',
        upload_status: 'uploaded', created_at: '2026-10-26T13:00:00.000Z',
      });
    }
    localStorage.setItem(key, JSON.stringify(store));
  }, STORE_KEY);
  await loginWithoutReset(page, WORKER);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).click();
  await openProtocol(page, dialogs, 'pierwsze otwarcie');

  const payment = page.locator('.protocolPaymentForm');
  await payment.locator('select').selectOption('cash');
  await payment.locator('input[inputmode="decimal"]').fill('1000');

  // U klienta nie ma zasięgu: komunikat przed podpisem.
  await setOnline(page, false);
  await expect(page.getByTestId('protocol-offline-notice')).toBeVisible();
  await page.getByRole('button', { name: 'Podpis klienta', exact: true }).click();
  const canvas = page.locator('#protocol-test-signature');
  await expect(canvas).toBeVisible();
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + 25, rect.y + 55);
  await page.mouse.down();
  await page.mouse.move(rect.x + 90, rect.y + 88, { steps: 5 });
  await page.mouse.move(rect.x + 150, rect.y + 45, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Zatwierdź podpis', exact: true }).click();

  // „Zapisz” bez internetu: nie próbuje zapisu, mówi że podpis jest zachowany.
  await page.getByRole('button', { name: 'Zapisz protokół' }).click();
  await expect(page.locator('.protocolTestMessage[role="status"]').last()).toContainText('Podpis jest zachowany');
  const protocolsBefore = await page.evaluate((key) => (JSON.parse(localStorage.getItem(key) || '{}').job_protocols || []).length, STORE_KEY);

  // Zamknięcie okna z niezapisanym podpisem wymaga potwierdzenia.
  await page.locator('.mobileDeviceWizardClose').click();
  await expect.poll(() => dialogs.some((text) => text.includes('Podpis klienta zostanie zachowany'))).toBe(true);
  await expect(page.locator('.protocolWizardModal')).toHaveCount(0);

  // Ponowne otwarcie (nadal bez internetu): podpis wraca, nie trzeba prosić klienta drugi raz.
  await openProtocol(page, dialogs, 'ponowne otwarcie bez internetu');
  await expect(page.getByText(/Przywrócono niezapisany podpis klienta/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Zapisz protokół' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Zmień podpis' })).toBeVisible();

  // Zapis czeka na zasięg; po powrocie internetu zapisuje się sam.
  await page.getByRole('button', { name: 'Zapisz protokół' }).click();
  await expect(page.locator('.protocolTestMessage[role="status"]').last()).toContainText('zapisze się automatycznie');
  // Atrapa Supabase nie obsługuje pełnego zapisu PDF (jak w mobile-protocol-test) — rekord serwera jak po zapisie.
  await page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    store.job_protocols = [{
      id: 'mock-1377-protocol', job_id: 'mock-job-002',
      storage_path: 'mock-job-002/protocol-1377.pdf', file_name: 'protocol-1377.pdf', file_size_bytes: 65578,
      signed_at: '2026-10-26T13:10:00.000Z', created_at: '2026-10-26T13:10:00.000Z', created_by: 'mock-worker-1', note: '',
    }];
    const serialized = JSON.stringify(store);
    localStorage.setItem(key, serialized);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: serialized }));
  }, STORE_KEY);
  expect(protocolsBefore).toBe(0);
  await setOnline(page, true);
  try {
    await expect(page.getByText(/Protokół podpisany i zapisany|Protokół został zapisany/).first()).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    const messages = await page.locator('.protocolTestMessage').allInnerTexts().catch(() => []);
    throw new Error(`${error.message}\nKomunikaty protokołu: ${messages.join(' | ')}\nZdarzenia: ${dialogs.join(' | ')}`);
  }
});
