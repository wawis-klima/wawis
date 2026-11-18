import fs from 'node:fs';
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

test('@mobile 14.46: administrator otwiera PDF faktury z Fakturowni', async ({ page }, testInfo) => {
  await seedConfirmedInvoice(page);
  const consoleLines = [];
  page.on('console', (msg) => { if (['error', 'warning'].includes(msg.type())) consoleLines.push(`${msg.type()}: ${msg.text()}`); });
  page.on('pageerror', (err) => consoleLines.push(`pageerror: ${err.message}`));
  await openCompleted(page, ADMIN);
  const button = page.getByTestId('invoice-pdf-btn');
  await expect(button).toHaveText('Faktura VAT 22/11/2026 (PDF)');
  // Atrapa odpowiada natychmiast — pobieranie może się zacząć, zanim test dostanie uchwyt nowej karty.
  // Nasłuch pobrań na każdej karcie kontekstu rejestrujemy PRZED kliknięciem.
  const downloads = [];
  page.context().on('page', (opened) => opened.on('download', (download) => downloads.push(download)));
  const popupPromise = page.waitForEvent('popup');
  await button.click();
  const popup = await popupPromise;
  // Chromium pokazuje PDF w karcie (blob:) albo go pobiera; WebKit pobiera plik (bez nazwy) — sprawdzamy treść.
  const outcome = await expect.poll(() => {
    if (downloads.length) return 'download';
    return /^blob:/.test(popup.isClosed() ? '' : popup.url()) ? 'tab' : '';
  }, { timeout: 20_000 }).toMatch(/^(tab|download)$/).then(() => (downloads.length ? downloads[0] : 'tab')).catch(() => null);
  let pdf;
  if (outcome === 'tab') {
    const bytes = await popup.evaluate(async () => {
      const res = await fetch(window.location.href);
      return Array.from(new Uint8Array(await res.arrayBuffer()));
    });
    pdf = Buffer.from(bytes);
  } else {
    const download = outcome;
    const panelMessage = await page.locator('.mobileInlineJobDetails .protocolActionMessage[role="alert"]').allTextContents().catch(() => []);
    const diagnostics = `popup=${popup.isClosed() ? 'zamknięty' : popup.url()} | komunikat=${panelMessage.join(' / ') || '-'} | konsola=${consoleLines.slice(-6).join(' || ') || '-'}`;
    console.log(`DIAG 14.46 PDF: ${diagnostics}`);
    expect(download, `PDF otwarty w karcie albo pobrany — ${diagnostics}`).toBeTruthy();
    const target = testInfo.outputPath('faktura.pdf');
    await download.saveAs(target);
    pdf = fs.readFileSync(target);
  }
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
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
