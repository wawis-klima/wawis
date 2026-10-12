import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

test.describe('@mobile WAWIS 13.21 — komentarz w nowym montażu', () => {
  for (const [role, credentials, field] of [
    ['administrator', ADMIN, 'admin_note'],
    ['pracownik', WORKER, 'worker_comment'],
  ]) {
    test(role + ': zapis tylko do właściwej sekcji', async ({ page }) => {
      await resetMockSupabase(page);
      await loginWithoutReset(page, credentials);
      await page.getByRole('button', { name: /Dodaj zlecenie|Dodaj nowego klienta/ }).first().click();
      const modal = page.locator('.formModal').first();
      await expect(modal).toBeVisible();

      const label = role === 'administrator' ? 'Komentarz administratora' : 'Komentarz do montażu';
      const customer = 'E2E Nowy Komentarz ' + role + ' 1321';
      const note = 'Dwie JW: salon i pokój. Agregat na elewacji; skropliny do rynny.';
      await modal.getByPlaceholder('Klient', { exact: true }).fill(customer);
      await modal.getByPlaceholder('Email klienta').fill('test-1321@example.test');
      await modal.getByPlaceholder('Telefon klienta / SMS').fill('501123456');
      await modal.getByPlaceholder('Ulica i numer').fill('Testowa 21');
      await modal.getByPlaceholder('Miejscowość').fill('Zawiercie');
      const comment = modal.locator('textarea.workerNewClientCommentTextarea');
      await expect(comment).toHaveAttribute('placeholder', label);
      await comment.fill(note);
      await modal.getByRole('button', { name: role === 'administrator' ? 'Zapisz zlecenie' : 'Dodaj klienta' }).click();

      await expect.poll(async () => page.evaluate((name) => {
        const store = window.__KLIMA_MOCK_SUPABASE__?.getStore();
        const job = store?.jobs?.find((item) => item.client === name);
        if (!job) return null;
        return {
          admin_note: job.admin_note || '',
          comments: (store.comments || [])
            .filter((item) => item.job_id === job.id)
            .map((item) => item.text),
        };
      }, customer), { timeout: 20000 }).toEqual(field === 'admin_note'
        ? { admin_note: note, comments: [] }
        : { admin_note: '', comments: [note] });
    });
  }
});
