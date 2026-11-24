// TYMCZASOWE (14.97, diagnostyka): co dzieje się z kreatorem urządzeń po zdarzeniu offline.
import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _d, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

test('@mobile DEBUG 14.97 kreator po offline', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() { return window.localStorage.getItem('klima-e2e-network-state') !== 'offline'; },
    });
  });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => logs.push(`PAGEERROR ${String(e?.stack || e).slice(0, 600)}`));
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) logs.push(`NAV ${f.url()}`); });
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();
  await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  await page.locator('.mobileDeviceOverviewOpen').first().click();
  await page.locator('.mobileMultiIndoorCard').first().click();
  const before = await page.locator('.nameplateGalleryInput').count();
  await page.evaluate(() => {
    window.localStorage.setItem('klima-e2e-network-state', 'offline');
    window.dispatchEvent(new Event('offline'));
  });
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({
    gallery: document.querySelectorAll('.nameplateGalleryInput').length,
    wizard: document.querySelectorAll('.mobileDeviceWizard').length,
    banner: document.querySelectorAll('.wawisOfflineBanner').length,
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500),
  }));
  console.log(`WAWIS-DEBUG before=${before} ${JSON.stringify(after)}`);
  console.log(`WAWIS-DEBUG-LOGS ${JSON.stringify(logs).slice(0, 4000)}`);
  const shot = (await page.screenshot({ type: 'jpeg', quality: 60, scale: 'css' })).toString('base64');
  for (let i = 0; i < Math.ceil(shot.length / 6000); i += 1) console.log(`WAWIS-SHOT dbg ${i + 1}/${Math.ceil(shot.length / 6000)} ${shot.slice(i * 6000, (i + 1) * 6000)}`);
  expect(before).toBeGreaterThan(0);
});
