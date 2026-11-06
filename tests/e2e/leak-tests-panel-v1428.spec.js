import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';

// WAWIS 14.28 — zakładka „Próby szczelności” (komputer): lista zakończonych montaży z instalatorem,
// wpis daty, temperatury i wyniku z protokołu papierowego, PDF. Dane fikcyjne (mock).
test.describe('14.28: próby szczelności — komputer', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('lista, walidacja, zapis i PDF', async ({ page }, testInfo) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /^Próby szczelności$/ }).click();
    const panel = page.getByTestId('leak-tests-panel');
    const rows = panel.getByTestId('leak-test-row');
    await expect(panel.getByTestId('leak-tests-count')).toHaveText('Uzupełniono 0 z 1');
    await expect(rows).toHaveCount(1);
    const row = rows.first();
    await expect(row).toContainText('Klient Testowy C Zakończony');
    await expect(row.getByLabel('Data badania')).toHaveValue('2026-04-22');

    // Bez temperatury — nie zapisze.
    await row.getByRole('button', { name: 'Zapisz' }).click();
    await expect(row.getByRole('alert')).toContainText('Temperatura od -30 do 50');
    await expect(panel.getByTestId('leak-tests-count')).toHaveText('Uzupełniono 0 z 1');

    await row.getByLabel('Temperatura °C').fill('18,5');
    await row.getByRole('button', { name: 'Zapisz' }).click();
    await expect(row.getByRole('status')).toHaveText('Zapisano');
    await expect(panel.getByTestId('leak-tests-count')).toHaveText('Uzupełniono 1 z 1');

    await panel.getByRole('tab', { name: 'Uzupełnione' }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByLabel('Temperatura °C')).toHaveValue('18,5');
    await panel.getByRole('tab', { name: 'Do uzupełnienia' }).click();
    await expect(panel.getByText('Wszystkie montaże uzupełnione.')).toBeVisible();

    await panel.getByRole('tab', { name: 'Wszystkie' }).click();
    const popupPromise = page.waitForEvent('popup');
    await rows.first().getByRole('button', { name: 'PDF' }).click();
    const popup = await popupPromise;
    // PDF w karcie (blob:) albo pobrany (przeglądarka bez podglądu PDF) — w obu przypadkach sprawdzamy plik.
    const downloadPromise = popup.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
    const outcome = await Promise.race([
      expect.poll(() => popup.url(), { timeout: 20_000 }).toMatch(/^blob:/).then(() => 'tab').catch(() => null),
      downloadPromise,
    ]);
    let head = '';
    if (outcome === 'tab') {
      head = await popup.evaluate(async () => {
        const res = await fetch(window.location.href);
        return new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5));
      });
    } else {
      const download = outcome || await downloadPromise;
      const message = await panel.getByRole('alert').allTextContents().catch(() => []);
      expect(download, `PDF w karcie albo pobrany — popup=${popup.isClosed() ? 'zamknięty' : popup.url()} komunikat=${message.join(' / ') || '-'}`).toBeTruthy();
      const target = testInfo.outputPath('leak-test.pdf');
      await download.saveAs(target);
      head = fs.readFileSync(target).subarray(0, 5).toString();
    }
    expect(head).toBe('%PDF-');
  });
});
