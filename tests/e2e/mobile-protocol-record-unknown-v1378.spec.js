import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.78 — test iPhone 26.10.2026 (13.77, tryb samolotowy): montaż otwarty BEZ internetu pokazywał
// „Sprawdź” zamiast „Protokół” — nie dało się wypełnić protokołu ani złożyć podpisu. Teraz protokół otwiera się
// bez sprawdzenia, a przed zapisem (z internetem) okno sprawdza, czy montaż nie ma już protokołu.
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

test('@mobile 13.78: montaż otwarty bez internetu — protokół i podpis dostępne; przed zapisem kontrola istniejącego protokołu', async ({ page }) => {
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
        id: 'mock-1378-plate-' + unitRef, job_id: 'mock-job-002',
        photo_kind: 'nameplate', device_index: 1, unit_ref: unitRef,
        storage_path: 'mock-job-002/nameplates/device-1_' + unitRef + '_1378.jpg',
        ocr_status: 'approved', ocr_checked_at: '2026-10-26T16:00:00.000Z',
        upload_status: 'uploaded', created_at: '2026-10-26T16:00:00.000Z',
      });
    }
    localStorage.setItem(key, JSON.stringify(store));
  }, STORE_KEY);
  await loginWithoutReset(page, WORKER);
  await page.locator('.statusActionButton[title="W trakcie"]').click();

  // Tryb samolotowy PRZED otwarciem montażu (jak na iPhonie właściciela).
  await setOnline(page, false);
  await page.getByText('Klient Testowy B', { exact: true }).click();
  await expect(page.getByRole('button', { name: /^Sprawdź$/ })).toHaveCount(0);
  await openProtocol(page, dialogs, 'otwarcie bez internetu (bez sprawdzenia protokołu)');
  await expect(page.getByTestId('protocol-record-unknown')).toBeVisible();
  await expect(page.getByTestId('protocol-offline-notice')).toBeVisible();

  const payment = page.locator('.protocolPaymentForm');
  await payment.locator('select').selectOption('cash');
  await payment.locator('input[inputmode="decimal"]').fill('1000');
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
  await page.getByRole('button', { name: 'Zapisz protokół' }).click();
  await expect(page.locator('.protocolTestMessage[role="status"]').last()).toContainText('Podpis jest zachowany');

  // W międzyczasie ktoś inny zapisał protokół tego montażu → po powrocie internetu NIE udajemy zapisu.
  await page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    store.job_protocols = [{
      id: 'mock-1378-existing', job_id: 'mock-job-002',
      storage_path: 'mock-job-002/protocol-1378-existing.pdf', file_name: 'protocol-1378.pdf', file_size_bytes: 65578,
      signed_at: '2026-10-26T15:00:00.000Z', created_at: '2026-10-26T15:00:00.000Z', created_by: 'mock-admin-1', note: '',
    }];
    const serialized = JSON.stringify(store);
    localStorage.setItem(key, serialized);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: serialized }));
  }, STORE_KEY);
  await setOnline(page, true);
  try {
    await expect(page.getByText(/ma już zapisany protokół/)).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    const messages = await page.locator('.protocolTestMessage').allInnerTexts().catch(() => []);
    throw new Error(`${error.message}\nKomunikaty protokołu: ${messages.join(' | ')}\nZdarzenia: ${dialogs.join(' | ')}`);
  }
  await expect(page.getByText(/Protokół został zapisany/)).toHaveCount(0);
  // Okno nadal otwarte z podpisem (nic nie przepadło po cichu).
  await expect(page.getByRole('button', { name: 'Zmień podpis' })).toBeVisible();
});
