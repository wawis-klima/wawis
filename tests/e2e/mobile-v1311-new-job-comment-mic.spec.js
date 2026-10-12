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
      const label = roleName === 'administrator' ? 'Komentarz administratora' : 'Komentarz do montażu';
      const mic = modal.getByRole('button', { name: `Nagraj głosowo: ${label}` });
      const comment = modal.locator(`textarea[placeholder="${label}"]`);
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
          micWidth: mic.width, micHeight: mic.height,
          rowHeight: rect('.workerNewClientCommentLabelRow').height,
          micHitTarget: (() => {
            const button = el.querySelector('.workerNewClientCommentMicActions .voiceFieldMicBtn');
            const hit = document.elementFromPoint(mic.left + mic.width / 2, mic.top + mic.height / 2);
            return hit === button || button.contains(hit);
          })(),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      expect(geometry.micLeft).toBeGreaterThanOrEqual(geometry.titleRight - 2);
      expect(geometry.micRight).toBeLessThanOrEqual(geometry.parentRight + 2);
      expect(Math.abs(geometry.textWidth - geometry.parentWidth)).toBeLessThanOrEqual(3);
      expect(geometry.overflow).toBeLessThanOrEqual(2);
      expect(geometry.micWidth).toBeLessThanOrEqual(30);
      expect(geometry.micHeight).toBeLessThanOrEqual(30);
      expect(geometry.rowHeight).toBeLessThanOrEqual(32);
      expect(geometry.micHitTarget).toBe(true);
      await comment.fill('Komentarz wpisany ręcznie');
      await expect(modal.locator('.workerNewClientCommentLabelRow .fieldClearBtn')).toBeVisible();
      await mic.click();
      const dialog = page.getByRole('dialog', { name: `Nagrywanie: ${label}` });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Anuluj' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(comment).toHaveValue('Komentarz wpisany ręcznie');
    });
  }

  test('administrator: dyktowany tekst trafia do komentarza administratora', async ({ page }) => {
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
    const comment = modal.locator('textarea[placeholder="Komentarz administratora"]');
    await comment.fill('Wpis ręczny');
    await modal.getByRole('button', { name: 'Nagraj głosowo: Komentarz administratora' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nagrywanie: Komentarz administratora' });
    await expect(dialog.getByText(/Dodatkowy opis montażu/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Zakończ nagrywanie' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(comment).toHaveValue('Wpis ręczny\nDodatkowy opis montażu');
    await expect(modal.locator('.adminNoteTextareaCompact')).toHaveCount(0);
  });
});
