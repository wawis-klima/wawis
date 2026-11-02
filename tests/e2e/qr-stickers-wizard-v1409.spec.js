import { devices, expect, test } from '@playwright/test';
import { WORKER, login } from './mock-helpers.js';

// WAWIS 14.09 — naklejka QR w kreatorze urządzeń (krok 2 z 4), opcjonalna, jedna na instalację multi;
// przypisanie po „Zapisz urządzenia i tabliczki”, kompaktowa linia w karcie montażu. Dane fikcyjne (mock).
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

const wizard = (page) => page.locator('.mobileDeviceWizardOverlay .mobileDeviceWizard');

test('@mobile 14.09: pracownik skanuje naklejkę w kreatorze urządzeń, zapis przypisuje ją do montażu', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
  await login(page, WORKER);
  await page.getByText('Klient Testowy Multi-Split', { exact: true }).first().click();
  await page.getByRole('button', { name: /^(Tabliczki|Urządzenia)$/ }).first().click();
  const w = wizard(page);
  await expect(w.getByRole('heading', { name: 'Urządzenia', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(w.locator('.mobileDeviceOverviewQr').first()).toHaveText('Bez naklejki QR');

  // Krok 2 (multi): jedna karta naklejki na cały zestaw, opcjonalna.
  await w.locator('.mobileDeviceOverviewOpen').first().click();
  await expect(w.getByText('Tryb: Multi', { exact: true })).toBeVisible();
  const card = w.getByTestId('wizard-qr-sticker');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('opcjonalnie');
  const cardBox = await card.boundingBox();
  expect(cardBox.height).toBeLessThanOrEqual(90);

  await card.getByRole('button', { name: 'Zeskanuj' }).click();
  const scanner = page.locator('.qrScannerModal');
  await scanner.getByLabel('Albo wpisz numer spod kodu').fill('zzzz-zzzz');
  await scanner.getByRole('button', { name: 'Zatwierdź' }).click();
  await expect(scanner.getByRole('alert')).toContainText('nie pochodzi z naklejek WAWIS');
  await scanner.getByLabel('Albo wpisz numer spod kodu').fill('bnkj-xzdy');
  await scanner.getByRole('button', { name: 'Zatwierdź' }).click();
  await expect(scanner).toHaveCount(0);
  await expect(card).toContainText('BNKJ-XZDY · przypisze się po zapisaniu urządzeń');

  await w.getByRole('button', { name: 'Dalej do podsumowania' }).click();
  await expect(w.locator('.mobileDeviceOverviewQr').first()).toHaveText('QR: BNKJ-XZDY (do zapisania)');
  await w.locator('.mobileDeviceWizardFooter .btn.primary').click();
  const confirmWarning = page.getByRole('button', { name: 'Zapisz mimo ostrzeżenia', exact: true });
  if (await confirmWarning.isVisible().catch(() => false)) await confirmWarning.click();
  await expect(wizard(page)).toHaveCount(0, { timeout: 30_000 });
  expect(dialogs.join(' | ')).not.toContain('Naklejki QR nie przypisano');

  // Karta montażu: znaczek przy urządzeniu bez rozwijania, kompaktowa linia po rozwinięciu.
  await expect(page.locator('.qrStickerBadge').first()).toHaveText('QR BNKJ-XZDY', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Rozwiń Urządzenie 1' }).click();
  const row = page.getByTestId('job-device-qr-sticker').first();
  await expect(row).toContainText('Naklejka QR: BNKJ-XZDY');
  const rowBox = await row.boundingBox();
  expect(rowBox.height).toBeLessThanOrEqual(60);

  // Ponowne otwarcie kreatora: naklejka przypisana, bez przycisku skanowania.
  await page.getByRole('button', { name: /^(Tabliczki|Urządzenia)$/ }).first().click();
  await expect(w.locator('.mobileDeviceOverviewQr').first()).toHaveText('QR: BNKJ-XZDY');
  await w.locator('.mobileDeviceOverviewOpen').first().click();
  await expect(w.getByTestId('wizard-qr-sticker')).toContainText('BNKJ-XZDY · przypisana');
  await expect(w.getByTestId('wizard-qr-sticker').getByRole('button')).toHaveCount(0);
});
