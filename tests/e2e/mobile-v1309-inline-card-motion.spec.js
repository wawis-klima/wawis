import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function openList(page, role = WORKER, status = 'W trakcie', name = 'Klient Testowy B') {
  await resetMockSupabase(page);
  await loginWithoutReset(page, role);
  await page.locator('.statusActionButton[title="' + status + '"]').click();
  const card = page.locator('.mobileJobCard').filter({ hasText: name }).first();
  await expect(card).toBeVisible();
  return card;
}

test.describe('@mobile WAWIS 13.09 — płynne szczegóły całej karty', () => {
  test('pracownik: naprawdę animuje wysokość otwierania i zamykania całych szczegółów', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const card = await openList(page);
    await card.locator('.mobileJobCardButton').click();
    const wrapper = page.locator('.wawisInlineJobMotion').first();
    await expect(wrapper).toBeVisible();
    await expect(wrapper).toHaveClass(/isOpen/);
    const duration = await wrapper.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toContain('0.52s');
    await page.waitForTimeout(150);
    const midOpen = await wrapper.evaluate((el) => el.getBoundingClientRect().height);
    await page.waitForTimeout(490);
    const fullyOpen = await wrapper.evaluate((el) => el.getBoundingClientRect().height);
    expect(fullyOpen).toBeGreaterThan(midOpen + 2);
    expect(midOpen).toBeGreaterThan(1);
    await expect(wrapper.locator('.mobileInlineJobDetails')).toBeVisible();

    await card.locator('.mobileJobCardButton').click();
    await expect(card.locator('.mobileJobCardButton')).toHaveAttribute('aria-expanded', 'false');
    await expect(wrapper).not.toHaveClass(/isOpen/);
    // The panel stays mounted during closing instead of disappearing instantly.
    await expect(wrapper.locator('.mobileInlineJobDetails')).toHaveCount(1);
    await page.waitForTimeout(150);
    const midClose = await wrapper.evaluate((el) => el.getBoundingClientRect().height);
    expect(midClose).toBeLessThan(fullyOpen - 2);
    expect(midClose).toBeGreaterThan(1);
    await expect(page.locator('.mobileInlineJobDetails')).toHaveCount(0);
    await card.locator('.mobileJobCardButton').click();
    await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
  });

  test('administrator: Zakończone rozwija się i chowa zarówno z karty jak z przycisku Zamknij', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const card = await openList(page, ADMIN, 'Zakończone', 'Klient Testowy C Zakończony');
    await card.locator('.mobileJobCardButton').click();
    const details = page.locator('.mobileInlineJobDetails');
    await expect(details).toBeVisible();
    await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
    const wrapper = page.locator('.wawisInlineJobMotion');
    await expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    await expect(wrapper.locator('.mobileInlineJobDetails')).toHaveCount(1);
    await expect(details).toHaveCount(0);
    await card.locator('.mobileJobCardButton').click();
    await expect(details).toBeVisible();
  });

  test('iOS Ogranicz ruch: animacja wyłączona, otwieranie i zamykanie nadal działa', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const card = await openList(page);
    await card.locator('.mobileJobCardButton').click();
    const wrapper = page.locator('.wawisInlineJobMotion');
    await expect(wrapper).toBeVisible();
    const durations = await wrapper.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(durations.split(',').every((duration) => duration.trim() === '0s')).toBe(true);
    await card.locator('.mobileJobCardButton').click();
    await expect(page.locator('.mobileInlineJobDetails')).toHaveCount(0);
  });
});
