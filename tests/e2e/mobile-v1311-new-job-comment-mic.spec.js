import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function createModal(page, who) {
  await resetMockSupabase(page);
  await loginWithoutReset(page, who);
  await page.getByRole('button', { name: /Dodaj zlecenie|Dodaj nowego klienta/ }).first().click();
  const modal = page.locator('.formModal').first();
  await expect(modal).toBeVisible();
  return modal;
}

test.describe('@mobile WAWIS 13.11 komentarz głosowy w nowym montażu', () => {
  for (const [roleName, who] of [['administrator', ADMIN], ['pracownik', WORKER]]) {
    test(roleName + ': mikrofon działa obok Komentarza, bez ograniczenia szerokości pola', async ({ page }) => {
      const modal = await createModal(page, who);
      const mic = modal.getByRole('button', { name: 'Nagraj głosowo: Komentarz do montażu' });
      const comment = modal.locator('textarea[placeholder="Komentarz do montażu"]');
      await expect(mic).toBeVisible();
      await expect(mic).toBeEnabled();
      await expect(comment).toBeVisible();
      await expect(modal.getByRole('button', { name: /Zapisz zlecenie|Dodaj klienta/ })).toBeEnabled();
      const geometry = await modal.evaluate(el => {
        const rect = (selector) => el.querySelector(selector).getBoundingClientRect();
        const title = rect('.workerNewClientCommentLabelRow > span');
        const mic = rect('.workerNewClientCommentMicActions .voiceFieldMicBtn');
        const textarea = rect('.workerNewClientCommentTextarea');
        const parent = rect('.workerNewClientCommentBlock');
        return {
          micLeft: mic.left, titleRight: title.right, micRight: mic.right,
          parentRight: parent.right, textWidth: textarea.width, parentWidth: parent.width,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      expect(geometry.micLeft).toBeGreaterThanOrEqual(geometry.titleRight - 2);
      expect(geometry.micRight).toBeLessThanOrEqual(geometry.parentRight + 2);
      expect(Math.abs(geometry.textWidth - geometry.parentWidth)).toBeLessThanOrEqual(3);
      expect(geometry.overflow).toBeLessThanOrEqual(2);
      await comment.fill('Komentarz wpisany ręcznie');
      await expect(modal.locator('.workerNewClientCommentLabelRow .fieldClearBtn')).toBeVisible();
      await mic.click();
      const dialog = page.getByRole('dialog', { name: 'Nagrywanie: Komentarz do montażu' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Anuluj' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(comment).toHaveValue('Komentarz wpisany ręcznie');
    });
  }

  test('dyktowany tekst dopisywany jest do komentarza, bez zamiany na komentarz administratora', async ({ page }) => {
    await page.addInitScript(() => {
      class MockRecognition {
        start() {
          window.setTimeout(() => {
            this.onresult?.({
              resultIndex: 0,
              results: [{ isFinal: true, length: 1, 0: { transcript: 'Dodatkowy opis montażu' } }],
            });
          }, 50);
        }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      }
      window.SpeechRecognition = MockRecognition;
    });
    const modal = await createModal(page, ADMIN);
    const comment = modal.locator('textarea[placeholder="Komentarz do montażu"]');
    await comment.fill('Wpis ręczny');
    await modal.getByRole('button', { name: 'Nagraj głosowo: Komentarz do montażu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nagrywanie: Komentarz do montażu' });
    await expect(dialog.getByText(/Dodatkowy opis montażu/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Zakończ nagrywanie' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(comment).toHaveValue('Wpis ręczny\nDodatkowy opis montażu');
    await expect(modal.locator('.adminNoteTextareaCompact')).toHaveCount(0);
  });
});
