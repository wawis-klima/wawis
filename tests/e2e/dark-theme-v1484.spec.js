// WAWIS 14.84 — motyw ciemny „Grafit z czerwienią” na telefonie (decyzja właściciela 22.11.2026).
// Przełącznik w nagłówku zamiast „Synchronizuj dane”: zmienia wygląd bez przeładowania, zapamiętuje wybór,
// a w motywie ciemnym tekst na głównych ekranach jest czytelny (kontrast liczony z wyglądu w przeglądarce).
// Zrzuty ekranów (test-results/…/*.png) służą do przeglądu wyglądu przed wdrożeniem.
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';
import { expectReadable, shot } from './dark-theme-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

test.describe('@mobile 14.84 motyw ciemny', () => {
  test('administrator: przełącznik, zapamiętanie wyboru i czytelność głównych ekranów', async ({ page }, testInfo) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, ADMIN);
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Synchronizuj dane' })).toHaveCount(0);
    await shot(page, testInfo, '00-jasny-lista');
    const lightCard = await page.locator('.mobileJobCard').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lightCard).toBe('rgb(255, 255, 255)');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Włącz tryb jasny');
    const cardBg = () => page.locator('.mobileJobCard').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await cardBg()).toBe('rgb(24, 24, 26)');
    expect(await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'))).toBe('#0c0c0d');
    expectReadable(await shot(page, testInfo, '01-ciemny-lista'), 'lista montaży');

    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await expect(page.locator('.mobileInlineJobDetails').first()).toBeVisible();
    expectReadable(await shot(page, testInfo, '02-ciemny-szczegoly'), 'szczegóły montażu');
    // 14.87: zaznaczeni monterzy wyraźnie inni niż niezaznaczeni (czerwone wypełnienie vs grafit).
    const chips = await page.locator('.viewerDot').evaluateAll((els) => els.map((el) => ({ active: el.classList.contains('active'), bg: getComputedStyle(el).backgroundColor })));
    expect(chips.some((c) => c.active)).toBe(true);
    expect(chips.some((c) => !c.active)).toBe(true);
    for (const c of chips) expect(c.bg).toBe(c.active ? 'rgb(220, 38, 38)' : 'rgb(31, 31, 34)');
    await page.evaluate(() => window.scrollBy(0, 500));
    await shot(page, testInfo, '03-ciemny-szczegoly-dol');

    // Zapamiętanie po ponownym uruchomieniu.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.wawisVersionDiagnosticsButton').click();
    await expect(page.getByTestId('diagnostics-actions-card')).toBeVisible();
    expectReadable(await shot(page, testInfo, '04-ciemny-diagnostyka'), 'diagnostyka');
    await page.locator('.wawisVersionDiagnosticsButton').click();

    await page.getByRole('button', { name: 'Dodaj zlecenie' }).click();
    await page.waitForTimeout(400);
    expectReadable(await shot(page, testInfo, '05-ciemny-nowe-zlecenie'), 'nowe zlecenie');
    await page.keyboard.press('Escape');
    await page.reload();

    // Powrót do jasnego: bez atrybutu, wygląd jak przed 14.84, wybór zapamiętany.
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    expect(await page.locator('.mobileJobCard').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(lightCard);
  });

  test('pracownik: ciemna lista i szczegóły są czytelne', async ({ page }, testInfo) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expectReadable(await shot(page, testInfo, '10-pracownik-lista'), 'lista pracownika');
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await expect(page.locator('.mobileInlineJobDetails').first()).toBeVisible();
    expectReadable(await shot(page, testInfo, '11-pracownik-szczegoly'), 'szczegóły pracownika');
  });
});
