import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login } from './mock-helpers.js';

// WAWIS 14.08 — naklejki QR: pracownik przypisuje naklejkę przy montażu (opcjonalnie),
// zeskanowany adres otwiera montaż, obca naklejka jest odrzucana. Dane wyłącznie fikcyjne (mock).
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function openMultiJobDevice(page) {
  await page.getByText('Klient Testowy Multi-Split', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Rozwiń Urządzenie 1' }).click();
  return page.getByTestId('job-device-qr-sticker').first();
}

async function enterStickerCode(page, value) {
  const dialog = page.locator('.qrScannerModal');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Albo wpisz numer spod kodu').fill(value);
  await dialog.getByRole('button', { name: 'Zatwierdź' }).click();
  return dialog;
}

test.describe('@mobile 14.08: naklejki QR', () => {
  test('pracownik przypisuje naklejkę do instalacji multi, skan adresu otwiera montaż', async ({ page }) => {
    await login(page, WORKER);
    const row = await openMultiJobDevice(page);
    await expect(row).toContainText('Naklejka QR: brak');

    await row.getByRole('button', { name: 'Przypisz naklejkę QR' }).click();
    let dialog = await enterStickerCode(page, '0000-0000');
    await expect(dialog.getByRole('alert')).toContainText('Wpisz 8 znaków z naklejki');

    dialog = await enterStickerCode(page, 'zzzz-zzzz');
    await expect(dialog.getByRole('alert')).toContainText('nie pochodzi z naklejek WAWIS');

    await enterStickerCode(page, 'uye8-eycq');
    await expect(page.locator('.qrScannerModal')).toHaveCount(0);
    await expect(row).toContainText('Naklejka QR: UYE8-EYCQ');
    await expect(row).toContainText('Przypisano naklejkę UYE8-EYCQ do Urządzenia 1.');
    // 14.21 (decyzja właściciela): bez znaczka QR w nagłówku urządzenia — naklejka tylko w sekcji „Naklejka QR”.
    await expect(page.locator('.qrStickerBadge')).toHaveCount(0);
    // Jedna naklejka na zestaw: pracownik nie wymienia ani nie zwalnia naklejki.
    await expect(row.getByRole('button')).toHaveCount(0);

    // Zeskanowanie aparatem: /u/KOD → 404.html → /?qr=KOD
    await page.goto('/?qr=UYE8EYCQ');
    const resolver = page.getByTestId('qr-sticker-resolver');
    await expect(resolver).toContainText('Naklejka UYE8-EYCQ');
    await expect(resolver).toContainText('Klient Testowy Multi-Split');
    await expect(resolver).toContainText('Urządzenie 1');
    await expect(page).not.toHaveURL(/qr=/);
    await resolver.getByRole('button', { name: 'Otwórz montaż' }).click();
    await expect(page.locator('.detailTitle')).toHaveText('Klient Testowy Multi-Split');

    // Wolna naklejka: informacja, jak ją przypisać.
    await page.goto('/?qr=BNKJXZDY');
    await expect(page.getByTestId('qr-sticker-resolver')).toContainText('nie jest jeszcze przypisana');
    await page.getByTestId('qr-sticker-resolver').getByRole('button', { name: 'Zamknij' }).click();
  });

  test('obcy kod z adresu i naklejka zajęta — komunikaty, bez zmian', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/?qr=ZZZZZZZZ');
    await expect(page.getByTestId('qr-sticker-resolver')).toContainText('To nie jest naklejka WAWIS');
    await page.getByTestId('qr-sticker-resolver').getByRole('button', { name: 'Zamknij' }).click();
    // Po zamknięciu kod nie wraca po odświeżeniu.
    await page.reload();
    await expect(page.getByTestId('qr-sticker-resolver')).toHaveCount(0);

    const row = await openMultiJobDevice(page);
    await row.getByRole('button', { name: 'Przypisz naklejkę QR' }).click();
    await enterStickerCode(page, 'CXFB-EHEP');
    await expect(row).toContainText('Naklejka QR: CXFB-EHEP');
    // Administrator: „Wymień” — odmowa przy anulowaniu potwierdzenia nic nie zmienia.
    page.once('dialog', (dialog) => dialog.dismiss());
    await row.getByRole('button', { name: 'Wymień' }).click();
    const dialog = await enterStickerCode(page, 'UYE8EYCQ');
    await expect(dialog.getByRole('alert')).toContainText('Anulowano');
    await dialog.getByRole('button', { name: 'Zamknij' }).click();
    await expect(row).toContainText('Naklejka QR: CXFB-EHEP');
  });
});
