import { expect, test } from '@playwright/test';
import { ADMIN, WORKER, login, resetMockSupabase } from './mock-helpers.js';

test.describe('desktop E2E na mock Supabase', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test.beforeEach(async ({ page }) => {
    await resetMockSupabase(page);
  });

  test('reset mock danych przed E2E przywraca stan bazowy', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('klima-mock-supabase-session', '{"stale":true}');
      window.__KLIMA_MOCK_SUPABASE__.reset();
    });
    const state = await page.evaluate(() => ({
      session: window.localStorage.getItem('klima-mock-supabase-session'),
      jobs: window.__KLIMA_MOCK_SUPABASE__.getStore().jobs.map((job) => job.client),
    }));
    expect(state.session).toBeNull();
    expect(state.jobs).toEqual(['Klient Testowy A', 'Klient Testowy B', 'Klient Testowy C Zakończony', 'Klient Testowy D Cudzy']);
  });

  test('administrator loguje się i przechodzi przez Montaże, Kalendarz oraz SMS', async ({ page }) => {
    await login(page, ADMIN);

    await expect(page.getByRole('button', { name: /^Montaże$/ })).toBeVisible();
    await page.getByRole('button', { name: /^Montaże$/ }).click();
    await expect(page.getByRole('heading', { name: 'Montaże' })).toBeVisible();
    await page.getByRole('button', { name: /W trakcie:/ }).click();
    await expect(page.getByRole('table').getByText('Klient Testowy B', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Kalendarz/ }).click();
    await expect(page.getByText('Wybrany dzień')).toBeVisible();
    await expect(page.locator('.calendarContentGrid')).toBeVisible();

    await page.getByRole('button', { name: /^SMS$/ }).click();
    await expect(page.getByRole('heading', { name: 'SMS – przypomnienia serwisowe', exact: true })).toBeVisible();
    await expect(page.getByText('Klienci na liście')).toBeVisible();
  });

  test('Centrum 360 używa tylko głównego wyszukiwania i otwiera wskazanego kontrahenta', async ({ page }) => {
    await login(page, ADMIN);

    await expect(page.locator('.centrum360SearchButton')).toHaveCount(0);
    await expect(page.locator('.centrum360DateButton')).toHaveCount(0);

    const search = page.getByRole('searchbox', { name: 'Globalne wyszukiwanie' });
    await search.fill('Klient Testowy A');
    const contractorResult = page
      .locator('.globalDesktopSearchResult')
      .filter({ has: page.getByText('Kontrahent', { exact: true }) })
      .filter({ hasText: 'Klient Testowy A' })
      .first();
    await expect(contractorResult).toBeVisible();
    await contractorResult.click();

    await expect(page.getByRole('heading', { name: 'Kontrahenci', exact: true })).toBeVisible();
    await expect(page.locator('.contractorsSidePanel.isOpen').getByRole('heading', { name: 'Klient Testowy A', exact: true })).toBeVisible();
    await expect(page.locator('tr.contractorsSelectedRow')).toContainText('Klient Testowy A');
  });

  test('administrator tworzy i edytuje montaż', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /^Montaże$/ }).click();

    await page.locator('button.desktopActionBtn.primary[title="Dodaj"]').click();
    const dialog = page.getByRole('dialog');
    await expect(page.getByRole('heading', { name: 'Nowy montaż / zlecenie' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Klient', exact: true }).fill('Klient E2E Create');
    await page.getByPlaceholder('Email klienta', { exact: true }).fill('e2e.create@example.test');
    await page.getByPlaceholder('Telefon klienta / SMS', { exact: true }).fill('501222333');
    await page.getByPlaceholder('Miejscowość', { exact: true }).fill('Poznań');
    await page.getByPlaceholder('Ulica i numer', { exact: true }).fill('Testowa 77');
    await dialog.locator('input[type="date"]').fill('2026-09-14');
    await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

    await expect(page.getByText('Klient E2E Create', { exact: true })).toBeVisible();
    await page.getByText('Klient E2E Create', { exact: true }).click();
    await expect(page.getByText(/Testowa 77/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Edytuj montaż' }).click();
    await expect(page.getByRole('heading', { name: 'Edytuj montaż' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Klient', exact: true }).fill('Klient E2E Edited');
    await page.getByPlaceholder('Ulica i numer', { exact: true }).fill('Testowa 88');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

    await expect(page.getByText('Klient E2E Edited', { exact: true })).toBeVisible();
    await page.getByText('Klient E2E Edited', { exact: true }).click();
    await expect(page.getByText(/Testowa 88/).first()).toBeVisible();
  });

  test('administrator usuwa montaż dopiero po potwierdzeniu', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /^Montaże$/ }).click();
    await page.getByRole('button', { name: /W trakcie:/ }).click();

    const clientRow = page.getByRole('table').getByText('Klient Testowy B', { exact: true });
    await expect(clientRow).toBeVisible();
    await clientRow.click();
    await expect(page.getByRole('button', { name: 'Usuń kartę' })).toBeVisible();
    await page.getByRole('button', { name: 'Usuń kartę' }).click();

    await expect(page.getByRole('heading', { name: 'Usunąć kartę montażu?' })).toBeVisible();
    await page.getByRole('button', { name: 'Anuluj' }).click();
    await expect(clientRow).toBeVisible();

    await page.getByRole('button', { name: 'Usuń kartę' }).click();
    await page.getByRole('button', { name: 'Usuń na stałe' }).click();
    await expect(clientRow).toHaveCount(0);
  });

  test('administrator podgląda i wysyła zapisany protokół zakończonego zlecenia', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /^Montaże$/ }).click();
    await page.getByRole('button', { name: /Zakończone:/ }).click();
    await page.getByRole('table').getByText('Klient Testowy C Zakończony', { exact: true }).click();

    const protocolCard = page.locator('[data-desktop-protocol="9.96"]');
    await expect(protocolCard.getByText('Protokół zapisany')).toBeVisible();
    await expect(protocolCard.getByRole('button', { name: 'Podgląd PDF' })).toBeVisible();
    await expect(protocolCard.getByRole('button', { name: 'Drukuj' })).toBeVisible();
    await expect(protocolCard.getByRole('button', { name: 'Wyślij klientowi' })).toBeEnabled();

    await protocolCard.getByRole('button', { name: 'Podgląd PDF' }).click();
    await expect(page.locator('.desktopJobProtocolPreviewModal iframe')).toBeVisible();
    await page.locator('.desktopJobProtocolPreviewHeader').getByRole('button', { name: 'Zamknij' }).click();

    await protocolCard.getByRole('button', { name: 'Wyślij klientowi' }).click();
    await expect(protocolCard.getByText('Protokół został wysłany z biuro@wawis.pl do klient.c@example.test.')).toBeVisible();
  });

  test('pracownik na komputerze jest kierowany do aplikacji telefonicznej', async ({ page }) => {
    await login(page, WORKER);

    await expect(page.getByRole('heading', { name: 'Aplikacja dla pracownika jest dostępna tylko na telefonie' })).toBeVisible();
    await expect(page.getByText('Wersja komputerowa jest dostępna tylko dla administratora.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edytuj montaż' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Usuń kartę' })).toHaveCount(0);
  });

  test('pracownik na desktopie nie widzi modułów administratora', async ({ page }) => {
    await login(page, WORKER);

    await expect(page.getByRole('heading', { name: 'Aplikacja dla pracownika jest dostępna tylko na telefonie' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^SMS$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Kontrahenci/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Urządzenia/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Wyloguj' })).toBeVisible();
  });
});
