import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 14.29 — instalator sam podpisuje swoje protokoły szczelności w aplikacji (dane fikcyjne, mock).
const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

test('@mobile 14.29: pracownik widzi swoje protokoły do podpisu, bez podpisu nie zatwierdzi, po podpisie baner znika', async ({ page }) => {
  await resetMockSupabase(page);
  await page.evaluate(() => {
    const key = 'klima-mock-supabase-store-v3';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    store.leak_test_records = [{ job_id: 'mock-job-003', test_date: '2026-04-22', temperature_c: 18, result: 'pozytywny', signature_id: null, signed_at: null }];
    localStorage.setItem(key, JSON.stringify(store));
  });
  await loginWithoutReset(page, WORKER);
  const banner = page.getByTestId('leak-sign-banner');
  await expect(banner).toContainText('Protokoły szczelności do podpisu: 1');
  await banner.getByRole('button', { name: 'Podpisz' }).click();
  const sheet = page.getByRole('dialog', { name: 'Podpis protokołów szczelności' });
  await expect(sheet).toContainText('Klient Testowy C Zakończony');
  await expect(sheet).toContainText('22.04.2026 · 18 °C · Pozytywny');

  await sheet.getByRole('button', { name: 'Podpisz (1)' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Podpisz się palcem');

  // Zdarzenia wskaźnika dotykowego (jak palec na iPhonie) — działają w Chromium i WebKit.
  const canvas = sheet.getByTestId('leak-sign-canvas');
  const box = await canvas.boundingBox();
  const at = (dx, dy) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: box.x + dx, clientY: box.y + dy, buttons: 1 });
  await canvas.dispatchEvent('pointerdown', at(30, 100));
  for (const [dx, dy] of [[60, 60], [110, 110], [170, 70], [230, 100], [280, 80]]) await canvas.dispatchEvent('pointermove', at(dx, dy));
  await canvas.dispatchEvent('pointerup', at(280, 80));
  await sheet.getByRole('button', { name: 'Podpisz (1)' }).click();
  await expect(banner).toContainText('Podpisano protokołów: 1.');
  await expect(banner).not.toContainText('do podpisu');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('klima-mock-supabase-store-v3') || '{}'));
  expect(stored.leak_test_records[0].signature_id).toBeTruthy();
  expect(String(stored.leak_test_signatures[0].image_png)).toMatch(/^data:image\/png;base64,/);
});
