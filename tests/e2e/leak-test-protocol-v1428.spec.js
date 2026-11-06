import fs from 'node:fs';
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 14.28 — protokół z próby szczelności (PDF z danych montażu) w karcie zakończonego montażu.
// Dane fikcyjne (mock). PDF zapisywany do test-results (artefakt CI) do kontroli wyglądu.
const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function openCompleted(page, credentials) {
  await login(page, credentials);
  await page.locator('.statusActionButton[title="Zakończone"]').click();
  await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
}

test('@mobile 14.28: administrator otwiera protokół szczelności PDF zakończonego montażu', async ({ page }, testInfo) => {
  // Dane próby przepisane z protokołu (fikcyjne) — PDF ma je pokazać.
  await resetMockSupabase(page);
  await page.evaluate(() => {
    const key = 'klima-mock-supabase-store-v3';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    store.leak_test_records = [{ job_id: 'mock-job-003', test_date: '2026-04-22', temperature_c: 18, result: 'pozytywny' }];
    localStorage.setItem(key, JSON.stringify(store));
  });
  await loginWithoutReset(page, ADMIN);
  await page.locator('.statusActionButton[title="Zakończone"]').click();
  await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
  const button = page.getByTestId('leak-test-protocol-btn');
  await expect(button).toHaveText('Protokół szczelności (PDF)');
  const popupPromise = page.waitForEvent('popup');
  await button.click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url(), { timeout: 20_000 }).toMatch(/^blob:/);
  const bytes = await popup.evaluate(async () => {
    const res = await fetch(window.location.href);
    return Array.from(new Uint8Array(await res.arrayBuffer()));
  });
  const pdf = Buffer.from(bytes);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(10_000);
  fs.writeFileSync(testInfo.outputPath('protokol-szczelnosci-v1428.pdf'), pdf);
  await expect(button).toHaveText('Protokół szczelności (PDF)');
});

test('@mobile 14.28: pracownik nie widzi przycisku protokołu szczelności', async ({ page }) => {
  await openCompleted(page, WORKER);
  await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
  await expect(page.getByTestId('leak-test-protocol-btn')).toHaveCount(0);
});
