// WAWIS 14.97 (decyzja właściciela 24.11.2026): pasek „Brak internetu” WYŁĄCZNIE bez internetu,
// z liczbą zmian czekających na wysłanie. Z internetem — nic dodatkowego.
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);
const ONLINE_FLAG = 'klima-e2e-network-state';

async function installControllableNetworkState(page) {
  await page.addInitScript(({ flag }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() { return window.localStorage.getItem(flag) !== 'offline'; },
    });
  }, { flag: ONLINE_FLAG });
}

async function setOnline(page, isOnline) {
  await page.evaluate(({ flag, online }) => {
    window.localStorage.setItem(flag, online ? 'online' : 'offline');
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  }, { flag: ONLINE_FLAG, online: isOnline });
}

for (const [label, user] of [['pracownik', WORKER], ['administrator', ADMIN]]) {
  test(`@mobile 14.97 ${label}: pasek „Brak internetu” tylko bez internetu, z licznikiem zmian`, async ({ page }) => {
    await installControllableNetworkState(page);
    await resetMockSupabase(page);
    await loginWithoutReset(page, user);
    const banner = page.getByTestId('offline-banner');

    // Z internetem: brak paska.
    await expect(page.locator('.wawisUserInitialsBadge')).toBeVisible();
    await expect(banner).toHaveCount(0);

    // Bez internetu: pasek bez zmian w kolejce.
    await setOnline(page, false);
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText('Brak internetu · zmiany zapiszą się na telefonie');

    // Zmiana zapisana na telefonie → licznik.
    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await page.locator('.mobileInlineJobDetails').getByRole('button', { name: 'Edytuj', exact: true }).first().click();
    const modal = page.locator('.formModal');
    await modal.getByPlaceholder('Email klienta').fill('pasek.test@example.com');
    await modal.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
    await expect(modal.getByRole('heading', { name: 'Edytuj montaż' })).toHaveCount(0);
    await expect(banner).toHaveText('Brak internetu · 1 zmiana czeka na wysłanie');
    const contrast = await banner.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor, fontSize: s.fontSize };
    });
    console.log(`WAWIS-BANNER ${label} ${JSON.stringify(contrast)}`);

    // Internet wrócił: pasek znika, zmiana wysłana.
    await setOnline(page, true);
    await expect(banner).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__.getStore().jobs.find((job) => job.id === 'mock-job-002')?.email), { timeout: 20_000 }).toBe('pasek.test@example.com');
  });
}
