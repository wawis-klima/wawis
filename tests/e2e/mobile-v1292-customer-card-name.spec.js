import { devices, expect, test } from '@playwright/test';
import { ADMIN, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const STORE_KEY = 'klima-mock-supabase-store-v3';
const FULL_NAME = 'PRZEDSIĘBIORSTWO HANDLOWE "POWERMAT" TADEUSZ BIJAK, MONIKA BIJAK, KRYSTIAN BIJAK SPÓŁKA JAWNA';

test.use(iphone14);

test.describe('@mobile 12.92 długie nazwy klientów na kartach montaży', () => {
  test('wyświetla POWERMAT jako POWERMAT bez zmiany pełnej nazwy oraz zachowuje klikalność', async ({ page }) => {
    await resetMockSupabase(page);
    await page.evaluate(({ storeKey, fullName }) => {
      const store = window.__KLIMA_MOCK_SUPABASE__.getStore();
      const job = store.jobs.find((item) => item.id === 'mock-job-002');
      job.client = fullName;
      job.title = fullName;
      job.status = 'W trakcie';
      window.localStorage.setItem(storeKey, JSON.stringify(store));
    }, { storeKey: STORE_KEY, fullName: FULL_NAME });
    await loginWithoutReset(page, ADMIN);

    const card = page.locator('.mobileJobCard').filter({ has: page.locator('.mobileJobClient', { hasText: 'POWERMAT' }) }).first();
    const label = card.locator('.mobileJobClient');
    await expect(label).toHaveText('POWERMAT');
    await expect(label).toHaveAttribute('title', FULL_NAME);
    await expect(label).toHaveAttribute('aria-label', FULL_NAME);
    await expect(label).toHaveCSS('-webkit-line-clamp', '2');

    const geometry = await card.evaluate((node) => {
      const label = node.querySelector('.mobileJobClient');
      const button = node.querySelector('.mobileJobCardButton');
      const date = node.querySelector('.mobileJobDate');
      const left = label.getBoundingClientRect();
      const right = date.getBoundingClientRect();
      const bounds = button.getBoundingClientRect();
      const sample = document.elementFromPoint(bounds.left + 15, bounds.top + 15);
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        labelDateOverlap: left.right > right.left + 1 && left.top < right.bottom && left.bottom > right.top,
        clickable: button.contains(sample),
      };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(2);
    expect(geometry.labelDateOverlap).toBe(false);
    expect(geometry.clickable).toBe(true);

    await card.locator('.mobileJobCardButton').click();
    await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
    const savedName = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__.getStore().jobs.find((job) => job.id === 'mock-job-002').client);
    expect(savedName).toBe(FULL_NAME);
  });

  test('długie nazwy bez marki zajmują najwyżej dwa wiersze, zwykłe nazwy pozostają bez zmian', async ({ page }) => {
    await resetMockSupabase(page);
    await page.evaluate((key) => {
      const store = window.__KLIMA_MOCK_SUPABASE__.getStore();
      const job = store.jobs.find((item) => item.id === 'mock-job-002');
      job.client = 'PRZEDSIĘBIORSTWO HANDLOWE TADEUSZ BIJAK, MONIKA BIJAK, KRYSTIAN BIJAK SPÓŁKA JAWNA';
      job.title = job.client;
      job.status = 'W trakcie';
      window.localStorage.setItem(key, JSON.stringify(store));
    }, STORE_KEY);
    await loginWithoutReset(page, ADMIN);
    const label = page.locator('.mobileJobCard .mobileJobClient').filter({ hasText: 'PRZEDSIĘBIORSTWO HANDLOWE' }).first();
    await expect(label).toContainText('sp.j.');

    const size = await label.evaluate((node) => {
      const style = getComputedStyle(node);
      return { height: node.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(size.height).toBeLessThanOrEqual(size.lineHeight * 2 + 2);
    expect(size.overflow).toBeLessThanOrEqual(2);
    await page.locator('.statusActionButton[title="Nowe"]').click();
    await expect(page.locator('.mobileJobCard .mobileJobClient').filter({ hasText: 'Klient Testowy A' }).first()).toHaveText('Klient Testowy A');
  });
});
