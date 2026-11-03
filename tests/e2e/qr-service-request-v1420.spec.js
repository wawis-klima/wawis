import { expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';

// WAWIS 14.20 — klient skanuje naklejkę QR i zgłasza awarię / przegląd; administrator widzi zgłoszenie na komputerze.
const ENDPOINT = 'https://mock-supabase.invalid/functions/v1/qr-service-request';
const INFO = {
  ok: true, code: 'UYE8EYCQ', company: 'WaWis-Klima', phone: '606 553 984', phoneHref: '+48606553984',
  assigned: true, model: 'Rotenso Imoto 3.5 kW', installationDate: '20.11.2025', nextInspection: '20.10.2026', inspectionDueNow: true,
};

async function routeEndpoint(page, { info = INFO, infoStatus = 200, submitStatus = 200, submitBody = { ok: true } } = {}) {
  const submitted = [];
  await page.route(ENDPOINT, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' } });
    const body = JSON.parse(request.postData() || '{}');
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (body.action === 'info') return route.fulfill({ status: infoStatus, headers, body: JSON.stringify(infoStatus === 200 ? info : { error: 'Nieznana naklejka.' }) });
    submitted.push(body);
    return route.fulfill({ status: submitStatus, headers, body: JSON.stringify(submitBody) });
  });
  return submitted;
}

test.describe('@mobile 14.20: strona klienta z naklejki QR', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('klient widzi model, termin przeglądu i telefon, zgłasza awarię; bez service workera', async ({ page }) => {
    const submitted = await routeEndpoint(page);
    await page.goto('/?qr=UYE8EYCQ');
    const pageRoot = page.getByTestId('public-qr-page');
    await expect(pageRoot).toContainText('WaWis-Klima');
    await expect(pageRoot).toContainText('Rotenso Imoto 3.5 kW');
    await expect(pageRoot).toContainText('20.10.2026');
    await expect(pageRoot).toContainText('Czas na przegląd');
    await expect(page.getByTestId('public-qr-call')).toHaveAttribute('href', 'tel:+48606553984');
    await expect(page.locator('input[name="email"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Zgłoś awarię' }).click();
    const form = page.getByTestId('public-qr-form');
    await form.getByLabel('Twój numer telefonu').fill('600 100 200');
    await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
    await expect(form.getByRole('alert')).toContainText('Opisz krótko');
    expect(submitted).toHaveLength(0);

    await form.getByLabel('Co się dzieje z klimatyzatorem?').fill('Nie chłodzi, kapie woda z jednostki.');
    await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
    await expect(page.getByTestId('public-qr-sent')).toContainText('Dziękujemy, zgłoszenie dotarło');
    expect(submitted).toEqual([{ action: 'submit', code: 'UYE8EYCQ', kind: 'awaria', description: 'Nie chłodzi, kapie woda z jednostki.', phone: '600 100 200', website: '' }]);

    const registrations = await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.() || []).length);
    expect(registrations).toBe(0);
  });

  test('limit zgłoszeń i nieznana naklejka — czytelne komunikaty', async ({ page }) => {
    await routeEndpoint(page, { submitStatus: 429, submitBody: { error: 'Zgłoszenie z tego urządzenia już do nas dotarło. Jeśli sprawa jest pilna, zadzwoń.' } });
    await page.goto('/?qr=UYE8EYCQ');
    await page.getByRole('button', { name: 'Umów przegląd' }).click();
    const form = page.getByTestId('public-qr-form');
    await form.getByLabel('Twój numer telefonu').fill('600100200');
    await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
    await expect(form.getByRole('alert')).toContainText('już do nas dotarło');
    await expect(page.getByTestId('public-qr-sent')).toHaveCount(0);

    await page.unrouteAll();
    await routeEndpoint(page, { infoStatus: 404 });
    await page.goto('/?qr=ZZZZZZZZ');
    await expect(page.getByTestId('public-qr-page')).toContainText('Nie rozpoznaliśmy tej naklejki');
    await expect(page.getByRole('button', { name: 'Zgłoś awarię' })).toHaveCount(0);
  });

  test('„Jestem pracownikiem” prowadzi do logowania i dotychczasowego okna naklejki', async ({ page }) => {
    await routeEndpoint(page);
    await page.goto('/?qr=UYE8EYCQ');
    await page.getByRole('button', { name: 'Jestem pracownikiem WAWIS — zaloguj się' }).click();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await page.locator('input[name="email"]').fill(ADMIN.email);
    await page.locator('input[name="password"]').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Zaloguj' }).click();
    await expect(page.getByTestId('qr-sticker-resolver')).toContainText('UYE8-EYCQ');
  });
});

test.describe('14.20: zakładka Zgłoszenia na komputerze', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('administrator widzi zgłoszenie z klientem i urządzeniem, oznacza jako załatwione', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /^Zgłoszenia$/ }).click();
    const panel = page.getByTestId('service-requests-panel');
    await expect(panel.getByRole('heading', { name: 'Zgłoszenia od klientów' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Nowe (1)' })).toBeVisible();
    const row = panel.getByTestId('service-request-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Awaria');
    await expect(row).toContainText('Klient Testowy A');
    await expect(row).toContainText('Daikin Mock 3.5 kW');
    await expect(row).toContainText('naklejka UYE8-EYCQ');
    await expect(row).toContainText('Nie chłodzi, z jednostki kapie woda.');
    await expect(row).toContainText('Tel. 600 111 222');

    await row.getByRole('button', { name: 'Oznacz jako załatwione' }).click();
    await expect(panel.getByText('Brak nowych zgłoszeń.')).toBeVisible();
    await panel.getByRole('button', { name: 'Wszystkie' }).click();
    await expect(panel.getByTestId('service-request-row')).toHaveCount(2);
    const store = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__.getStore().service_requests.map((r) => r.status));
    expect(store).toEqual(['zalatwione', 'zalatwione']);
  });
});
