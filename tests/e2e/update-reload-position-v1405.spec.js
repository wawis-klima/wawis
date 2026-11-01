import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login } from './mock-helpers.js';

// WAWIS 14.05 — zgłoszenie właściciela 01.11.2026: przy pierwszym otwarciu po wdrożeniu kliknięcie modułu
// (Urządzenia, Paliwo…) kończyło się przeładowaniem i powrotem do pierwszego ekranu.
// Przeładowanie aktualizacji symulujemy dokładnie tak jak robi to update-reload-guard (znacznik + reload).

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

async function updateReload(page) {
  await page.evaluate(() => window.sessionStorage.setItem('wawis-update-reload-at', String(Date.now())));
  await page.reload();
}
const activeModule = page => page.locator('.moduleSwitcherMobile .moduleSwitcherBtn.active');

test.describe('@mobile 14.05: powrót do modułu po przeładowaniu aktualizacji', () => {
  test.use(iphone14);

  test('administrator w Urządzeniach i Paliwie wraca do tego samego modułu', async ({ page }) => {
    await login(page, ADMIN);
    await page.locator('.moduleSwitcherMobile button[data-module="devices"]').click();
    await expect(page.locator('.serviceAdminPage')).toBeVisible();
    await updateReload(page);
    await expect(page.locator('.serviceAdminPage')).toBeVisible();
    await expect(activeModule(page)).toHaveAttribute('data-module', 'devices');

    await page.locator('.moduleSwitcherMobile button[data-module="fuel"]').click();
    await expect(activeModule(page)).toHaveAttribute('data-module', 'fuel');
    await updateReload(page);
    await expect(activeModule(page)).toHaveAttribute('data-module', 'fuel');
  });

  test('zwykłe przeładowanie (bez aktualizacji) zaczyna od Montaży; znacznik jest jednorazowy', async ({ page }) => {
    await login(page, ADMIN);
    await page.locator('.moduleSwitcherMobile button[data-module="fuel"]').click();
    await expect(activeModule(page)).toHaveAttribute('data-module', 'fuel');
    await page.reload();
    await expect(activeModule(page)).toHaveAttribute('data-module', 'jobs');

    await page.locator('.moduleSwitcherMobile button[data-module="fuel"]').click();
    await updateReload(page);
    await expect(activeModule(page)).toHaveAttribute('data-module', 'fuel');
    await page.reload();
    await expect(activeModule(page)).toHaveAttribute('data-module', 'jobs');
  });

  test('stary znacznik (ponad 30 s) nie przywraca modułu', async ({ page }) => {
    await login(page, ADMIN);
    await page.locator('.moduleSwitcherMobile button[data-module="fuel"]').click();
    await page.evaluate(() => window.sessionStorage.setItem('wawis-update-reload-at', String(Date.now() - 60_000)));
    await page.reload();
    await expect(activeModule(page)).toHaveAttribute('data-module', 'jobs');
  });

  test('pracownik nie trafia do modułu administratora mimo zapisanej pozycji', async ({ page }) => {
    await login(page, WORKER);
    await expect(activeModule(page)).toHaveAttribute('data-module', 'jobs');
    await page.evaluate(() => {
      window.sessionStorage.setItem('wawis-active-position', JSON.stringify({ module: 'devices', section: 'devices' }));
      window.sessionStorage.setItem('wawis-update-reload-at', String(Date.now()));
    });
    await page.reload();
    await expect(page.locator('.moduleSwitcherMobile button[data-module="devices"]')).toHaveCount(0);
    await expect(page.locator('.serviceAdminPage')).toHaveCount(0);
    await expect(activeModule(page)).toHaveAttribute('data-module', 'jobs');
  });
});

test('14.05: komputer — po przeładowaniu aktualizacji administrator wraca do Tankowań', async ({ page }) => {
  await login(page, ADMIN);
  await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();
  await expect(page.getByRole('heading', { name: 'Tankowania', exact: true })).toBeVisible();
  await updateReload(page);
  await expect(page.getByRole('heading', { name: 'Tankowania', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tankowania', exact: true })).toHaveCount(0);
});
