import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 14.24 — naklejka QR wymagana do zakończenia montażu przez pracownika (jak tabliczki).
// Montaż „Klient Testowy B” z kompletem tabliczek, urządzenie bez naklejki. Dane wyłącznie fikcyjne (mock).
const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function prepareJobWithoutSticker(page) {
  await resetMockSupabase(page);
  await page.evaluate(() => {
    const key = 'klima-mock-supabase-store-v3';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    for (const unitRef of ['jz', 'jw-1']) {
      store.photos.push({
        id: 'mock-qr1424-plate-' + unitRef, job_id: 'mock-job-002',
        photo_kind: 'nameplate', device_index: 1, unit_ref: unitRef,
        storage_path: 'mock-job-002/nameplates/device-1_' + unitRef + '_qr1424.jpg',
        ocr_status: 'approved', ocr_checked_at: '2026-11-06T06:00:00.000Z',
        upload_status: 'uploaded', created_at: '2026-11-06T06:00:00.000Z',
      });
    }
    store.qr_stickers = ['UYE8EYCQ', 'BNKJXZDY', 'CXFBEHEP'].map((code) => ({ code, device_id: null }));
    localStorage.setItem(key, JSON.stringify(store));
  });
}

async function openJobB(page) {
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).click();
}

test.describe('@mobile 14.24: naklejka QR do zakończenia montażu', () => {
  test('pracownik: bez naklejki „Protokół” zablokowany (Krok 2/3), po przypisaniu odblokowany', async ({ page }) => {
    await prepareJobWithoutSticker(page);
    await loginWithoutReset(page, WORKER);
    await openJobB(page);
    const protocolButton = page.locator('.mobileInlineJobDetails .workerActionProtocolV1295');
    const step = page.getByTestId('finish-qr-step-missing');
    await expect(step).toContainText('Krok 2/3: przypisz naklejkę QR (urządzenie 1)');
    await expect(protocolButton).toBeDisabled();
    await expect(protocolButton).toHaveAttribute('title', /przypisz naklejki QR/);

    await page.getByRole('button', { name: 'Rozwiń Urządzenie 1' }).click();
    const row = page.getByTestId('job-device-qr-sticker').first();
    await row.getByRole('button', { name: 'Przypisz naklejkę QR' }).click();
    const dialog = page.locator('.qrScannerModal');
    await dialog.getByLabel('Albo wpisz numer spod kodu').fill('UYE8-EYCQ');
    await dialog.getByRole('button', { name: 'Zatwierdź' }).click();
    await expect(row).toContainText('UYE8-EYCQ');
    await expect(step).toHaveCount(0);
    await expect(protocolButton).toBeEnabled();
  });

  test('administrator: brak naklejki tylko informuje, nie blokuje', async ({ page }) => {
    await prepareJobWithoutSticker(page);
    await loginWithoutReset(page, ADMIN);
    await openJobB(page);
    await expect(page.getByTestId('finish-qr-admin-note')).toContainText('Brak naklejki QR: urządzenie 1');
    await expect(page.getByTestId('finish-qr-step-missing')).toHaveCount(0);
  });
});
