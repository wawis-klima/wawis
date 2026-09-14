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
    const deviceToggle = page.getByRole('button', { name: 'Rozwiń Urządzenie 1' });
    await expect(deviceToggle).toBeVisible();
    await expect(deviceToggle).toHaveAttribute('aria-expanded', 'false');
    await deviceToggle.click();
    await expect(page.getByRole('button', { name: 'Zwiń Urządzenie 1' })).toHaveAttribute('aria-expanded', 'true');

    const rows = page.locator('.deviceUnitDocumentationRow');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('JZ');
    await expect(rows.nth(0)).toContainText('Rotenso Multi-Split JZ (TEST)');
    await expect(rows.nth(1)).toContainText('JW1');
    await expect(rows.nth(1)).toContainText('Rotenso Model JW 1 (TEST)');
    await expect(rows.nth(3)).toContainText('JW3');
    await expect(rows.nth(3)).toContainText('Rotenso Model JW 3 (TEST)');

    const storedJob = await page.evaluate(() => (
      window.__KLIMA_MOCK_SUPABASE__?.getStore()?.jobs?.find((job) => job.id === 'mock-job-005')
    ));
    expect(storedJob?.device_model).toContain('JW1: Rotenso Model JW 1 (TEST)');
    expect(storedJob?.device_model).toContain('JW2: Rotenso Model JW 2 (TEST)');
    expect(storedJob?.device_model).toContain('JW3: Rotenso Model JW 3 (TEST)');
    expect(storedJob?.device_model).toContain('JZ: Rotenso Multi-Split JZ (TEST)');

    await page.locator('.photoUploadBtnGallery input[type="file"]').setInputFiles(tinyPng);
    await expect(page.locator('.thumbCard')).toHaveCount(1);
    await expect(page.getByRole('status', { name: /Połączenie:/ })).toContainText('Wszystko wysłane');

    const storedPhoto = await page.evaluate(() => (
      window.__KLIMA_MOCK_SUPABASE__?.getStore()?.photos?.find((photo) => photo.job_id === 'mock-job-005')
    ));
    expect(storedPhoto?.job_id).toBe('mock-job-005');
  });
});
