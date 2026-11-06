import fs from 'node:fs';
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login } from './mock-helpers.js';

// WAWIS 14.27 — protokół z próby szczelności (PDF z danych montażu) w karcie zakończonego montażu.
// Dane fikcyjne (mock). PDF zapisywany do test-results (artefakt CI) do kontroli wyglądu.
const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function openCompleted(page, credentials) {
  await login(page, credentials);
  await page.locator('.statusActionButton[title="Zakończone"]').click();
  await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
}

test('@mobile 14.27: administrator otwiera protokół szczelności PDF zakończonego montażu', async ({ page }, testInfo) => {
  await openCompleted(page, ADMIN);
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
  fs.writeFileSync(testInfo.outputPath('protokol-szczelnosci-v1427.pdf'), pdf);
  await expect(button).toHaveText('Protokół szczelności (PDF)');
});

test('@mobile 14.27: pracownik nie widzi przycisku protokołu szczelności', async ({ page }) => {
  await openCompleted(page, WORKER);
  await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
  await expect(page.getByTestId('leak-test-protocol-btn')).toHaveCount(0);
});
