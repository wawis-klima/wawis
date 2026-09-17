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
      title: 'KOROŚ PAWEŁ',
      client: 'KOROŚ PAWEŁ',
      email: 'obracamy360@gmail.com',
      phone: '792404929',
      city: 'Parkoszowice',
      street: 'Krajobrazowa 39',
      location: 'Parkoszowice, Krajobrazowa 39',
      status: 'W trakcie',
      installation_date: '2026-09-09',
      device_model: '',
      device_serial_number: '',
      admin_note: 'Montaż Kaset Mitsubishi Rusztowanie w razie czego 3 wysokości blat pod rusztowanie Instalacji 2 x po 8-10 metrów 1 kpl około 5 mb Normalnie nawigacja źle pokazuje jak to na Krajobrazowej link do adresu https://maps.app.goo.gl/pYtbjZTkYRLFqtYa7?g_st=ic',
      contractor_id: 'mock-contractor-v1092-overflow',
    });
    store.contractors.unshift({
      id: 'mock-contractor-v1092-overflow',
      company_name: 'KOROŚ PAWEŁ',
      email: 'obracamy360@gmail.com',
      phone: '792404929',
      city: 'Parkoszowice',
      street: 'Krajobrazowa 39',
      is_active: true,
      created_at: '2026-09-09T06:00:00.000Z',
    });
    window.localStorage.setItem(storeKey, JSON.stringify(store));
  }, storeKey);
}

test.describe('@mobile 10.92 full WebKit layout', () => {
  test('pełny widok Koroś nie może poszerzyć ekranu iPhone', async ({ page }) => {
    await seedOverflowJob(page);
    await loginWithoutReset(page, ADMIN);

    await expect(page.getByText('KOROŚ PAWEŁ', { exact: true }).first()).toBeVisible();
    const card = page.locator('.mobileJobCard').filter({ hasText: 'KOROŚ PAWEŁ' }).first();
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
