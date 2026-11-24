// WAWIS 15.00 (decyzja właściciela 24.11.2026): niższy pasek modułów, większe ikony statusów (telefon).
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';
import { shot } from './dark-theme-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

for (const [label, user] of [['administrator', ADMIN], ['pracownik', WORKER]]) {
  test(`@mobile 15.00 ${label}: niższy pasek modułów, ikony statusów 74 px, litery bez zmian`, async ({ page }, testInfo) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, user);
    const switcher = page.locator('.moduleSwitcher.moduleSwitcherMobile');
    await expect(switcher).toBeVisible();
    await expect(page.locator('.mobileJobsShellV959 .statusActionButton .statusActionImage')).toHaveCount(4);
    await page.waitForTimeout(400);
    const sizes = await page.evaluate(() => {
      const bar = document.querySelector('.moduleSwitcher.moduleSwitcherMobile');
      const btn = bar.querySelector('.moduleSwitcherBtn');
      const icons = [...document.querySelectorAll('.mobileJobsShellV959 .statusActionButton .statusActionImage')];
      return {
        barHeight: Math.round(bar.getBoundingClientRect().height),
        btnFont: getComputedStyle(btn).fontSize,
        icons: icons.map((img) => Math.round(img.getBoundingClientRect().width)),
        iconTops: icons.map((img) => Math.round(img.getBoundingClientRect().top)),
        viewport: document.documentElement.clientWidth,
        rightmost: Math.max(...icons.map((img) => img.getBoundingClientRect().right)),
      };
    });
    console.log(`WAWIS-TOP ${label} ${JSON.stringify(sizes)}`);
    // Przed 15.00: 56 px (administrator), 54 px (pracownik).
    expect(sizes.barHeight, 'pasek modułów niższy').toBeLessThanOrEqual(46);
    // Wielkość liter bez zmian (jak przed 15.00 na iPhonie 14: administrator 13.845 px, pracownik 15.015 px).
    expect(sizes.btnFont).toBe(user === ADMIN ? '13.845px' : '15.015px');
    expect(sizes.icons).toHaveLength(4);
    // Aktywna ikona jest powiększona (scale 1.16) — sprawdzamy nieaktywne.
    const sorted = [...sizes.icons].sort((a, b) => a - b);
    expect(sorted[0]).toBeGreaterThanOrEqual(70);
    expect(sorted[0]).toBeLessThanOrEqual(75);
    expect(new Set(sizes.iconTops.map((top) => Math.round(top / 10))).size, 'ikony w jednym rzędzie').toBe(1);
    expect(sizes.rightmost).toBeLessThanOrEqual(sizes.viewport);
    await shot(page, testInfo, `top-${label}`);
  });
}
