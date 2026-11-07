import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 14.33 — Diagnostyka → „Wzór podpisu” (decyzja właściciela 07.11.2026). Pracownik składa wzór; jego protokoły
// podpisują się same (data podpisu = data badania). Bez banera „do podpisu” na liście montaży. Dane fikcyjne (mock).
const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

test('@mobile 14.33: wzór podpisu w diagnostyce podpisuje protokoły pracownika', async ({ page }) => {
  await resetMockSupabase(page);
  await page.evaluate(() => {
    const key = 'klima-mock-supabase-store-v3';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    store.leak_test_signatures = [];
    store.leak_test_records = [{ job_id: 'mock-job-003', test_date: '2026-04-22', temperature_c: 18, result: 'pozytywny', signature_id: null, signed_at: null }];
    localStorage.setItem(key, JSON.stringify(store));
  });
  await loginWithoutReset(page, WORKER);
  await expect(page.locator('.statusButtonsBar')).toBeVisible();
  // Lista montaży bez banera do podpisu.
  await expect(page.getByTestId('leak-sign-banner')).toHaveCount(0);

  await page.locator('.wawisVersionDiagnosticsButton').click();
  const card = page.getByTestId('signature-pattern-card');
  await expect(card).toContainText('Wzór podpisu');
  await expect(card.getByTestId('signature-pattern-missing')).toBeVisible();
  await card.getByTestId('signature-pattern-open').click();

  const sheet = page.getByRole('dialog', { name: 'Wzór podpisu' });
  await expect(sheet).toBeVisible();
  await expect(page.locator('.leakSignOverlay')).toHaveCSS('position', 'fixed');
  // Bez podpisu — nie zapisze.
  await sheet.getByRole('button', { name: 'Zapisz wzór' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Podpisz się palcem');

  const canvas = sheet.getByTestId('leak-sign-canvas');
  const box = await canvas.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(150);
  // Pole podpisu i przyciski na wierzchu (hit-test), w widocznej części ekranu.
  const onTop = await page.evaluate(() => [...document.querySelectorAll('.leakSignActions button, canvas.leakSignCanvas')].map((el) => {
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    return { inView: y > 0 && y < window.innerHeight, hit: el.contains(document.elementFromPoint(r.left + r.width / 2, y)) };
  }));
  expect(onTop).toEqual([{ inView: true, hit: true }, { inView: true, hit: true }, { inView: true, hit: true }]);

  const at = (dx, dy) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: box.x + dx, clientY: box.y + dy, buttons: 1 });
  await canvas.dispatchEvent('pointerdown', at(30, 100));
  for (const [dx, dy] of [[60, 60], [110, 110], [170, 70], [230, 100], [280, 80]]) await canvas.dispatchEvent('pointermove', at(dx, dy));
  await canvas.dispatchEvent('pointerup', at(280, 80));
  await sheet.getByRole('button', { name: 'Zapisz wzór' }).click();

  await expect(sheet).toHaveCount(0);
  await expect(card.getByRole('status')).toHaveText('Wzór podpisu zapisany. Podpisano protokołów: 1.');
  await expect(card.getByTestId('signature-pattern-preview').locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(card.getByTestId('signature-pattern-open')).toHaveText('Zmień wzór podpisu');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('klima-mock-supabase-store-v3') || '{}'));
  expect(stored.leak_test_records[0].signature_id).toBeTruthy();
  expect(String(stored.leak_test_records[0].signed_at)).toMatch(/^2026-04-22/);
});
