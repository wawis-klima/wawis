import { expect, test } from '@playwright/test';
import { ADMIN, WORKER, login } from './mock-helpers.js';

// WAWIS 14.36 — Diagnostyka na komputerze: wzory podpisów pracowników (podgląd, tylko administrator). Dane fikcyjne.
test.use({ viewport: { width: 1440, height: 1000 } });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('14.36: administrator widzi wzory podpisów w Diagnostyce na komputerze', async ({ page }) => {
  await login(page, ADMIN);
  await page.evaluate((png) => window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
    const worker = store.profiles.find((item) => item.full_name === 'Pracownik Testowy');
    store.leak_test_signatures = [{ id: 's1', profile_id: worker.id, image_png: png, created_at: '2026-11-07T10:00:00Z' }];
  }), PNG);
  await page.getByRole('button', { name: 'Diagnostyka' }).click();
  const card = page.getByTestId('desktop-staff-signatures-card');
  await expect(card).toContainText('Wzory podpisów pracowników');
  await expect(card.getByTestId('desktop-staff-signatures-count')).toContainText('Złożone wzory: 1 z');
  const row = card.getByTestId('desktop-staff-signature-row').filter({ hasText: 'Pracownik Testowy' });
  await expect(row).toContainText('Zapisany 07.11.2026');
  await expect(row.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(card.getByTestId('desktop-staff-signature-row').filter({ hasText: 'Brak wzoru' }).first()).toBeVisible();
});

test('14.36: pracownik nie widzi wzorów w Diagnostyce na komputerze', async ({ page }) => {
  await login(page, WORKER);
  const diag = page.getByRole('button', { name: 'Diagnostyka' });
  if (await diag.count()) {
    await diag.first().click();
    await expect(page.getByRole('heading', { name: 'Diagnostyka', exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('desktop-staff-signatures-card')).toHaveCount(0);
});
