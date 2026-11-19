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

  test('14.40: Szukaj w GUS przy edycji montażu pokazuje dane i nie zmienia adresu', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /^Montaże$/ }).click();
    await page.getByRole('button', { name: /W trakcie:/ }).click();
    await page.getByRole('table').getByText('Klient Testowy B', { exact: true }).click();
    await page.getByRole('button', { name: 'Edytuj', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edytuj montaż' })).toBeVisible();

    const street = page.getByPlaceholder('Ulica i numer', { exact: true });
    const streetBefore = await street.inputValue();
    await page.getByPlaceholder('NIP (opcjonalnie)').fill('5730208483');
    await page.getByRole('button', { name: 'Szukaj w GUS' }).click();

    await expect(page.locator('.jobNipLookupStatus')).toContainText('FIRMA Z GUS SP. Z O.O.');
    await expect(street).toHaveValue(streetBefore);
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

    await page.getByRole('button', { name: 'Edytuj', exact: true }).click();
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

  test('14.47: SMS wysłany w tym miesiącu — podgląd klienta prowadzi do kontrahenta', async ({ page }) => {
    await login(page, ADMIN);
    // Wpis SMS nie zawiera kontrahenta; przed 14.47 „Przejdź do kontrahenta” było nieaktywne.
    // (Atrapa nie ma katalogu urządzeń v2, więc test używa SMS-a montażu; łączenie urządzeń — smoke 14.47.)
    await page.evaluate(() => {
      window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
        store.sms_log.push({ id: 'mock-sms-1447', job_id: 'mock-job-001', device_id: null, client: 'Klient Testowy A', phone: '500100200', sms_type: 'service_reminder', status: 'delivered', sent_at: new Date().toISOString(), created_at: new Date().toISOString() });
      });
    });
    await page.getByRole('button', { name: /^SMS$/ }).click();
    await page.locator('.smsDesktopMetricCard', { hasText: 'Wysłane w tym miesiącu' }).click();
    await page.locator('.smsDesktopClientButton', { hasText: 'Klient Testowy A' }).first().click();

    const card = page.locator('.smsClientDetailsCard').filter({ hasText: 'Dane klienta' });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Przejdź do montażu' })).toBeEnabled();
    const toContractor = card.getByRole('button', { name: 'Przejdź do kontrahenta' });
    await expect(toContractor).toBeEnabled();
    await toContractor.click();
    await expect(page.getByRole('heading', { name: 'Kontrahenci', exact: true })).toBeVisible();
  });

  test('14.45: administrator otwiera PDF potwierdzonej faktury z Fakturowni', async ({ page }) => {
    await login(page, ADMIN);
    // Szczegóły montażu ładują moduł z wersji telefonicznej, którego atrapa nadpisuje globalny uchwyt
    // (bez mutate). Zapamiętujemy uchwyt bazy desktopowej przed otwarciem montażu.
    await page.evaluate(() => { window.__WAWIS_DESKTOP_MOCK_1445__ = window.__KLIMA_MOCK_SUPABASE__; });
    await page.getByRole('button', { name: /^Montaże$/ }).click();
    await page.getByRole('button', { name: /Zakończone:/ }).click();
    await page.getByRole('table').getByText('Klient Testowy C Zakończony', { exact: true }).click();
    // Faktura bez potwierdzenia: karty nie ma.
    await expect(page.locator('[data-desktop-protocol="9.96"]')).toBeVisible();
    await expect(page.locator('[data-desktop-invoice="14.45"]')).toHaveCount(0);
    await page.evaluate(() => {
      window.__WAWIS_DESKTOP_MOCK_1445__.mutate((store) => {
        const job = store.jobs.find((item) => item.id === 'mock-job-003');
        Object.assign(job, { vat_invoice_issued: true, vat_invoice_fakturownia_confirmed: true, vat_invoice_fakturownia_invoice_id: '584755572', vat_invoice_fakturownia_invoice_number: '22/11/2026' });
      });
      window.dispatchEvent(new Event('focus'));
    });

    const invoiceCard = page.locator('[data-desktop-invoice="14.45"]');
    await expect(invoiceCard.getByText('Faktura 22/11/2026')).toBeVisible();
    await invoiceCard.getByRole('button', { name: 'Podgląd faktury' }).click();
    await expect(page.locator('.desktopJobInvoicePreviewModal iframe')).toBeVisible();
    await page.locator('.desktopJobInvoicePreviewModal .desktopJobProtocolPreviewHeader').getByRole('button', { name: 'Zamknij' }).click();

    const download = page.waitForEvent('download');
    await invoiceCard.getByRole('button', { name: 'Pobierz PDF' }).click();
    expect((await download).suggestedFilename()).toBe('faktura-mock.pdf');
  });

  test('pracownik loguje się — pracownik na komputerze jest kierowany do aplikacji telefonicznej', async ({ page }) => {
    await login(page, WORKER);

    await expect(page.getByRole('heading', { name: 'Aplikacja dla pracownika jest dostępna tylko na telefonie' })).toBeVisible();
    await expect(page.getByText('Wersja komputerowa jest dostępna tylko dla administratora.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edytuj', exact: true })).toHaveCount(0);
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
