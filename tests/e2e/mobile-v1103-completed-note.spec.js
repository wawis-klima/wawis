import { devices, expect, test } from '@playwright/test';
import { ADMIN, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const STORE_KEY = 'klima-mock-supabase-store-v3';

test.use(iphone14);

async function seedAdminNotes(page) {
  await resetMockSupabase(page);
  await page.evaluate((storeKey) => {
    const api = window.__KLIMA_MOCK_SUPABASE__;
    const store = api.getStore();
    const completedJob = store.jobs.find((job) => job.id === 'mock-job-003');
    const activeJob = store.jobs.find((job) => job.id === 'mock-job-002');
    completedJob.admin_note = 'Długi komentarz zakończonego montażu, który ma być domyślnie zwinięty.';
    activeJob.admin_note = 'Komentarz aktywnego montażu pozostaje od razu widoczny.';
    window.localStorage.setItem(storeKey, JSON.stringify(store));
  }, STORE_KEY);
}

test.describe('@mobile 11.03 zwarte dane i komentarz administratora', () => {
  test('zakończony montaż zwija komentarz, a aktywny pozostawia go otwarty', async ({ page }) => {
    await seedAdminNotes(page);
    await loginWithoutReset(page, ADMIN);

    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();

    const toggle = page.getByRole('button', { name: 'Rozwiń komentarz administratora' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Długi komentarz zakończonego montażu, który ma być domyślnie zwinięty.', { exact: true })).toHaveCount(0);

    await toggle.click();
    await expect(page.getByRole('button', { name: 'Zwiń komentarz administratora' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Długi komentarz zakończonego montażu, który ma być domyślnie zwinięty.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await expect(page.locator('.adminNoteToggle')).toHaveCount(0);
    await expect(page.getByText('Komentarz aktywnego montażu pozostaje od razu widoczny.', { exact: true })).toBeVisible();
  });

  test('e-mail i telefon są wyśrodkowane, a cztery podstawowe wiersze są niższe', async ({ page }) => {
    await seedAdminNotes(page);
    await loginWithoutReset(page, ADMIN);
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();

    await expect(page.locator('.contactEmailInfoItem .emailLink')).toBeVisible();
    await expect(page.locator('.contactPhoneInfoItem .phoneLink')).toBeVisible();
    await expect(page.locator('.contactAddressInfoItem .addressLink')).toBeVisible();

    const geometry = await page.locator('.mobileInlineJobDetails').evaluate((root) => {
      const centerDifference = (rowSelector, linkSelector) => {
        const value = root.querySelector(`${rowSelector} .infoValue`).getBoundingClientRect();
        const link = root.querySelector(linkSelector).getBoundingClientRect();
        return Math.abs((value.left + value.width / 2) - (link.left + link.width / 2));
      };
      const rowHeight = (selector) => root.querySelector(selector).getBoundingClientRect().height;
      return {
        emailCenterDifference: centerDifference('.contactEmailInfoItem', '.contactEmailInfoItem .emailLink'),
        phoneCenterDifference: centerDifference('.contactPhoneInfoItem', '.contactPhoneInfoItem .phoneLink'),
        rowHeights: [
          rowHeight('.contactEmailInfoItem'),
          rowHeight('.contactPhoneInfoItem'),
          rowHeight('.contactAddressInfoItem'),
          rowHeight('.jobDateInfoItemV995'),
        ],
      };
    });

    expect(geometry.emailCenterDifference).toBeLessThanOrEqual(2);
    expect(geometry.phoneCenterDifference).toBeLessThanOrEqual(2);
    expect(Math.max(...geometry.rowHeights)).toBeLessThanOrEqual(32);
  });
});
