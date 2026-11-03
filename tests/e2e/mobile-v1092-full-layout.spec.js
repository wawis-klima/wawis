import { expect, test } from '@playwright/test';
import { ADMIN, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const STORE_KEY = 'klima-mock-supabase-store-v3';

async function seedOverflowJob(page) {
  await resetMockSupabase(page);
  await page.evaluate((storeKey) => {
    const api = window.__KLIMA_MOCK_SUPABASE__;
    const store = api.getStore();
    const base = store.jobs.find((job) => job.id === 'mock-job-002');
    store.jobs.unshift({
      ...base,
      id: 'mock-job-v1092-overflow',
      title: 'NOWAŚ PAWEŁ',
      client: 'NOWAŚ PAWEŁ',
      email: 'klient360@example.com',
      phone: '500000929',
      city: 'Przykładowka',
      street: 'Testowa Długa 9',
      location: 'Przykładowka, Testowa Długa 9',
      status: 'W trakcie',
      installation_date: '2026-09-09',
      device_model: '',
      device_serial_number: '',
      admin_note: 'Montaż Kaset Mitsubishi Rusztowanie w razie czego 3 wysokości blat pod rusztowanie Instalacji 2 x po 8-10 metrów 1 kpl około 5 mb Normalnie nawigacja źle pokazuje jak to na Testowej Dług link do adresu https://maps.app.goo.gl/TESTxTESTxTESTxTE?g_st=ic',
      contractor_id: 'mock-contractor-v1092-overflow',
    });
    store.contractors.unshift({
      id: 'mock-contractor-v1092-overflow',
      company_name: 'NOWAŚ PAWEŁ',
      email: 'klient360@example.com',
      phone: '500000929',
      city: 'Przykładowka',
      street: 'Testowa Długa 9',
      is_active: true,
      created_at: '2026-09-09T06:00:00.000Z',
    });
    window.localStorage.setItem(storeKey, JSON.stringify(store));
  }, STORE_KEY);
}

test.describe('@mobile 10.92 full WebKit layout', () => {
  test('pełny widok Nowaś nie może poszerzyć ekranu iPhone', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Pełny layout 10.92 jest testem WebKit/iPhone; Chromium ma osobne regresje mobilne.');
    await seedOverflowJob(page);
    await loginWithoutReset(page, ADMIN);

    await expect(page.getByText('NOWAŚ PAWEŁ', { exact: true }).first()).toBeVisible();
    const card = page.locator('.mobileJobCard').filter({ hasText: 'NOWAŚ PAWEŁ' }).first();
    await card.locator('.mobileJobCardButton').click();
    await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll('body *')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            cls: String(element.className || '').slice(0, 160),
            width: Math.round(rect.width * 10) / 10,
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
          };
        })
        .filter((item) => item.width > 0 && (item.right > viewport + 2 || item.width > viewport + 2))
        .sort((a, b) => b.right - a.right)
        .slice(0, 20);
      return {
        viewport,
        scrollWidth: document.documentElement.scrollWidth,
        offenders,
      };
    });

    console.log('v10.92 full WebKit geometry', JSON.stringify(geometry, null, 2));
    expect(geometry.scrollWidth - geometry.viewport).toBeLessThanOrEqual(2);
    expect(geometry.offenders).toEqual([]);
  });
});
