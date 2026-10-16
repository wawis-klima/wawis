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

async function swipe(page, frame, dx) {
  const bounds = await frame.boundingBox();
  const x = bounds.x + bounds.width * (dx > 0 ? 0.25 : 0.65);
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up();
}

test.describe('@mobile WAWIS 13.10 — brak zdublowanego menu, gesty i sekcje', () => {
  test('na obu rolach nie ma trzech kropek ani dolnego panelu; karta ma całą powierzchnię klikalną', async ({ page }) => {
    for (const user of [WORKER, ADMIN]) {
      const card = await mountCard(page, user);
      await expect(card.locator('.wawisQuickMenuTrigger')).toHaveCount(0);
      await expect(page.locator('.wawisQuickSheet')).toHaveCount(0);
      await expect(page.locator('.wawisQuickSheetOverlay')).toHaveCount(0);
      await expect(card.getByRole('button', { name: /Więcej opcji dla/ })).toHaveCount(0);
      const top = card.locator('.mobileJobTop');
      const rightInset = await top.evaluate(el => getComputedStyle(el).paddingRight);
      expect(rightInset).not.toBe('32px');
      await card.locator('.mobileJobCardButton').click();
      await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
      await card.locator('.mobileJobCardButton').click();
      await expect(page.locator('.wawisInlineJobMotion.isOpen')).toHaveCount(0);
      await expect(page.locator('.mobileInlineJobDetails')).toHaveCount(0);
    }
  });

  test('zachowane przesunięcia w obu kierunkach i uprawnienia dla urządzeń/protokołu', async ({ page }) => {
    const card = await mountCard(page);
    const frame = card.locator('xpath=..').locator('xpath=..');
    await swipe(page, frame, -110);
    await expect(frame).toHaveClass(/isLeftOpen/);
    await expect(frame.getByRole('link', { name: 'Zadzwoń do klienta' })).toHaveAttribute('href', /^tel:/);
    await expect(frame.getByRole('link', { name: 'Nawiguj do klienta' })).toHaveAttribute('href', /google\.com\/maps\/search/);
    await swipe(page, frame, 115);
    await expect(frame).not.toHaveClass(/isOpen/);
    await swipe(page, frame, 108);
    await expect(frame).toHaveClass(/isRightOpen/);
    await expect(frame.getByRole('button', { name: 'Otwórz tabliczki montażu' })).toBeEnabled();
    await expect(frame.getByRole('button', { name: 'Otwórz protokół montażu' })).toBeDisabled();
    await frame.getByRole('button', { name: 'Otwórz tabliczki montażu' }).click();
    const wizard = page.locator('.mobileDeviceWizardOverlay .mobileDeviceWizard');
    await expect(wizard).toBeVisible({ timeout: 20000 });
    await wizard.locator('.mobileDeviceWizardClose').click();
    await expect(wizard).toHaveCount(0);
  });

  test('urządzenia: panel składa się płynnie i odtwarza dokumentację po rozwinięciu', async ({ page }) => {
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
    await expect(target.locator('.deviceUnitDocumentationRow').first()).toBeHidden();
    await toggle.click();
    await expect(target.locator('.deviceUnitDocumentationRow').first()).toBeVisible();
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
