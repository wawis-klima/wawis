import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function openDeviceCard(page) {
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  const card = page.locator('.mobileJobCard').filter({ hasText: 'Klient Testowy Multi-Split' }).first();
  await card.locator('.mobileJobCardButton').click();
  const toggle = page.locator('.jobDeviceDocumentationToggle').first();
  const section = page.locator('.jobDeviceDocumentationCard .wawisSmoothCollapse').first();
  await expect(toggle).toBeVisible();
  return { card, toggle, section };
}

test.describe('@mobile WAWIS 13.08 płynność przejścia na iPhonie', () => {
  test('urządzenia faktycznie animują wysokość w obie strony przez ponad 0,35 s', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const { toggle, section } = await openDeviceCard(page);
    const initial = await section.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      duration: getComputedStyle(el).transitionDuration,
    }));
    expect(initial.height).toBeLessThan(1);
    expect(initial.duration).toContain('0.44s');
    await toggle.click();
    await expect(section).toHaveClass(/isOpen/);
    await page.waitForTimeout(140);
    const halfwayUp = await section.evaluate((el) => el.getBoundingClientRect().height);
    await page.waitForTimeout(420);
    const fullyOpen = await section.evaluate((el) => el.getBoundingClientRect().height);
    expect(fullyOpen).toBeGreaterThan(halfwayUp + 1);
    expect(halfwayUp).toBeGreaterThan(1);
    const row = section.locator('.deviceUnitDocumentationRow').first();
    await expect(row).toBeVisible();

    await toggle.click();
    await expect(section).not.toHaveClass(/isOpen/);
    await page.waitForTimeout(140);
    const halfwayDown = await section.evaluate((el) => el.getBoundingClientRect().height);
    expect(halfwayDown).toBeLessThan(fullyOpen - 1);
    expect(halfwayDown).toBeGreaterThan(1);
    await expect(row).toBeHidden();
    await toggle.click();
    await expect(row).toBeVisible();
  });

  test('zakończone: animacja komentarza i obrót strzałki działają bez zmian ról', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await resetMockSupabase(page);
    await loginWithoutReset(page, ADMIN);
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    const card = page.locator('.mobileJobCard').filter({ hasText: 'Klient Testowy C Zakończony' }).first();
    await card.locator('.mobileJobCardButton').click();
    const toggle = page.getByRole('button', { name: 'Rozwiń komentarz administratora' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const arrow = toggle.locator('.adminNoteToggleChevron');
    await expect(arrow).toBeVisible();
    await toggle.click();
    await expect(page.locator('[id^="admin-note-content-"]')).toHaveClass(/isOpen/);
    const style = await arrow.evaluate(el => ({ duration: getComputedStyle(el).transitionDuration, transform: getComputedStyle(el).transform }));
    expect(style.duration).toContain('0.4s');
    await expect(page.locator('[id^="admin-note-content-"]')).toHaveAttribute('aria-hidden', 'false');
    await page.getByRole('button', { name: 'Zwiń komentarz administratora' }).click();
    await expect(page.locator('[id^="admin-note-content-"]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[id^="admin-note-content-"] .adminNoteContent')).toHaveCount(0);
  });

  test('iOS Ogranicz ruch: bez animacji, zawartość nadal otwiera się i zamyka', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { toggle, section } = await openDeviceCard(page);
    const duration = await section.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(',').every((value) => value.trim() === '0s')).toBe(true);
    await toggle.click();
    await expect(section.locator('.deviceUnitDocumentationRow').first()).toBeVisible();
    await toggle.click();
    await expect(section.locator('.deviceUnitDocumentationRow').first()).toBeHidden();
  });
});
