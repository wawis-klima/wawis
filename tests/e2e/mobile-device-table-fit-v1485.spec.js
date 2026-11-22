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

// 14.86 (decyzja właściciela 22.11.2026): bez pustych napisów w szczegółach montażu.
for (const [label, credentials] of [['administrator', ADMIN], ['pracownik', WORKER]]) {
  test(`@mobile 14.86 ${label}: szczegóły montażu bez napisów o braku urządzeń i komentarzy`, async ({ page }) => {
    await openJob(page, credentials);
    const details = page.locator('.mobileInlineJobDetails').first();
    await expect(details.getByText('Komentarze i pytania')).toBeVisible();
    for (const text of ['Brak urządzeń.', 'Brak komentarzy.', 'Brak komentarza.']) {
      await expect(details.getByText(text, { exact: true })).toHaveCount(0);
    }
    if (await details.locator('.adminNoteText').count() === 0) {
      await expect(details.locator('.adminNoteDeleteBtn')).toHaveCount(0);
    }
  });
}

// 14.88 (decyzja właściciela 22.11.2026): nowe zlecenie — bez „Wprowadź głosowo” u góry, „Zamknij” obok zapisu;
// edycja administratora — NIP i „Szukaj w GUS” w jednej linii; szczegóły — bez napisu o braku zdjęć.
for (const [label, credentials, saveLabel] of [['administrator', ADMIN, 'Zapisz zlecenie'], ['pracownik', WORKER, 'Dodaj klienta']]) {
  test(`@mobile 14.88 ${label}: nowe zlecenie — Zamknij obok „${saveLabel}” na dole, bez wprowadzania głosowego u góry`, async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, credentials);
    await page.locator('.mobileActionBtn.primary.wawisOneLineAction').click();
    const modal = page.locator('.formModal');
    await expect(modal.locator('.jobHead h2')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Wprowadź głosowo', exact: true })).toHaveCount(0);
    const close = modal.locator('.jobFormEditActions').getByRole('button', { name: 'Zamknij', exact: true });
    const save = modal.locator('.jobFormEditActions').getByRole('button', { name: saveLabel, exact: true });
    await save.scrollIntoViewIfNeeded();
    const [c, s] = [await close.boundingBox(), await save.boundingBox()];
    expect(Math.abs((c.y + c.height / 2) - (s.y + s.height / 2))).toBeLessThanOrEqual(2);
    expect(c.x + c.width).toBeLessThanOrEqual(s.x);
    expect(Math.abs(c.height - s.height)).toBeLessThanOrEqual(1);
    await close.click();
    await expect(modal).toHaveCount(0);
  });
}

test('@mobile 14.88 administrator: edycja — NIP i „Szukaj w GUS” w jednej linii, szczegóły bez napisu o braku zdjęć', async ({ page }) => {
  await openJob(page, ADMIN);
  await expect(page.locator('.mobileInlineJobDetails').first().getByText('Brak zdjęć.', { exact: true })).toHaveCount(0);
  await page.locator('.mobileInlineJobDetails').getByRole('button', { name: 'Edytuj', exact: true }).first().click();
  const modal = page.locator('.formModal');
  await expect(modal.getByRole('heading', { name: 'Edytuj montaż' })).toBeVisible();
  const nip = await modal.locator('.jobNipCompactInput').boundingBox();
  const gus = await modal.getByRole('button', { name: 'Szukaj w GUS' }).boundingBox();
  const phone = await modal.getByLabel('Telefon klienta / SMS').boundingBox();
  expect(Math.abs(nip.y - gus.y)).toBeLessThanOrEqual(2);
  expect(nip.x + nip.width).toBeLessThanOrEqual(gus.x);
  expect(nip.y).toBeGreaterThan(phone.y + phone.height - 1);
});
