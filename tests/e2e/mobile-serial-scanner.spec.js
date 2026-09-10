import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const tinyPng = {
  name: 'tabliczka-znamionowa.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==', 'base64'),
};

test.use(iphone14);


async function selectNameplateAndCrop(page, input) {
  await input.setInputFiles(tinyPng);
  await expect(page.locator('.nameplateCropModal')).toBeVisible();
  await expect(page.getByText('Dopasuj kadr', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz kadr' }).click();
  await expect(page.locator('.nameplateCropModal')).toBeHidden();
}

async function openNewJobForm(page) {
  await resetMockSupabase(page);
  await loginWithoutReset(page, ADMIN);
  await page.locator('button.mobileActionBtn.primary[title="Dodaj"]').click();
  await expect(page.getByRole('heading', { name: 'Nowy montaż / zlecenie' })).toBeVisible();
}

test.describe('@mobile iPhone — uproszczony kreator urządzeń bez OCR z kadrowaniem tabliczek', () => {
  test('chowa miniatury tabliczek i pokazuje zdjęcie dopiero po kliknięciu', async ({ page }, testInfo) => {
    await openNewJobForm(page);

    await expect(page.locator('.serialScannerModal')).toHaveCount(0);
    await expect(page.locator('.nameplateCameraInput')).toHaveCount(2);
    await expect(page.locator('.nameplateGalleryInput')).toHaveCount(2);
    await expect(page.getByLabel('Model JZ (opcjonalnie)')).toHaveValue('');
    await expect(page.getByLabel('Numer seryjny JZ (opcjonalnie)')).toHaveValue('');
    await expect(page.getByLabel('Model JW (opcjonalnie)')).toHaveValue('');
    await expect(page.getByLabel('Numer seryjny JW (opcjonalnie)')).toHaveValue('');

    await selectNameplateAndCrop(page, page.locator('.nameplateGalleryInput').nth(0));
    await selectNameplateAndCrop(page, page.locator('.nameplateGalleryInput').nth(1));
    await expect(page.getByText('Nowe zdjęcie')).toHaveCount(2);
    await expect(page.locator('.nameplateCapturePreview')).toHaveCount(0);

    await page.locator('.nameplateCaptureSummary').nth(0).click();
    await expect(page.locator('.nameplateCapturePreview')).toHaveCount(1);
    await page.getByRole('button', { name: 'Ukryj zdjęcie' }).click();
    await expect(page.locator('.nameplateCapturePreview')).toHaveCount(0);

    await page.getByPlaceholder('Klient', { exact: true }).fill('Klient Tabliczki Bez OCR');
    await page.getByPlaceholder('Miejscowość').fill('Zawiercie');
    await page.getByPlaceholder('Ulica i numer').fill('Testowa 56');
    await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();
    await expect(page.getByRole('heading', { name: 'Nowy montaż / zlecenie' })).toBeHidden();

    await expect.poll(async () => page.evaluate(() => (
      window.__KLIMA_MOCK_SUPABASE__?.getStore()?.photos?.length || 0
    ))).toBe(2);

    await page.getByText('Klient Tabliczki Bez OCR', { exact: true }).click();
    await expect(page.getByText('Urządzenia i tabliczki', { exact: true })).toBeVisible();
    const deviceToggle = page.getByRole('button', { name: 'Rozwiń Urządzenie 1' });
    await expect(deviceToggle).toBeVisible();
    await expect(deviceToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.deviceUnitDocumentationRow')).toHaveCount(2);
    await expect(page.locator('.deviceUnitDocumentationRow').first()).toBeHidden();
    await deviceToggle.click();
    await expect(page.getByRole('button', { name: 'Zwiń Urządzenie 1' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.deviceUnitDocumentationRow').first()).toBeVisible();
    await expect(page.locator('[data-mobile-device-table="8.89"]')).toBeVisible();
    await expect(page.locator('.deviceUnitDocumentationTableHeader > span')).toHaveText([
      'Urządzenie',
      'Model / moc',
      'Tabliczka',
      'Status',
    ]);
    const deviceTableLayout = await page.locator('.deviceUnitDocumentationRow').first().evaluate((row) => {
      const style = getComputedStyle(row);
      const cells = [...row.children].map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right };
      });
      return {
        display: style.display,
        columns: style.gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        noRowOverflow: row.scrollWidth <= row.clientWidth,
        noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        leftToRight: cells.every((cell, index) => index === 0 || cell.x > cells[index - 1].x),
        sameVisualRow: cells.every((cell) => Math.abs(cell.y - cells[0].y) < 18),
      };
    });
    expect(deviceTableLayout).toEqual({
      display: 'grid',
      columns: 4,
      noRowOverflow: true,
      noPageOverflow: true,
      leftToRight: true,
      sameVisualRow: true,
    });
    await page.screenshot({ path: testInfo.outputPath('mobile-device-table-v8.89.png'), fullPage: true });
    await expect(page.locator('.deviceUnitDocumentationRow img')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Otwórz tabliczkę znamionową/ })).toHaveCount(2);
    await expect(page.getByText('Stary zapis numeru seryjnego:')).toHaveCount(0);

    await page.getByRole('button', { name: 'Otwórz tabliczkę znamionową JZ' }).click();
    await expect(page.locator('.previewImageWrap .fullPreview')).toBeVisible();
  });

  test('nie pozwala pracownikowi zakończyć zlecenia bez tabliczki JZ i każdej JW', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();

    await expect(page.getByText('Nie można zakończyć zlecenia.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Brakuje: JZ urządzenia 1, JW 1 urządzenia 1, JW 2 urządzenia 1, JW 3 urządzenia 1/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zakończ' })).toBeDisabled();

    await page.getByRole('button', { name: 'Dodaj brakujące tabliczki' }).click();
    await expect(page.locator('.mobileDeviceWizard')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Urządzenia' })).toBeVisible();
    await expect(page.getByText('Multi', { exact: true })).toBeVisible();

    // Niepełny zestaw można zapisać, ale zakończenie nadal pozostaje zablokowane.
    await page.getByRole('button', { name: 'Zapisz montaż' }).click();
    await expect(page.locator('.mobileDeviceWizard')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Zakończ' })).toBeDisabled();

    await page.getByRole('button', { name: 'Dodaj brakujące tabliczki' }).click();
    await page.locator('.mobileDeviceOverviewOpen').first().click();
    await expect(page.getByText('Tryb: Multi', { exact: true })).toBeVisible();

    await page.locator('.mobileMultiOutdoorCard').click();
    await selectNameplateAndCrop(page, page.locator('.nameplateGalleryInput'));
    await expect(page.getByText('Nowe zdjęcie', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz jednostkę' }).click();

    for (let index = 0; index < 3; index += 1) {
      await page.locator('.mobileMultiIndoorCard').nth(index).click();
      await selectNameplateAndCrop(page, page.locator('.nameplateGalleryInput'));
      await page.getByRole('button', { name: 'Zapisz jednostkę' }).click();
    }

    await expect(page.getByText('Tabliczka dodana', { exact: true })).toHaveCount(3);
    await page.getByRole('button', { name: 'Zapisz urządzenie' }).click();
    await expect(page.getByText('Wszystkie tabliczki dodane', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz montaż' }).click();
    await expect(page.locator('.mobileDeviceWizard')).toBeHidden();

    await expect(page.getByText('Wszystkie wymagane zdjęcia tabliczek są zapisane.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zakończ' })).toBeEnabled();
    await page.getByRole('button', { name: 'Zakończ' }).click();
    await expect(page.getByText('Zakończone · tylko podgląd')).toBeVisible();
  });
});
