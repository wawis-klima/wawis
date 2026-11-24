// WAWIS 14.94 (decyzja właściciela 24.11.2026) — komputer, Montaże:
// bez górnego paska wyszukiwania, większe ikony statusów, filtr w jednym wierszu z ikonami.
import { expect, test } from '@playwright/test';
import { ADMIN, login, resetMockSupabase } from './mock-helpers.js';

test.use({ viewport: { width: 1536, height: 760 } });

test('14.94/14.95 komputer: Montaże — bez górnego wyszukiwania, większe ikony, filtr obok ikon', async ({ page }, testInfo) => {
  await resetMockSupabase(page);
  await login(page, ADMIN);
  await page.locator('.adminDesktopNavItem', { hasText: /^Montaże\d*$/ }).click();
  const row = page.locator('.desktopHeaderTopRowV1494');
  await expect(row).toBeVisible();

  await expect(page.locator('.adminDesktopGlobalSearchTopbar')).toHaveCount(0);
  await expect(page.getByPlaceholder(/Szukaj klienta, telefonu, adresu/)).toHaveCount(0);

  const icons = row.locator('.desktopInlineStatusButton');
  await expect(icons).toHaveCount(4);
  // 14.95: ikony 72 px (było 56; 88 px w 14.94 było za duże).
  for (let i = 0; i < 4; i += 1) {
    const box = await icons.nth(i).boundingBox();
    expect(Math.round(box.width), 'ikona statusu 72 px').toBe(72);
  }
  // 14.95: wersja i „+” w nagłówku „Montaże”, po prawej; nie ma ich już w wierszu ikon.
  const pageHeader = page.locator('.desktopJobsPageHeaderV1495');
  await expect(pageHeader.getByRole('heading', { name: 'Montaże', exact: true })).toBeVisible();
  await expect(pageHeader.locator('.desktopVersionTag')).toHaveText(/WERSJA \d+\.\d+/i);
  await expect(pageHeader.locator('button.desktopActionBtn.primary[title="Dodaj"]')).toBeVisible();
  await expect(row.locator('.desktopHeaderActionsBox')).toHaveCount(0);
  const headerBox = await pageHeader.boundingBox();
  const plusBox = await pageHeader.locator('button[title="Dodaj"]').boundingBox();
  expect(headerBox.x + headerBox.width - (plusBox.x + plusBox.width), '„+” przy prawej krawędzi nagłówka').toBeLessThan(40);
  // Licznik na ikonie: rozmiar liter bez zmian (11 px).
  expect(await row.locator('.statusActionBadge').first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('11px');

  const preview = (await page.screenshot({ type: 'jpeg', quality: 70, scale: 'css' })).toString('base64');
  const parts = Math.ceil(preview.length / 6000);
  for (let i = 0; i < parts; i += 1) console.log(`WAWIS-SHOT ${testInfo.project.name}/montaze-1494 ${i + 1}/${parts} ${preview.slice(i * 6000, (i + 1) * 6000)}`);
  const widths = await row.evaluate((el) => ({
    row: el.clientWidth,
    icons: el.querySelector('.desktopStatusInlineWrap').offsetWidth,
    filter: el.querySelector('.desktopFilterBoxV1494').offsetWidth,
  }));
  console.log(`WAWIS-HEADER ${JSON.stringify(widths)}`);

  const filter = row.locator('.desktopFilterBoxV1494');
  const filterBox = await filter.boundingBox();
  const iconsBox = await row.locator('.desktopStatusInlineWrap').boundingBox();
  const centre = (b) => b.y + b.height / 2;
  expect(Math.abs(centre(filterBox) - centre(iconsBox)), 'filtr w tym samym wierszu co ikony').toBeLessThan(12);
  expect(filterBox.x).toBeGreaterThan(iconsBox.x + iconsBox.width);
  await expect(page.locator('.desktopHeaderBottomRow')).toHaveCount(0);

  // Filtr działa jak wcześniej.
  await page.locator('.desktopFilterInput').fill('zzz-brak-takiego-klienta');
  await expect(page.getByText('Brak klientów pasujących do wyszukiwania.')).toBeVisible();
  await page.locator('.desktopFilterInput').fill('');

  // Szeroki ekran: ikony 88 px, filtr nadal obok.
  await page.setViewportSize({ width: 2400, height: 900 });
  const wide = await row.evaluate((el) => ({
    header: el.parentElement.clientWidth,
    icon: el.querySelector('.desktopInlineStatusButton').getBoundingClientRect().width,
    iconsTop: el.querySelector('.desktopStatusInlineWrap').getBoundingClientRect(),
    filterTop: el.querySelector('.desktopFilterBoxV1494').getBoundingClientRect(),
  }));
  console.log(`WAWIS-HEADER wide ${JSON.stringify({ header: wide.header, icon: wide.icon })}`);
  expect(Math.round(wide.icon)).toBe(72);
  const mid = (r) => r.top + r.height / 2;
  expect(Math.abs(mid(wide.filterTop) - mid(wide.iconsTop))).toBeLessThan(12);
});
