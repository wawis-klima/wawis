import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login } from './mock-helpers.js';

// 30.10.2026: na komputerze nie ma formularza „Nowe tankowanie” (tankowania wpisują pracownicy w telefonie) —
// zestawienie i filtr historii sprawdzamy na tankowaniu dopisanym do testowej bazy; formularz — na iPhonie (niżej).
test.describe('Tankowania 10.22', () => {
  test('administrator filtruje historię samochodu na komputerze', async ({ page }) => {
    await login(page, ADMIN);
    await page.evaluate(() => {
      window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
        store.fuel_entries = [{
          id: 'mock-1014-entry', vehicle_id: 'mock-fuel-vehicle-001', liters: 48.5, odometer_km: 125400,
          fueled_at: '2026-10-28T08:00:00.000Z', created_at: '2026-10-28T08:00:00.000Z', created_by: 'mock-admin-1', odometer_read_source: 'manual',
        }];
      });
    });
    await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();

    await expect(page.getByRole('heading', { name: 'Tankowania', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tankowania według samochodu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' })).toHaveCount(0);

    const dobloSummary = page.locator('.fuelVehicleSummaryRow').filter({ hasText: 'SZA 6149G' });
    await expect(dobloSummary).toContainText('1 tankowanie');
    await dobloSummary.click();
    await expect(page.getByRole('heading', { name: 'Historia: Doblo — SZA 6149G' })).toBeVisible();
    await expect(page.locator('.fuelHistoryRow')).toHaveCount(1);
    await expect(page.locator('.fuelHistoryRow')).toContainText('48,50 l');
    await expect(page.locator('.fuelHistoryRow')).toContainText('125 400 km · ręcznie');
  });
});

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

test.describe('@mobile Tankowania pracownika iPhone', () => {
  test.use(iphone14);

  test('mobilny pracownik ma Paliwo bez desktopowej tabeli samochodów', async ({ page }) => {
    await login(page, WORKER);
    await page.getByRole('button', { name: 'Paliwo' }).click();
    await expect(page.getByRole('heading', { name: 'Tankowania', exact: true }).last()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tankowania według samochodu' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' })).toBeVisible();
  });
});

test.describe('@mobile Tankowania — formularz na iPhonie', () => {
  test.use(iphone14);

  test('@mobile administrator zapisuje tankowanie; formularz ostrzega o dużym skoku i blokuje ponad 5000 km bez zdjęcia', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: 'Paliwo' }).click();
    await page.getByLabel('Numer rejestracyjny').selectOption({ label: 'Doblo — SZA 6149G' });
    await page.getByPlaceholder('np. 48,5').fill('20');
    await page.getByPlaceholder('np. 125400').fill('125400');
    await page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' }).click();
    await expect(page.getByText(/Tankowanie z ręcznie wpisanym przebiegiem zostało zapisane/)).toBeVisible();
    await expect(page.locator('.fuelHistoryRow')).toHaveCount(1);

    await page.getByPlaceholder('np. 48,5').fill('20');
    await page.getByPlaceholder('np. 125400').fill('128000');
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/Różnica: 2(?:[\s\u00a0\u202f])?600 km/);
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' }).click();
    await expect(page.locator('.fuelHistoryRow')).toHaveCount(1);

    await page.getByPlaceholder('np. 125400').fill('131000');
    await page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' }).click();
    await expect(page.getByRole('alert')).toContainText('Przy różnicy powyżej 5 000 km');
    await expect(page.locator('.fuelHistoryRow')).toHaveCount(1);
  });
});
