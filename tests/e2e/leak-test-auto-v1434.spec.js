import { expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';

// WAWIS 14.34 — protokół tworzy baza przy zakończeniu montażu (bez temperatury; SQL: leak-test-auto-sql-v1434).
// Aplikacja dociąga średnią dnia w tle: zakładka „Próby szczelności” i otwarcie PDF. Dane fikcyjne, atrapa Open-Meteo.
test.use({ viewport: { width: 1440, height: 1000 } });

async function routeWeather(page, mean) {
  const calls = [];
  await page.route(/open-meteo\.com/, async (route) => {
    const url = route.request().url();
    calls.push(url);
    if (url.includes('geocoding-api')) await route.fulfill({ json: { results: [{ name: 'Gdańsk', latitude: 54.35, longitude: 18.65 }] } });
    else await route.fulfill({ json: { daily: { temperature_2m_mean: [mean] } } });
  });
  return calls;
}

test('14.34: temperatura protokołu z zakończenia montażu dociągana i zapisywana w tle', async ({ page }) => {
  const calls = await routeWeather(page, 6.6);
  await login(page, ADMIN);
  await page.evaluate(() => { window.__desktopMock = window.__KLIMA_MOCK_SUPABASE__; });
  // Jak po zakończeniu montażu: wpis z datą zakończenia, wynikiem pozytywnym, bez temperatury.
  await page.evaluate(() => window.__desktopMock.mutate((store) => {
    store.leak_test_records = [{ job_id: 'mock-job-003', test_date: '2026-04-22', temperature_c: null, result: 'pozytywny', updated_at: new Date().toISOString(), signed_at: '2026-04-22T10:00:00Z' }];
  }));
  await page.getByRole('button', { name: /^Próby szczelności$/ }).click();
  const panel = page.getByTestId('leak-tests-panel');
  await expect(panel).toContainText('Protokoły tworzą się same przy zakończeniu montażu');
  await panel.getByRole('button', { name: 'Uzupełnione' }).click();
  const row = panel.getByTestId('leak-test-row').filter({ hasText: 'Klient Testowy C Zakończony' });
  await expect(row.getByLabel('Temperatura °C')).toHaveValue('7');
  await expect(row.getByTestId('leak-test-temp-hint')).toHaveText('Średnia dnia · Gdańsk');
  expect(calls.some((url) => /start_date=2026-04-22/.test(url))).toBe(true);
  // Zapisane w bazie (bez klikania „Zapisz”), podpis zostaje.
  await expect.poll(() => page.evaluate(() => window.__desktopMock.getStore().leak_test_records[0].temperature_c)).toBe(7);
  expect(await page.evaluate(() => window.__desktopMock.getStore().leak_test_records[0].signed_at)).toBeTruthy();
});

test('14.34: PDF protokołu bez temperatury — średnia dnia dociągana przy otwarciu', async ({ page }) => {
  await routeWeather(page, -2.4);
  await login(page, ADMIN);
  const result = await page.evaluate(async () => {
    const mod = await import('/src/mobile791/modules/leak-test-protocol-pdf.js');
    const saved = [];
    const supabase = { rpc: async (name, args) => { saved.push([name, args]); return { data: true, error: null }; } };
    const job = { id: 'j1', city: 'Gdańsk' };
    const filled = await mod.withBackgroundTemperature({ supabase, job, record: { test_date: '2026-01-10', temperature_c: null, result: 'pozytywny' } });
    const kept = await mod.withBackgroundTemperature({ supabase, job, record: { test_date: '2026-01-10', temperature_c: 3, result: 'pozytywny' } });
    const data = mod.buildLeakTestProtocolData({ job, profiles: [], record: filled });
    return { temp: filled.temperature_c, kept: kept.temperature_c, pdfTemp: data.temperature, saved };
  });
  expect(result).toEqual({ temp: -2, kept: 3, pdfTemp: '-2',
    saved: [['leak_test_set_temperature_v1434', { p_job_id: 'j1', p_temperature_c: -2 }]] });
});
