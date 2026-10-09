import { devices, expect, test } from '@playwright/test';
import { ADMIN, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const STORE_KEY = 'klima-mock-supabase-store-v3';

test.use(iphone14);

async function seedAutoFitJob(page) {
  await resetMockSupabase(page);
  await page.evaluate((storeKey) => {
    const store = window.__KLIMA_MOCK_SUPABASE__.getStore();
    const job = store.jobs.find((item) => item.id === 'mock-job-003');
    job.email = 'pawel.gruca.zawiercie.paderewskiego112a@onet.pl';
    job.city = 'Zawiercie';
    job.street = 'Aleja Generała Władysława Sikorskiego 112a';
    job.location = 'Zawiercie, Aleja Generała Władysława Sikorskiego 112a';
    window.localStorage.setItem(storeKey, JSON.stringify(store));
  }, STORE_KEY);
}

test.describe('@mobile 11.04 automatyczne dopasowanie kontaktu', () => {
  test('zmniejsza tylko przepełniony e-mail i adres oraz zachowuje jedną linię', async ({ page }) => {
    await seedAutoFitJob(page);
    await loginWithoutReset(page, ADMIN);
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();

    const email = page.locator('.contactEmailInfoItem .emailLink');
    const address = page.locator('.contactAddressInfoItem .addressLink');
    await expect(email).toHaveAttribute('data-auto-fit', 'reduced');
    await expect(address).toHaveAttribute('data-auto-fit', 'reduced');

    const geometry = await page.locator('.mobileInlineJobDetails').evaluate((root) => {
      const inspect = (selector, maximumFontSize) => {
        const element = root.querySelector(selector);
        const container = element.parentElement;
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
          height: element.getBoundingClientRect().height,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          containerWidth: container.clientWidth,
          maximumFontSize,
        };
      };
      return {
        email: inspect('.contactEmailInfoItem .emailLink', 12.5),
        address: inspect('.contactAddressInfoItem .addressLink', 13.5),
      };
    });

    for (const item of [geometry.email, geometry.address]) {
      expect(item.fontSize).toBeGreaterThanOrEqual(10.5);
      expect(item.fontSize).toBeLessThan(item.maximumFontSize);
      expect(item.height).toBeLessThan(item.lineHeight * 1.6);
      expect(item.clientWidth).toBeLessThanOrEqual(item.containerWidth + 1);
    }

    await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    const regularEmail = page.locator('.contactEmailInfoItem .emailLink');
    await expect(regularEmail).toHaveAttribute('data-auto-fit', 'default');
    await expect(regularEmail).toHaveCSS('font-size', '12.5px');
  });
});

test.describe('@mobile 12.90 skrócony adres na karcie montażu', () => {
  test('usuwa kod pocztowy z listy i szczegółów, zachowując pełny adres w linku Google Maps', async ({ page }) => {
    await resetMockSupabase(page);
    await page.evaluate((storeKey) => {
      const store = window.__KLIMA_MOCK_SUPABASE__.getStore();
      const job = store.jobs.find((item) => item.id === 'mock-job-003');
      job.city = '42-400 Zawiercie';
      job.street = 'Armii Krajowej 47/5';
      job.location = '42-400 Zawiercie, Armii Krajowej 47/5';
      window.localStorage.setItem(storeKey, JSON.stringify(store));
    }, STORE_KEY);

    await loginWithoutReset(page, ADMIN);
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    const card = page.locator('.mobileJobCard').filter({ hasText: 'Klient Testowy C Zakończony' });
    await expect(card.locator('.mobileJobAddressValue')).toHaveText('Zawiercie, Armii Krajowej 47/5');
    await card.locator('.mobileJobCardButton').click();

    const address = page.locator('.mobileInlineJobDetails .contactAddressInfoItem .addressLink');
    await expect(address).toHaveText('Zawiercie, Armii Krajowej 47/5');
    await expect(address).toHaveAttribute('href', /42-400%20Zawiercie%2C%20Armii%20Krajowej%2047%2F5/);
    const sizes = await address.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 2);
    await expect(page.locator('.mobileInlineJobDetails .contactEmailInfoItem')).toBeVisible();
    await expect(page.locator('.mobileInlineJobDetails .contactPhoneInfoItem')).toBeVisible();
  });
});
