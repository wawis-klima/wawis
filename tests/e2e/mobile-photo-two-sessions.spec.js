import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const tinyPng = {
  name: 'montaz-multi-e2e.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==', 'base64'),
};
test.use(iphone14);

test.describe('@mobile iPhone — zdjęcia na dwóch sesjach', () => {
  test('pracownik dodaje zdjęcie, administrator je widzi, a usunięcie synchronizuje obie sesje', async ({ browser }) => {
    const context = await browser.newContext(iphone14);
    const workerPage = await context.newPage();
    const adminPage = await context.newPage();

    await resetMockSupabase(workerPage);
    await loginWithoutReset(workerPage, WORKER);
    await loginWithoutReset(adminPage, ADMIN);

    for (const page of [workerPage, adminPage]) {
      await page.locator('.statusActionButton[title="W trakcie"]').click();
      await page.getByText('Klient Testowy B', { exact: true }).click();
      await expect(page.getByText('Galeria', { exact: true })).toBeVisible();
    }

    await expect(workerPage.getByRole('status', { name: /Połączenie: Dobre/ })).toContainText('Wszystko wysłane');
    await workerPage.locator('.photoUploadBtnGallery input[type="file"]').setInputFiles({
      name: 'montaz-e2e.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==', 'base64'),
    });

    await expect(workerPage.locator('.thumbCard')).toHaveCount(1);
    await expect(workerPage.getByRole('status', { name: /Połączenie:/ })).toContainText('Wszystko wysłane');
    await expect(adminPage.locator('.thumbCard')).toHaveCount(1, { timeout: 15_000 });

    await workerPage.locator('.thumbCard').getByRole('button', { name: 'Usuń' }).click();
    await expect(workerPage.getByRole('heading', { name: 'Usunąć zdjęcie?' })).toBeVisible();
    await workerPage.getByRole('dialog').getByRole('button', { name: 'Usuń', exact: true }).click();

    await expect(workerPage.locator('.thumbCard')).toHaveCount(0);
    await expect(adminPage.locator('.thumbCard')).toHaveCount(0, { timeout: 15_000 });
    await context.close();
  });

  test('pracownik widzi testowy Multi-Split 3×JW i dodaje do niego zdjęcie', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();

    await expect(page.getByText('Urządzenia i tabliczki', { exact: true })).toBeVisible();
    await expect(page.getByText('Jednostka zewnętrzna JZ', { exact: true })).toBeVisible();
    await expect(page.getByText('Rotenso Multi-Split JZ (TEST)', { exact: true })).toBeVisible();
    await expect(page.getByText('Jednostka wewnętrzna JW 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Jednostka wewnętrzna JW 3', { exact: true })).toBeVisible();
    await expect(page.getByText('TEST-MULTI-JW-1', { exact: true })).toBeVisible();
    await expect(page.getByText('TEST-MULTI-JW-3', { exact: true })).toBeVisible();
    await page.locator('.workerSerialNumbersBtn').click();
    await expect(page.getByText('Jednostki wewnętrzne multi-split', { exact: true })).toBeVisible();
    await expect(page.locator('.jobIndoorUnitField')).toHaveCount(3);
    await expect(page.getByLabel('Model JW 1 (opcjonalnie)')).toHaveValue('Rotenso Model JW 1 (TEST)');
    await expect(page.getByLabel('Model JW 2 (opcjonalnie)')).toHaveValue('Rotenso Model JW 2 (TEST)');
    await expect(page.getByLabel('Model JW 3 (opcjonalnie)')).toHaveValue('Rotenso Model JW 3 (TEST)');
    await page.getByLabel('Model JW 2 (opcjonalnie)').fill('Rotenso Model JW 2 — poprawiony');
    await page.getByRole('button', { name: 'Zapisz urządzenia i tabliczki' }).click();
    await expect(page.getByRole('heading', { name: 'Uzupełnij urządzenia i tabliczki' })).toBeHidden();

    const updatedJob = await page.evaluate(() => (
      window.__KLIMA_MOCK_SUPABASE__?.getStore()?.jobs?.find((job) => job.id === 'mock-job-005')
    ));
    expect(updatedJob?.device_model).toContain('JW1: Rotenso Model JW 1 (TEST)');
    expect(updatedJob?.device_model).toContain('JW2: Rotenso Model JW 2 — poprawiony');
    expect(updatedJob?.device_model).toContain('JW3: Rotenso Model JW 3 (TEST)');
    expect(updatedJob?.device_model).toContain('JZ: Rotenso Multi-Split JZ (TEST)');

    await page.locator('.photoUploadBtnGallery input[type="file"]').setInputFiles(tinyPng);
    await expect(page.locator('.thumbCard')).toHaveCount(1);
    await expect(page.getByRole('status', { name: /Połączenie:/ })).toContainText('Wszystko wysłane');

    const storedPhoto = await page.evaluate(() => (
      window.__KLIMA_MOCK_SUPABASE__?.getStore()?.photos?.find((photo) => photo.job_id === 'mock-job-005')
    ));
    expect(storedPhoto?.job_id).toBe('mock-job-005');
  });
});
