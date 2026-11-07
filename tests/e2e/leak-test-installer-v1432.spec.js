import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 14.32 — próby szczelności dla starych montaży bez instalatora w aplikacji (decyzja właściciela 07.11.2026):
// administrator wybiera instalatora (montaż bez zmian), protokół trafia do podpisu w aplikacji tego instalatora.
// Dane fikcyjne (mock).

test.describe('14.32: instalator w próbach szczelności — komputer', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('stary montaż: wybór instalatora wymagany, zapis, nazwisko w PDF', async ({ page }) => {
    await login(page, ADMIN);
    // Stary zakończony montaż bez instalatora w aplikacji (jak 85 montaży z kwietnia–sierpnia 2026).
    await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
      const base = store.jobs.find((job) => job.id === 'mock-job-003');
      store.jobs.push({ ...base, id: 'mock-job-old', client: 'Stary Klient Kwiecień', completed_at: null, completed_by: null, installation_date: '2026-04-15' });
    }));
    await page.getByRole('button', { name: /^Próby szczelności$/ }).click();
    const panel = page.getByTestId('leak-tests-panel');
    await expect(panel.getByTestId('leak-tests-count')).toHaveText('Uzupełniono 0 z 2');
    const oldRow = panel.getByTestId('leak-test-row').filter({ hasText: 'Stary Klient Kwiecień' });
    const appRow = panel.getByTestId('leak-test-row').filter({ hasText: 'Klient Testowy C Zakończony' });
    await expect(oldRow).toContainText('bez instalatora w aplikacji');
    await expect(appRow.getByTestId('leak-test-installer')).toHaveCount(0);
    await expect(oldRow.getByLabel('Data badania')).toHaveValue('2026-04-15');

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
    await expect(oldRow.getByTestId('leak-test-sign-status')).toContainText('Czeka na podpis instalatora');

    // Baza (mock): wpis z instalatorem, montaż bez zmian; dane PDF z nazwiskiem przypisanego instalatora.
    const check = await page.evaluate(async () => {
      const store = window.__KLIMA_MOCK_SUPABASE__.getStore();
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

test.describe('14.32: instalator w próbach szczelności — telefon', () => {
  const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
  test.use(iphone14);

  test('@mobile 14.32: przypisany instalator widzi stary protokół do podpisu i go podpisuje', async ({ page }) => {
    await resetMockSupabase(page);
    await page.evaluate(() => {
      const key = 'klima-mock-supabase-store-v3';
      const store = JSON.parse(localStorage.getItem(key) || '{}');
      const live = window.__KLIMA_MOCK_SUPABASE__.getStore();
      const jobs = Array.isArray(store.jobs) && store.jobs.length ? store.jobs : live.jobs;
      const profiles = Array.isArray(store.profiles) && store.profiles.length ? store.profiles : live.profiles;
      const worker = profiles.find((item) => String(item.role) === 'Pracownik');
      const base = jobs.find((job) => job.id === 'mock-job-003');
      store.jobs = [...jobs, { ...base, id: 'mock-job-old', client: 'Stary Klient Kwiecień', completed_at: null, completed_by: null }];
      store.profiles = profiles;
      store.leak_test_records = [{ job_id: 'mock-job-old', test_date: '2026-04-15', temperature_c: 16, result: 'pozytywny', installer_id: worker.id, signature_id: null, signed_at: null }];
      localStorage.setItem(key, JSON.stringify({ ...live, ...store }));
    });
    await loginWithoutReset(page, WORKER);
    const banner = page.getByTestId('leak-sign-banner');
    await expect(banner).toContainText('Protokoły szczelności do podpisu: 1');
    await banner.getByRole('button', { name: 'Podpisz' }).click();
    const sheet = page.getByRole('dialog', { name: 'Podpis protokołów szczelności' });
    await expect(sheet).toContainText('Stary Klient Kwiecień');
    const canvas = sheet.getByTestId('leak-sign-canvas');
    const box = await canvas.boundingBox();
    const at = (dx, dy) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: box.x + dx, clientY: box.y + dy, buttons: 1 });
    await canvas.dispatchEvent('pointerdown', at(30, 100));
    for (const [dx, dy] of [[60, 60], [110, 110], [170, 70], [230, 100]]) await canvas.dispatchEvent('pointermove', at(dx, dy));
    await canvas.dispatchEvent('pointerup', at(230, 100));
    await sheet.getByRole('button', { name: 'Podpisz (1)' }).click();
    await expect(banner).toContainText('Podpisano protokołów: 1.');
  });
});
