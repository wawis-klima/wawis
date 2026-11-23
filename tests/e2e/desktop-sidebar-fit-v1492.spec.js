// WAWIS 14.92 (decyzja właściciela 23.11.2026): menu boczne komputera bez „Szablony SMS” i bez przewijania.
// Szablony zostają w module SMS („Zarządzaj szablonami SMS”).
import { expect, test } from '@playwright/test';
import { ADMIN, login, resetMockSupabase } from './mock-helpers.js';

const sidebarFit = (page) => page.locator('.adminDesktopSidebar').evaluate((el) => ({
  scrollHeight: el.scrollHeight,
  clientHeight: el.clientHeight,
  fontSize: getComputedStyle(el.querySelector('.adminDesktopNavItem')).fontSize,
}));

test.use({ viewport: { width: 1536, height: 760 } });

test('14.92 komputer: menu boczne bez Szablonów SMS mieści się bez przewijania', async ({ page }, testInfo) => {
  await resetMockSupabase(page);
  await login(page, ADMIN);
  const sidebar = page.locator('.adminDesktopSidebar');
  await expect(sidebar.getByTestId('desktop-theme-toggle')).toBeVisible();
  await expect(sidebar.locator('.adminDesktopNavItem', { hasText: /^Szablony SMS$/ })).toHaveCount(0);
  // Zgłoszenia i SMS mogą mieć licznik (liczba za nazwą).
  for (const label of ['Centrum 360', 'Montaże', 'Kalendarz', 'Urządzenia', 'Tankowania', 'Kontrahenci', 'Zgłoszenia', 'SMS', 'Protokoły', 'Diagnostyka']) {
    await expect(sidebar.locator('.adminDesktopNavItem', { hasText: new RegExp(`^${label}\\d*$`) })).toHaveCount(1);
  }

  // Ekran laptopa (1080p, skala 125%, z paskami przeglądarki): całe menu bez przewijania.
  const fit = await sidebarFit(page);
  console.log(`WAWIS-SIDEBAR ${testInfo.project.name} 1536x760 ${JSON.stringify(fit)}`);
  expect(fit.scrollHeight, 'menu boczne nie przewija się').toBeLessThanOrEqual(fit.clientHeight + 1);
  // Rozmiar liter bez zmian (decyzja właściciela 20.11.2026).
  expect(fit.fontSize).toBe('17px');
  await page.screenshot({ path: testInfo.outputPath('menu-760.png') });
  const preview = (await page.screenshot({ type: 'jpeg', quality: 70, scale: 'css' })).toString('base64');
  const parts = Math.ceil(preview.length / 6000);
  for (let i = 0; i < parts; i += 1) console.log(`WAWIS-SHOT ${testInfo.project.name}/menu-760 ${i + 1}/${parts} ${preview.slice(i * 6000, (i + 1) * 6000)}`);

  // Szablony SMS nadal w module SMS.
  await sidebar.locator('.adminDesktopNavItem', { hasText: /^SMS\d*$/ }).click();
  await expect(page.getByRole('button', { name: 'Zarządzaj szablonami SMS' })).toBeVisible();

  // Informacyjnie: najmniejsza wysokość okna bez przewijania menu.
  for (const height of [720, 700, 680, 660]) {
    await page.setViewportSize({ width: 1536, height });
    console.log(`WAWIS-SIDEBAR ${testInfo.project.name} 1536x${height} ${JSON.stringify(await sidebarFit(page))}`);
  }
});
