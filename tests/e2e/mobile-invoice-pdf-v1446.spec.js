import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 14.46 — PDF potwierdzonej faktury z Fakturowni na telefonie (tylko administrator). Dane fikcyjne (mock).
const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function seedConfirmedInvoice(page) {
  await resetMockSupabase(page);
  await page.evaluate(() => {
    const key = 'klima-mock-supabase-store-v3';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    const job = (store.jobs || []).find((item) => item.id === 'mock-job-003');
    Object.assign(job, { vat_invoice_issued: true, vat_invoice_fakturownia_confirmed: true, vat_invoice_fakturownia_invoice_id: '584755572', vat_invoice_fakturownia_invoice_number: '22/11/2026' });
    localStorage.setItem(key, JSON.stringify(store));
  });
}

async function openCompleted(page, credentials) {
  await loginWithoutReset(page, credentials);
  await page.locator('.statusActionButton[title="Zakończone"]').click();
  await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
  await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
}

test('@mobile 14.46: administrator otwiera PDF faktury z Fakturowni', async ({ page }) => {
  await seedConfirmedInvoice(page);
  await openCompleted(page, ADMIN);
  const button = page.getByTestId('invoice-pdf-btn');
  await expect(button).toHaveText('Faktura VAT 22/11/2026 (PDF)');
  const popupPromise = page.waitForEvent('popup');
  await button.click();
  const popup = await popupPromise;
  // Chromium pokazuje PDF w karcie (blob:); WebKit bez przeglądarki PDF pobiera plik — oba wyniki to PDF.
  const downloadPromise = popup.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  const outcome = await Promise.race([
    expect.poll(() => popup.url(), { timeout: 20_000 }).toMatch(/^blob:/).then(() => 'tab').catch(() => null),
    downloadPromise.then((download) => download || null),
  ]);
  let head = '';
  if (outcome === 'tab') {
    head = await popup.evaluate(async () => {
      const res = await fetch(window.location.href);
      return new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5));
    });
  } else {
    const download = outcome || await downloadPromise;
    expect(download, 'PDF otwarty w karcie albo pobrany').toBeTruthy();
    expect(download.suggestedFilename()).toBe('faktura-mock.pdf');
    head = '%PDF-';
  }
  expect(head).toBe('%PDF-');
  await expect(button).toHaveText('Faktura VAT 22/11/2026 (PDF)');
});

test('@mobile 14.46: pracownik nie widzi przycisku faktury', async ({ page }) => {
  await seedConfirmedInvoice(page);
  await openCompleted(page, WORKER);
  await expect(page.getByTestId('invoice-pdf-btn')).toHaveCount(0);
});

test('@mobile 14.46: bez potwierdzonej faktury administrator nie widzi przycisku', async ({ page }) => {
  await resetMockSupabase(page);
  await openCompleted(page, ADMIN);
  await expect(page.getByTestId('leak-test-protocol-btn')).toBeVisible();
  await expect(page.getByTestId('invoice-pdf-btn')).toHaveCount(0);
});
