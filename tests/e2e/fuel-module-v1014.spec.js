import { expect, test } from '@playwright/test';
import { ADMIN, WORKER, login } from './mock-helpers.js';

test.describe('Tankowania 10.22', () => {
  test('administrator zapisuje tankowanie i filtruje historię samochodu na komputerze', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();

    await expect(page.getByRole('heading', { name: 'Tankowania', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tankowania według samochodu' })).toBeVisible();
    await page.getByRole('button', { name: /Rozwiń/ }).click();
    await page.getByLabel('Numer rejestracyjny').selectOption({ label: 'Doblo — SZA 6149G' });
    await page.getByPlaceholder('np. 48,5').fill('48,5');
    await page.getByPlaceholder('np. 125400').fill('125400');
    await page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' }).click();

    await expect(page.getByText(/Tankowanie z ręcznie wpisanym przebiegiem zostało zapisane/)).toBeVisible();
    await expect(page.locator('.fuelHistoryRow')).toContainText('48,50 l');
    await expect(page.locator('.fuelHistoryRow')).toContainText('125 400 km · ręcznie');

    const dobloSummary = page.locator('.fuelVehicleSummaryRow').filter({ hasText: 'SZA 6149G' });
    await expect(dobloSummary).toContainText('1 tankowanie');
    await dobloSummary.click();
    await expect(page.getByRole('heading', { name: 'Historia: Doblo — SZA 6149G' })).toBeVisible();
    await expect(page.locator('.fuelHistoryRow')).toHaveCount(1);
  });

  test('formularz ostrzega o dużym skoku i blokuje ponad 5000 km bez zdjęcia', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();
    await page.getByRole('button', { name: /Rozwiń/ }).click();
    await page.getByLabel('Numer rejestracyjny').selectOption({ label: 'Doblo — SZA 6149G' });
    await page.getByPlaceholder('np. 48,5').fill('20');
    await page.getByPlaceholder('np. 125400').fill('125400');
    await page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' }).click();

    await page.getByPlaceholder('np. 48,5').fill('20');
    await page.getByPlaceholder('np. 125400').fill('128000');
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Różnica: 2 600 km');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' }).click();
    await expect(page.locator('.fuelHistoryRow')).toHaveCount(1);

    await page.getByPlaceholder('np. 125400').fill('131000');
    await page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' }).click();
    await expect(page.getByRole('alert')).toContainText('Przy różnicy powyżej 5 000 km');
    await expect(page.locator('.fuelHistoryRow')).toHaveCount(1);
  });

  test('mobilny pracownik ma Paliwo bez desktopowej tabeli samochodów', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, WORKER);
    await page.getByRole('button', { name: 'Paliwo' }).click();
    await expect(page.getByRole('heading', { name: 'Tankowania', exact: true }).last()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tankowania według samochodu' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' })).toBeVisible();
  });
});
