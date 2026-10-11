import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function mountCard(page, user = WORKER, status = 'W trakcie', client = 'Klient Testowy B') {
  await resetMockSupabase(page);
  await loginWithoutReset(page, user);
  await page.locator('.statusActionButton[title="' + status + '"]').click();
  const card = page.locator('.mobileJobCard').filter({ hasText: client }).first();
  await expect(card).toBeVisible();
  return card;
}
async function openSheet(page, card) {
  await card.getByRole('button', { name: /Więcej opcji dla/ }).click();
  const sheet = page.locator('.wawisQuickSheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('@mobile WAWIS 13.07 dolny panel i animowane sekcje', () => {
  test('pracownik: panel ma działające skróty, prawdziwy hit-test i nie rozwija karty automatycznie', async ({ page }) => {
    const card = await mountCard(page);
    const sheet = await openSheet(page, card);
    await expect(page.locator('.mobileInlineJobDetails')).toHaveCount(0);
    await expect(sheet.getByRole('link', { name: 'Zadzwoń' })).toHaveAttribute('href', /^tel:/);
    await expect(sheet.getByRole('link', { name: 'Nawigacja' })).toHaveAttribute('href', /google\.com\/maps\/search/);
    await expect(sheet.getByRole('button', { name: 'Tabliczki' })).toBeEnabled();
    await expect(sheet.getByRole('button', { name: 'Protokół' })).toBeEnabled();
    const geometry = await sheet.evaluate((el) => {
      const button = el.querySelector('.wawisQuickSheetTile:not(:disabled)');
      const rect = button.getBoundingClientRect();
      return {
        hit: el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
        bottom: Math.round(el.getBoundingClientRect().bottom),
        viewport: window.innerHeight,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.hit).toBe(true);
    expect(Math.abs(geometry.bottom - geometry.viewport)).toBeLessThanOrEqual(2);
    expect(geometry.overflow).toBeLessThanOrEqual(2);
    await sheet.getByRole('button', { name: /Pokaż szczegóły montażu/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
  });

  test('panel zamyka się przyciskiem, tapnięciem tła i pociągnięciem uchwytu w dół', async ({ page }) => {
    const card = await mountCard(page);
    let sheet = await openSheet(page, card);
    await sheet.getByRole('button', { name: 'Zamknij szybkie działania' }).click();
    await expect(sheet).toHaveCount(0);
    sheet = await openSheet(page, card);
    await page.locator('.wawisQuickSheetOverlay').click({ position: { x: 5, y: 5 } });
    await expect(sheet).toHaveCount(0);
    sheet = await openSheet(page, card);
    const handle = sheet.locator('.wawisQuickSheetHandleArea');
    const bounds = await handle.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 12);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 130, { steps: 8 });
    await page.mouse.up();
    await expect(sheet).toHaveCount(0);
    await card.locator('.mobileJobCardButton').click();
    await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
  });

  test('obie role: zablokowane działania pozostają wyłączone również w dolnym panelu', async ({ page }) => {
    const adminCard = await mountCard(page, ADMIN);
    let sheet = await openSheet(page, adminCard);
    await expect(sheet.getByRole('button', { name: 'Tabliczki' })).toBeEnabled();
    await expect(sheet.getByRole('button', { name: 'Protokół' })).toBeDisabled();
    await sheet.getByRole('button', { name: 'Zamknij szybkie działania' }).click();
    const workerDone = await mountCard(page, WORKER, 'Zakończone', 'Klient Testowy C Zakończony');
    sheet = await openSheet(page, workerDone);
    await expect(sheet.getByRole('button', { name: 'Tabliczki' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Protokół' })).toBeEnabled();
  });

  test('Tabliczki z panelu uruchamiają istniejący kreator i jego Zamknij działa', async ({ page }) => {
    const card = await mountCard(page);
    const sheet = await openSheet(page, card);
    await sheet.getByRole('button', { name: 'Tabliczki' }).click();
    await expect(sheet).toHaveCount(0);
    const wizard = page.locator('.mobileDeviceWizardOverlay .mobileDeviceWizard');
    await expect(wizard).toBeVisible({ timeout: 20000 });
    await wizard.locator('.mobileDeviceWizardClose').click();
    await expect(wizard).toHaveCount(0);
  });

  test('urządzenia: panel składa się i rozkłada bez odmontowania dokumentacji', async ({ page }) => {
    const card = await mountCard(page, WORKER, 'W trakcie', 'Klient Testowy Multi-Split');
    await card.locator('.mobileJobCardButton').click();
    const toggle = page.locator('.jobDeviceDocumentationToggle').first();
    await expect(toggle).toBeVisible();
    const target = page.locator('.jobDeviceDocumentationCard .wawisSmoothCollapse').first();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(target).toHaveAttribute('aria-hidden', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(target).toHaveClass(/isOpen/);
    const before = await target.locator('.jobDeviceDocumentationBody').count();
    expect(before).toBe(1);
    await toggle.click();
    await expect(target).not.toHaveClass(/isOpen/);
    await expect(target).toHaveAttribute('aria-hidden', 'true');
    await expect(target.locator('.jobDeviceDocumentationBody')).toHaveCount(1);
  });

  test('zakończone: zdjęcia, komentarz i monterzy mają dwukierunkową animację', async ({ page }) => {
    const card = await mountCard(page, ADMIN, 'Zakończone', 'Klient Testowy C Zakończony');
    await card.locator('.mobileJobCardButton').click();
    const photos = page.locator('.photosSectionToggle');
    await expect(photos).toBeVisible();
    const photoContent = page.locator('[id^="photos-content-"].wawisSmoothCollapse');
    const prior = await photos.getAttribute('aria-expanded');
    await photos.click();
    await expect(photos).toHaveAttribute('aria-expanded', prior === 'true' ? 'false' : 'true');
    await expect(photoContent).toHaveAttribute('aria-hidden', prior === 'true' ? 'true' : 'false');
    await photos.click();
    await expect(photos).toHaveAttribute('aria-expanded', prior);
    const noteToggle = page.getByRole('button', { name: /komentarz administratora/i });
    await noteToggle.click();
    await expect(page.locator('[id^="admin-note-content-"]')).toHaveClass(/isOpen/);
    await noteToggle.click();
    await expect(page.locator('[id^="admin-note-content-"]')).not.toHaveClass(/isOpen/);
  });
});
