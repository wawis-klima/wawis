import { expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';

// WAWIS 14.32 — próby szczelności dla starych montaży bez instalatora w aplikacji (decyzja właściciela 07.11.2026):
// administrator wybiera instalatora (montaż bez zmian), protokół trafia do podpisu w aplikacji tego instalatora.
// Dane fikcyjne (mock).

test.describe('14.32: instalator w próbach szczelności — komputer', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('stary montaż: wybór instalatora wymagany, zapis, nazwisko w PDF', async ({ page }) => {
    // 14.33: atrapa Open-Meteo — średnia dnia 7,4 °C → podpowiedź „7”.
    const weatherCalls = [];
    await page.route(/open-meteo\.com/, async (route) => {
      const url = route.request().url();
      weatherCalls.push(url);
      if (url.includes('geocoding-api')) {
        await route.fulfill({ json: { results: [{ name: 'Gdańsk', latitude: 54.35, longitude: 18.65 }] } });
      } else {
        await route.fulfill({ json: { daily: { time: ['x'], temperature_2m_mean: [7.4] } } });
      }
    });
    await login(page, ADMIN);
    // Uchwyt bazy testowej komputera — moduły telefonu ładowane później podmieniają window.__KLIMA_MOCK_SUPABASE__.
    await page.evaluate(() => { window.__desktopMock = window.__KLIMA_MOCK_SUPABASE__; });
    // Stary zakończony montaż bez instalatora w aplikacji (jak 85 montaży z kwietnia–sierpnia 2026).
    await page.evaluate(() => window.__desktopMock.mutate((store) => {
      const base = store.jobs.find((job) => job.id === 'mock-job-003');
      store.jobs.push({ ...base, id: 'mock-job-old', client: 'Stary Klient Kwiecień', completed_at: null, completed_by: null, installation_date: '2026-04-15' });
    }));
    await page.getByRole('button', { name: /^Protokoły$/ }).click();
    const panel = page.getByTestId('leak-tests-panel');
    await expect(panel.getByTestId('leak-tests-count')).toHaveText('Uzupełniono 0 z 2');
    const oldRow = panel.getByTestId('leak-test-row').filter({ hasText: 'Stary Klient Kwiecień' });
    const appRow = panel.getByTestId('leak-test-row').filter({ hasText: 'Klient Testowy C Zakończony' });
    await expect(oldRow).toContainText('bez instalatora w aplikacji');
    await expect(appRow.getByTestId('leak-test-installer')).toHaveCount(0);
    await expect(oldRow.getByLabel('Data badania')).toHaveValue('2026-04-15');
    // Podpowiedź temperatury: średnia dnia badania dla miejscowości montażu.
    await expect(oldRow.getByLabel('Temperatura °C')).toHaveValue('7');
    await expect(oldRow.getByTestId('leak-test-temp-hint')).toHaveText('Średnia dnia · Gdańsk');
    expect(weatherCalls.some((url) => /archive-api\.open-meteo\.com\/v1\/archive\?.*start_date=2026-04-15.*daily=temperature_2m_mean/.test(url))).toBe(true);
    // Zmiana daty: nowa podpowiedź; ręczny wpis zostaje.
    await oldRow.getByLabel('Data badania').fill('2026-04-16');
    await expect(oldRow.getByLabel('Temperatura °C')).toHaveValue('7');
    expect(weatherCalls.some((url) => /start_date=2026-04-16/.test(url))).toBe(true);
    await oldRow.getByLabel('Data badania').fill('2026-04-15');
    await expect(oldRow.getByLabel('Temperatura °C')).toHaveValue('7');

    // Bez instalatora — nie zapisze.
    await oldRow.getByLabel('Temperatura °C').fill('16');
    await oldRow.getByRole('button', { name: 'Zapisz' }).click();
    await expect(oldRow.getByRole('alert')).toContainText('Wybierz instalatora');

    const select = oldRow.getByTestId('leak-test-installer');
    await expect(select.locator('option', { hasText: 'Pracownik Testowy' })).toHaveCount(1);
    await select.selectOption({ label: 'Pracownik Testowy' });
    await oldRow.getByRole('button', { name: 'Zapisz' }).click();
    await expect(oldRow.getByRole('status')).toHaveText('Zapisano');
    await expect(panel.getByTestId('leak-tests-count')).toHaveText('Uzupełniono 1 z 2');
    await expect(oldRow).toContainText('przypisany: Pracownik Testowy');
    await expect(oldRow.getByTestId('leak-test-sign-status')).toContainText('Czeka na wzór podpisu instalatora');

    // Baza (mock): wpis z instalatorem, montaż bez zmian; dane PDF z nazwiskiem przypisanego instalatora.
    const check = await page.evaluate(async () => {
      const store = window.__desktopMock.getStore();
      const worker = store.profiles.find((item) => item.full_name === 'Pracownik Testowy');
      const record = store.leak_test_records.find((item) => item.job_id === 'mock-job-old');
      const job = store.jobs.find((item) => item.id === 'mock-job-old');
      const mod = await import('/src/mobile791/modules/leak-test-protocol-pdf.js');
      const data = mod.buildLeakTestProtocolData({ job: { ...job }, profiles: [],
        record: { test_date: '2026-04-15', temperature_c: 16, result: 'pozytywny', installer_name: 'Pracownik Testowy' } });
      return { installerOk: record?.installer_id === worker?.id, jobUnchanged: job?.completed_by === null, performedBy: data.performedBy, responsible: data.responsiblePerson };
    });
    expect(check).toEqual({ installerOk: true, jobUnchanged: true, performedBy: 'Pracownik Testowy', responsible: 'Pracownik Testowy' });
  });
});
// 14.33: podpis na telefonie przez wzór z Diagnostyki — test: signature-pattern-v1433.spec.js.
