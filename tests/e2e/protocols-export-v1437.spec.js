import { expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';
import { listZipEntryNames } from '../../src/modules/zip-store.js';

// WAWIS 14.37 — zakładka „Protokoły” (nad Diagnostyką): pobieranie zbiorcze ZIP z zakresem dat. Dane fikcyjne.
test.use({ viewport: { width: 1440, height: 1000 } });

test('14.37: Protokoły — menu nad Diagnostyką, ZIP z protokołami montażu i szczelności', async ({ page }) => {
  await page.route(/open-meteo\.com/, (route) => route.abort());
  await login(page, ADMIN);
  await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
    store.leak_test_records = [{ job_id: 'mock-job-003', test_date: '2026-05-06', temperature_c: 12, result: 'pozytywny', updated_at: '2026-05-06T12:00:00Z', signed_at: '2026-05-06T10:00:00Z' }];
  }));

  // Menu: „Protokoły” bezpośrednio nad „Diagnostyka”; brak starej pozycji.
  // textContent (nie innerText) — menu pokazuje etykiety wielkimi literami (CSS text-transform).
  const labels = await page.locator('.adminDesktopSidebar button, .adminDesktopSidebar a').allTextContents();
  const clean = labels.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean);
  expect(clean).toContain('Protokoły');
  expect(clean.indexOf('Diagnostyka') - clean.indexOf('Protokoły')).toBe(1);
  expect(clean).not.toContain('Próby szczelności');

  await page.getByRole('button', { name: /^Protokoły$/ }).click();
  const card = page.getByTestId('protocols-export-card');
  await expect(card).toContainText('Pobierz protokoły z wybranego okresu');
  await expect(page.getByTestId('leak-tests-panel')).toContainText('Próby szczelności — poprawki');

  // Pusty zakres → przycisk nieaktywny.
  await card.getByLabel('Od').fill('2020-01-01');
  await card.getByLabel('Do').fill('2020-01-31');
  await expect(card.getByTestId('protocols-export-download')).toHaveText('Pobierz ZIP (0)');
  await expect(card.getByTestId('protocols-export-download')).toBeDisabled();
  // Odwrócony zakres → komunikat.
  await card.getByLabel('Od').fill('2026-06-01');
  await card.getByLabel('Do').fill('2026-05-01');
  await expect(card.getByRole('alert')).toContainText('Data „od” jest późniejsza niż „do”.');

  await card.getByRole('button', { name: 'Wszystkie' }).click();
  await expect(card.getByLabel('Od')).toHaveValue('');
  await expect(card).toContainText('Protokoły montażu (1)');
  await expect(card).toContainText('Protokoły szczelności (1)');
  const downloadPromise = page.waitForEvent('download');
  await card.getByTestId('protocols-export-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('wawis-protokoly-wszystkie.zip');
  const path = await download.path();
  const bytes = new Uint8Array(await (await import('node:fs/promises')).readFile(path));
  const names = listZipEntryNames(bytes);
  expect(names).toHaveLength(2);
  expect(names[0]).toMatch(/^Protokoły montażu\/\d{4}-\d{2}-\d{2} Klient Testowy C Zakończony, Gdańsk\.pdf$/);
  expect(names[1]).toBe('Protokoły szczelności/2026-05-06 Klient Testowy C Zakończony, Gdańsk.pdf');
  await expect(card.getByTestId('protocols-export-result')).toContainText('protokoły montażu: 1, szczelności: 1');

  // Tylko szczelność.
  await card.getByLabel(/^Protokoły montażu/).uncheck();
  await expect(card.getByTestId('protocols-export-download')).toHaveText('Pobierz ZIP (1)');
});
