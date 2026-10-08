import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

test.describe('@mobile WAWIS — diagnostyka z numeru wersji', () => {
  test.use(iphone14);

  test('pracownik otwiera diagnostykę przez wersję i wraca do montaży', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    const versionButton = page.locator('.wawisVersionDiagnosticsButton');
    await expect(versionButton).toBeVisible();
    await expect(versionButton).toHaveAttribute('aria-expanded', 'false');
    await expect(versionButton).toHaveAttribute('aria-label', /Wersja aplikacji .* otwórz diagnostykę/);

    await versionButton.click();
    await expect(versionButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('heading', { name: 'Diagnostyka mobilna' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pobierz raport diagnostyczny' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wyślij test push' })).toHaveCount(0);
    await expect(page.locator('.statusButtonsBar')).toHaveCount(0);

    await page.getByRole('button', { name: /Wróć do montaży/ }).click();
    await expect(page.locator('.statusButtonsBar')).toBeVisible();
    await expect(versionButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('administrator widzi test push w diagnostyce wywołanej wersją', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, ADMIN);
    const versionButton = page.locator('.wawisVersionDiagnosticsButton');
    await expect(versionButton).toBeVisible();
    await versionButton.click();
    await expect(page.getByRole('heading', { name: 'Diagnostyka mobilna' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wyślij test push' })).toBeVisible();
    await versionButton.click();
    await expect(page.locator('.statusButtonsBar')).toBeVisible();
  });
});
