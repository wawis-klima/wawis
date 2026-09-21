import { expect, test } from '@playwright/test';
import { ADMIN, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const STORE_KEY = 'klima-mock-supabase-store-v3';

async function seedCompactDetailsJob(page) {
  await resetMockSupabase(page);
  await page.evaluate((storeKey) => {
    const api = window.__KLIMA_MOCK_SUPABASE__;
    const store = api.getStore();
    const base = store.jobs.find((job) => job.id === 'mock-job-002');
    store.jobs.unshift({
      ...base,
      id: 'mock-job-v1100-compact',
      title: 'Paweł Kumor',
      client: 'Paweł Kumor',
      email: 'kumor.pawel@gmail.com',
      phone: '694 823 109',
      city: 'Szyce',
      street: 'Wesoła 4',
      location: 'Szyce, Wesoła 4',
      status: 'W trakcie',
      installation_date: '2026-09-17',
      devices: Array.from({ length: 4 }, (_, index) => ({
        device_type: 'single-split',
        outdoor_model: `T${index + 1}5Xo`,
        indoor_models: [`T${index + 1}5Xi`],
        outdoor_serial_number: `OUT-${index + 1}`,
        indoor_serial_numbers: [`IN-${index + 1}`],
      })),
      contractor_id: 'mock-contractor-v1100-compact',
    });
    store.contractors.unshift({
      id: 'mock-contractor-v1100-compact',
      company_name: 'Paweł Kumor',
      email: 'kumor.pawel@gmail.com',
      phone: '694 823 109',
      city: 'Szyce',
      street: 'Wesoła 4',
      is_active: true,
      created_at: '2026-09-17T06:00:00.000Z',
    });
    window.localStorage.setItem(storeKey, JSON.stringify(store));
  }, STORE_KEY);
}

test.describe('@mobile WAWIS 11.00 compact job details', () => {
  test('contact values and device headers stay readable in one line on iPhone width', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await seedCompactDetailsJob(page);
    await loginWithoutReset(page, ADMIN);

    const card = page.locator('.mobileJobCard').filter({ hasText: 'Paweł Kumor' }).first();
    await expect(card).toBeVisible();
    await card.locator('.mobileJobCardButton').click();

    const details = page.locator('.mobileInlineJobDetails');
    await expect(details).toBeVisible();
    await expect(details.locator('.jobDeviceDocumentationCard')).toHaveCount(4);

    const layout = await details.evaluate((root) => {
      const lineCount = (selector) => {
        const element = root.querySelector(selector);
        if (!element) return 0;
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      };
      const rows = [...root.querySelectorAll('.detailMeta > .infoItem:not(.jobDevicesDetailsItem)')]
        .slice(0, 3)
        .map((element) => Math.round(element.getBoundingClientRect().height));
      const deviceHeaders = [...root.querySelectorAll('.jobDeviceDocumentationTitle')].map((header) => {
        const name = header.querySelector('strong')?.getBoundingClientRect();
        const type = header.querySelector('.jobDeviceDocumentationType')?.getBoundingClientRect();
        const remove = header.querySelector('.jobDeviceDocumentationDeleteBtn')?.getBoundingClientRect();
        return {
          height: Math.round(header.getBoundingClientRect().height),
          sameLine: Boolean(name && type && remove
            && Math.abs(name.top - type.top) < 12
            && Math.abs(type.top - remove.top) < 12),
        };
      });
      return {
        emailLines: lineCount('.emailLink'),
        phoneLines: lineCount('.phoneLink'),
        addressLines: lineCount('.addressLink'),
        rows,
        deviceHeaders,
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(layout.emailLines).toBe(1);
    expect(layout.phoneLines).toBe(1);
    expect(layout.addressLines).toBe(1);
    expect(layout.rows.every((height) => height <= 48)).toBe(true);
    expect(layout.deviceHeaders.every(({ height, sameLine }) => height <= 46 && sameLine)).toBe(true);
    expect(layout.scrollWidth - layout.viewport).toBeLessThanOrEqual(2);
  });
});
