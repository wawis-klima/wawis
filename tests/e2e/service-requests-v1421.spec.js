import { expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';

// WAWIS 14.21 — liczniki KOMUNIKACJA, zakładki Awarie/Przeglądy, zgłoszenie → Przeglądy serwisowe.
// Dane testowe: nowe zgłoszenie „Awaria” (Klient Testowy A) i załatwione „Przegląd” (Klient Testowy B).
test.describe('14.21: zgłoszenia — liczniki i przegląd ze zgłoszenia', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('licznik w menu, zakładki rodzaju i zaplanowanie przeglądu z wpisanym urządzeniem i uwagami', async ({ page }) => {
    await login(page, ADMIN);
    await expect(page.getByTestId('nav-badge-requests')).toHaveText('1');
    await expect(page.getByTestId('nav-badge-sms')).toHaveCount(0, { timeout: 2000 });
    await page.getByRole('button', { name: /^Zgłoszenia$/ }).click();

    const panel = page.getByTestId('service-requests-panel');
    const rows = panel.getByTestId('service-request-row');
    await expect(panel.getByRole('tab', { name: /Awarie/ })).toContainText('1 nowe');
    await expect(panel.getByRole('tab', { name: /Przeglądy/ })).not.toContainText('nowe');

    // Przegląd przywrócony jako nowy: licznik w menu i na zakładce rośnie.
    await panel.getByRole('tab', { name: /Przeglądy/ }).click();
    await panel.getByRole('button', { name: 'Załatwione' }).click();
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole('button', { name: 'Przywróć jako nowe' }).click();
    await panel.getByRole('button', { name: /^Nowe/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Klient Testowy B');
    await expect(panel.getByRole('tab', { name: /Przeglądy/ })).toContainText('1 nowe');
    await expect(page.getByTestId('nav-badge-requests')).toHaveText('2');

    // Zakładka Awarie pokazuje tylko awarie.
    await panel.getByRole('tab', { name: /Awarie/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Nie chłodzi');

    // Zaplanuj przegląd → Urządzenia / Przeglądy serwisowe z wybranym urządzeniem i uwagami ze zgłoszenia.
    await panel.getByRole('tab', { name: /Przeglądy/ }).click();
    await rows.first().getByRole('button', { name: 'Zaplanuj przegląd' }).click();
    await expect(page.getByRole('heading', { name: 'Umówiony przegląd' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Przeglądy serwisowe' })).toHaveClass(/primary/);
    const device = page.locator('.serviceAdminCheck').filter({ hasText: 'Mitsubishi Mock 2.5 kW' }).locator('input[type="checkbox"]');
    await expect(device).toBeChecked();
    await expect(page.getByLabel('Uwagi')).toHaveValue(/^Zgłoszenie klienta z naklejki QR \(.+\): Przegląd\. Tel\. klienta: 600 333 444\.$/);
  });
});
