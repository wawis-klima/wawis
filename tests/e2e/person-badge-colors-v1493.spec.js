// WAWIS 14.93 (decyzja właściciela 23.11.2026): kółko z inicjałami w górnym pasku telefonu ma kolor tej osoby,
// taki sam jak jej plakietka w kartach montaży — w trybie jasnym i ciemnym.
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';
import { shot } from './dark-theme-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

const BADGE_CLASSES = ['badgeBlue', 'badgeGreen', 'badgeAmber', 'badgePurple', 'badgePink', 'badgeSlate', 'badgeRed'];

// Kolory kółka w pasku i wzorcowej plakietki z tą samą klasą (jak w karcie montażu).
async function compareWithCardBadge(page) {
  return page.locator('.wawisUserInitialsBadge').evaluate((el, classes) => {
    const cls = classes.find((c) => el.classList.contains(c)) || '';
    const probe = document.createElement('span');
    probe.className = `initialBadge ${cls}`;
    probe.textContent = 'XX';
    document.body.appendChild(probe);
    const pick = (node) => { const s = getComputedStyle(node); return { bg: s.backgroundColor, border: s.borderTopColor, color: s.color }; };
    const result = { cls, top: pick(el), card: pick(probe) };
    probe.remove();
    return result;
  }, BADGE_CLASSES);
}

for (const [label, user] of [['administrator', ADMIN], ['pracownik', WORKER]]) {
  test(`@mobile 14.93 ${label}: kółko w pasku w kolorze osoby (jasny i ciemny)`, async ({ page }, testInfo) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, user);
    await expect(page.locator('.wawisUserInitialsBadge')).toBeVisible();

    const light = await compareWithCardBadge(page);
    expect(light.cls, 'kółko ma klasę koloru osoby').not.toBe('');
    expect(light.top).toEqual(light.card);
    await shot(page, testInfo, `${label}-jasny`);

    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await compareWithCardBadge(page);
    expect(dark.cls).toBe(light.cls);
    expect(dark.top).toEqual(dark.card);
    expect(dark.top.bg).not.toBe(light.top.bg);
    await shot(page, testInfo, `${label}-ciemny`);
    console.log(`WAWIS-BADGE ${label} ${JSON.stringify({ light, dark })}`);
  });
}

test('@mobile 14.93 czerwona plakietka (Piotr Wasik) czytelna w obu motywach', async ({ page }) => {
  await resetMockSupabase(page);
  await loginWithoutReset(page, ADMIN);
  const read = () => page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'initialBadge badgeRed';
    probe.textContent = 'PW';
    document.body.appendChild(probe);
    const s = getComputedStyle(probe);
    const out = { bg: s.backgroundColor, color: s.color };
    probe.remove();
    return out;
  });
  const light = await read();
  expect(light).toEqual({ bg: 'rgb(254, 226, 226)', color: 'rgb(153, 27, 27)' });
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await read();
  expect(dark).toEqual({ bg: 'rgb(63, 21, 21)', color: 'rgb(234, 134, 134)' });
});
