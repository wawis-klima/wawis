// WAWIS 14.85 (zgłoszenie właściciela 22.11.2026, zrzut z iPhone'a):
// 1) tabela tabliczek w karcie urządzenia mieści się w szerokości (znacznik ✓ nie wystaje poza kartę),
//    bez dublującego napisu „Zapisano w systemie” (zostaje dla czytnika ekranu);
// 2) w edycji montażu „Zamknij” i „Zapisz zmiany” są obok siebie na dole okna.
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function openJob(page, credentials) {
  await resetMockSupabase(page);
  await loginWithoutReset(page, credentials);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).click();
  await expect(page.locator('.mobileInlineJobDetails').first()).toBeVisible();
}

for (const [label, credentials] of [['administrator', ADMIN], ['pracownik', WORKER]]) {
  test(`@mobile 14.85 ${label}: tabela tabliczek mieści się w karcie urządzenia`, async ({ page }) => {
    await openJob(page, credentials);
    const toggle = page.locator('.jobDeviceDocumentationToggle').first();
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    const table = page.locator('.jobDeviceDocumentationCard.isExpanded').first();
    await expect(table.locator('.deviceUnitDocumentationRow').first()).toBeVisible();
    const fit = await table.evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const rows = [...card.querySelectorAll('.deviceUnitDocumentationRow')].map((row) => {
        const r = row.getBoundingClientRect();
        const state = row.querySelector('.deviceUnitDocumentationState').getBoundingClientRect();
        const model = row.querySelector('.deviceUnitDocumentationModel').getBoundingClientRect();
        return { rowRight: r.right, stateRight: state.right, stateLeft: state.left, modelRight: model.right, stateWidth: state.width };
      });
      const header = [...card.querySelectorAll('.deviceUnitDocumentationTableHeader > span')].map((s) => s.textContent.trim());
      return { cardRight: cardRect.right, rows, header };
    });
    expect(fit.header).toEqual(['Urządzenie', 'Model / moc', 'Tabliczka']);
    expect(fit.rows.length).toBeGreaterThan(0);
    for (const row of fit.rows) {
      expect(row.stateWidth).toBeGreaterThan(20);
      expect(row.stateRight, 'znacznik tabliczki mieści się w wierszu').toBeLessThanOrEqual(row.rowRight + 0.5);
      expect(row.stateRight, 'znacznik tabliczki mieści się w karcie').toBeLessThanOrEqual(fit.cardRight + 0.5);
      expect(row.modelRight).toBeLessThanOrEqual(row.stateLeft + 0.5);
    }
  });

  test(`@mobile 14.85 ${label}: edycja montażu — Zamknij i Zapisz zmiany obok siebie na dole`, async ({ page }) => {
    await openJob(page, credentials);
    const edit = page.locator('.mobileInlineJobDetails').getByRole('button', { name: 'Edytuj', exact: true }).first();
    await edit.click();
    const modal = page.locator('.formModal');
    await expect(modal.getByRole('heading', { name: 'Edytuj montaż' })).toBeVisible();
    await expect(modal.locator('.jobHead > .btn')).toHaveCount(0);
    const close = modal.locator('.jobFormEditActions').getByRole('button', { name: 'Zamknij', exact: true });
    const save = modal.locator('.jobFormEditActions').getByRole('button', { name: 'Zapisz zmiany', exact: true });
    await save.scrollIntoViewIfNeeded();
    const [c, s] = [await close.boundingBox(), await save.boundingBox()];
    expect(c && s).toBeTruthy();
    expect(Math.abs((c.y + c.height / 2) - (s.y + s.height / 2))).toBeLessThanOrEqual(2);
    expect(c.x + c.width).toBeLessThanOrEqual(s.x);
    expect(Math.abs(c.width - s.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(c.height - s.height)).toBeLessThanOrEqual(1);
    await close.click();
    await expect(modal.getByRole('heading', { name: 'Edytuj montaż' })).toHaveCount(0);
  });
}
