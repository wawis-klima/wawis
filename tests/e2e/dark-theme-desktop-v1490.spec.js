// WAWIS 14.90 (decyzja właściciela 23.11.2026): tryb ciemny także na komputerze — przełącznik w menu bocznym.
// Sprawdza przełączanie bez przeładowania, zapamiętanie wyboru i czytelność głównych modułów (zrzuty do przeglądu).
import { expect, test } from '@playwright/test';
import { ADMIN, login, resetMockSupabase } from './mock-helpers.js';
import { expectReadable, shot } from './dark-theme-helpers.js';

test.use({ viewport: { width: 1440, height: 1000 } });

test('14.90 komputer: przełącznik trybu ciemnego, zapamiętanie i czytelność modułów', async ({ page }, testInfo) => {
  await resetMockSupabase(page);
  await login(page, ADMIN);
  const toggle = page.getByTestId('desktop-theme-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveText('Tryb ciemny');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveText('Tryb jasny');

  const modules = [
    ['Centrum 360', '20-centrum'],
    ['Montaże', '21-montaze'],
    ['Kalendarz', '22-kalendarz'],
    ['Urządzenia', '23-urzadzenia'],
    ['Kontrahenci', '24-kontrahenci'],
    ['SMS', '25-sms'],
    ['Protokoły', '26-protokoly'],
    ['Diagnostyka', '27-diagnostyka'],
  ];
  for (const [label, name] of modules) {
    await page.locator('.adminDesktopNavItem', { hasText: new RegExp(`^${label}$`) }).first().click();
    await page.waitForTimeout(400);
    expectReadable(await shot(page, testInfo, name), `komputer: ${label}`);
  }

  await page.locator('.adminDesktopNavItem', { hasText: /^Montaże$/ }).first().click();
  await page.getByRole('button', { name: /W trakcie:/ }).click();
  await page.getByRole('table').getByText('Klient Testowy B', { exact: true }).click();
  await page.waitForTimeout(400);
  expectReadable(await shot(page, testInfo, '28-montaz-szczegoly'), 'komputer: szczegóły montażu');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByTestId('desktop-theme-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('desktop-theme-toggle').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
});
