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

test.describe('@mobile 12.93 adres po prawej bez ucinania', () => {
  test('zawija długi adres po prawej od etykiety, zachowuje Google Maps i nie zmienia e-maila', async ({ page }) => {
    await seedAutoFitJob(page);
    await loginWithoutReset(page, ADMIN);
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();

    const email = page.locator('.contactEmailInfoItem .emailLink');
    const addressRow = page.locator('.contactAddressInfoItem');
    const address = addressRow.locator('.addressLink');
    const addressLabel = addressRow.locator('.infoLabel');

    await expect(email).toHaveAttribute('data-auto-fit', 'reduced');
    await expect(address).not.toHaveAttribute('data-auto-fit', /.+/);
    await expect(address).toHaveText('Zawiercie, Aleja Generała Władysława Sikorskiego 112a');
    await expect(address).toHaveCSS('white-space', 'normal');
    await expect(address).toHaveCSS('text-align', 'right');
    await expect(address).toHaveCSS('text-overflow', 'clip');
    await expect(address).toHaveCSS('font-size', '13.5px');
    await expect(address).toHaveAttribute('href', /Aleja/);
    const visual = await addressRow.evaluate((row) => {
      const label = row.querySelector('.infoLabel');
      const addressElement = row.querySelector('.addressLink');
      const labelRect = label.getBoundingClientRect();
      const addressRect = addressElement.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const style = getComputedStyle(addressElement);
      const rootRect = document.querySelector('.mobileInlineJobDetails').getBoundingClientRect();
      return {
        labelLeft: labelRect.left,
        labelRight: labelRect.right,
        labelBottom: labelRect.bottom,
        addressTop: addressRect.top,
        addressBottom: addressRect.bottom,
        addressHeight: addressRect.height,
        lineHeight: Number.parseFloat(style.lineHeight),
        rowRight: rowRect.right,
        rowBottom: rowRect.bottom,
        addressLeft: addressRect.left,
        addressRight: addressRect.right,
        rootRight: rootRect.right,
        scrollWidth: addressElement.scrollWidth,
        clientWidth: addressElement.clientWidth,
      };
    });
    expect(visual.addressLeft).toBeGreaterThanOrEqual(visual.labelRight);
    expect(visual.addressTop).toBeLessThanOrEqual(visual.labelBottom);
    expect(visual.rowRight - visual.addressRight).toBeLessThanOrEqual(2);
    expect(visual.addressHeight).toBeGreaterThan(visual.lineHeight * 1.5);
    expect(visual.rowBottom).toBeGreaterThanOrEqual(visual.addressBottom);
    expect(visual.addressRight).toBeLessThanOrEqual(visual.rootRight + 1);
    expect(visual.scrollWidth).toBeLessThanOrEqual(visual.clientWidth + 2);
    await expect(page.locator('.mobileInlineJobDetails .contactPhoneInfoItem')).toBeVisible();
    await expect(page.locator('.mobileInlineJobDetails .jobDateInfoItemV995')).toBeVisible();

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
    await expect(address).toHaveCSS('text-align', 'right');
    await expect(address).toHaveAttribute('href', /42-400%20Zawiercie%2C%20Armii%20Krajowej%2047%2F5/);
    const sizes = await address.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 2);
    await expect(page.locator('.mobileInlineJobDetails .contactEmailInfoItem')).toBeVisible();
    await expect(page.locator('.mobileInlineJobDetails .contactPhoneInfoItem')).toBeVisible();
  });
});
