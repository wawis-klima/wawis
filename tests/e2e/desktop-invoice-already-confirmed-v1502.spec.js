// WAWIS 15.02 (zgłoszenie właściciela 25.11.2026): faktura potwierdzona w bazie, a ekran pokazywał
// „Faktura VAT niewystawiona” + „Faktura została już potwierdzona.” (stara odpowiedź listy nadpisała stan).
// Odpowiedź „już potwierdzona” ma odczytać stan z bazy i pokazać fakturę jako wystawioną.
import { expect, test } from '@playwright/test';
import { ADMIN, login, resetMockSupabase } from './mock-helpers.js';

test('15.02 komputer: „już potwierdzona” z Fakturowni → ekran pokazuje fakturę wystawioną, bez błędu', async ({ page }) => {
  await resetMockSupabase(page);
  await login(page, ADMIN);
  await page.getByRole('button', { name: /^Montaże$/ }).click();
  await page.getByRole('button', { name: /Zakończone:/ }).click();
  await page.getByRole('table').getByText('Klient Testowy C Zakończony', { exact: true }).click();

  const vatButton = page.locator('button[aria-pressed]').filter({ hasText: 'Faktura VAT' }).first();
  await expect(vatButton).toContainText('Niewystawiona');

  // Faktura potwierdzona w bazie, ale ekran ma jeszcze stary stan (jak po spóźnionej odpowiedzi listy).
  await page.evaluate(() => {
    window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
      const job = store.jobs.find((item) => item.id === 'mock-job-003');
      Object.assign(job, {
        vat_invoice_issued: true,
        vat_invoice_fakturownia_confirmed: true,
        vat_invoice_fakturownia_invoice_id: '999',
        vat_invoice_fakturownia_invoice_number: '33/11/2026',
        vat_invoice_fakturownia_confirmed_at: new Date().toISOString(),
      });
    });
  });
  await expect(vatButton).toContainText('Niewystawiona');

  await page.getByRole('button', { name: /Opcje awaryjne/ }).click();
  await page.getByRole('button', { name: 'Sprawdź wystawioną fakturę' }).click();

  await expect(vatButton).toContainText('Wystawiona');
  await expect(vatButton).not.toContainText('Niewystawiona');
  await expect(page.getByText('Faktura została już potwierdzona.')).toHaveCount(0);
  await expect(page.getByText('Potwierdzono fakturę VAT 33/11/2026 w Fakturowni.')).toBeVisible();
});
