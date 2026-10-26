import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.76 — test iPhone 26.10.2026 (13.75, tryb samolotowy): Diagnostyka nie była w telefonie i jej otwarcie
// dawało CAŁKOWICIE BIAŁY EKRAN. Druga linia obrony: gdy pliku ekranu nie da się pobrać, komunikat zamiast
// białego ekranu, a reszta aplikacji działa. Plik ekranu blokujemy celowo (bez service workera).
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use({ ...iphone14, serviceWorkers: 'block' });

test('@mobile 13.76: niedostępny plik ekranu Diagnostyki → komunikat zamiast białego ekranu, aplikacja działa dalej', async ({ page }) => {
  test.setTimeout(90_000);
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);
  await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible({ timeout: 30_000 });

  // Każdy plik ekranu Diagnostyki (budowa: /assets/MobileDiagnosticsPanel-*.js, dev: /src/.../MobileDiagnosticsPanel.jsx).
  let blocked = 0;
  await page.route(/MobileDiagnosticsPanel[^/]*\.(?:js|jsx)(?:\?.*)?$/, (route) => { blocked += 1; return route.abort('internetdisconnected'); });

  await page.locator('.wawisVersionDiagnosticsButton').click();
  await expect(page.getByTestId('lazy-screen-unavailable')).toBeVisible({ timeout: 20_000 });
  expect(blocked).toBeGreaterThan(0);
  // Reszta aplikacji nadal działa: lista montaży i przejście do montażu.
  await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible();
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Tabliczki', exact: true })).toBeVisible({ timeout: 20_000 });
});
