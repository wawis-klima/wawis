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

    await expect(page.getByRole('button', { name: /Zlecenia/ })).toBeVisible();
    await page.getByRole('button', { name: /Zlecenia/ }).click();
    await expect(page.getByRole('heading', { name: 'Montaże' })).toBeVisible();
    await expect(page.getByText('Klient Testowy A')).toBeVisible();

    await page.getByRole('button', { name: /Kalendarz/ }).click();
    await expect(page.getByText('Wybrany dzień')).toBeVisible();
    await expect(page.locator('.calendarContentGrid')).toBeVisible();

    await page.getByRole('button', { name: /^SMS$/ }).click();
    await expect(page.getByRole('heading', { name: 'Powiadomienia SMS o przeglądzie' })).toBeVisible();
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
    await page.getByRole('button', { name: /Zlecenia/ }).click();

    await page.locator('button.desktopActionBtn.primary[title="Dodaj"]').click();
    await expect(page.getByRole('heading', { name: 'Nowy montaż / zlecenie' })).toBeVisible();
    await page.getByPlaceholder('Klient').fill('Klient E2E Create');
    await page.getByPlaceholder('Email klienta').fill('e2e.create@example.test');
    await page.getByPlaceholder('Telefon klienta / SMS').fill('501222333');
    await page.getByPlaceholder('Miejscowość').fill('Poznań');
    await page.getByPlaceholder('Ulica i numer').fill('Testowa 77');
    await page.getByLabel('Data montażu').locator('input[type="date"]').fill('2026-06-10');
    await page.getByPlaceholder('np. Gree Amber Standard 3,5 kW').fill('Gree E2E 3.5 kW');
    await page.getByPlaceholder('np. SN-2026-000123').fill('E2E-SN-001');
    await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

    await expect(page.getByText('Klient E2E Create')).toBeVisible();
    await page.getByText('Klient E2E Create').click();
    await expect(page.getByText('Gree E2E 3.5 kW')).toBeVisible();

    await page.getByRole('button', { name: 'Edytuj montaż' }).click();
    await expect(page.getByRole('heading', { name: 'Edytuj montaż' })).toBeVisible();
    await page.getByPlaceholder('Klient').fill('Klient E2E Edited');
    await page.getByPlaceholder('np. SN-2026-000123').fill('E2E-SN-EDITED');
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

    await expect(page.getByText('Klient E2E Edited')).toBeVisible();
    await page.getByText('Klient E2E Edited').click();
    await expect(page.getByText('E2E-SN-EDITED')).toBeVisible();
  });

  test('administrator usuwa montaż dopiero po potwierdzeniu', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /Zlecenia/ }).click();

    await expect(page.getByText('Klient Testowy B')).toBeVisible();
    await page.getByText('Klient Testowy B').click();
    await expect(page.getByRole('button', { name: 'Usuń kartę' })).toBeVisible();
    await page.getByRole('button', { name: 'Usuń kartę' }).click();

    await expect(page.getByRole('heading', { name: 'Usunąć kartę montażu?' })).toBeVisible();
    await page.getByRole('button', { name: 'Anuluj' }).click();
    await expect(page.getByText('Klient Testowy B')).toBeVisible();

    await page.getByRole('button', { name: 'Usuń kartę' }).click();
    await page.getByRole('button', { name: 'Usuń na stałe' }).click();
    await expect(page.getByText('Klient Testowy B')).toHaveCount(0);
  });

  test('administrator podgląda i wysyła zapisany protokół zakończonego zlecenia', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /Zlecenia/ }).click();
    await page.getByText('Klient Testowy C Zakończony').click();

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

  test('pracownik nie może edytować ani usuwać cudzych i zakończonych montaży', async ({ page }) => {
    await login(page, WORKER);

    await expect(page.getByText('Klient Testowy C Zakończony')).toBeVisible();
    await page.getByText('Klient Testowy C Zakończony').click();
    await expect(page.getByText('Zlecenie zakończone — karta jest tylko do podglądu dla pracownika.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edytuj montaż' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Usuń kartę' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zakończone zlecenie' })).toHaveCount(0);

    await page.getByTitle('Pokaż wszystkie zlecenia').click();
    await page.getByPlaceholder('Filtruj klienta, telefon...').fill('Klient Testowy D Cudzy');
    await expect(page.getByText('Klient Testowy D Cudzy')).toBeVisible();
    await page.getByText('Klient Testowy D Cudzy').click();
    await expect(page.getByText('Toshiba Mock 2.5 kW')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edytuj montaż' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Usuń kartę' })).toHaveCount(0);
  });

  test('pracownik loguje się tylko do modułu Montaże i nie widzi modułów administratora', async ({ page }) => {
    await login(page, WORKER);

    await expect(page.getByText('Klient Testowy A')).toBeVisible();
    await expect(page.getByText('Moje zlecenia')).toBeVisible();
    await expect(page.getByRole('button', { name: /^SMS$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Kontrahenci/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Urządzenia/ })).toHaveCount(0);
  });
});
