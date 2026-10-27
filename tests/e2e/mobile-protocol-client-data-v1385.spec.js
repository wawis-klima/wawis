import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.85 (prośba właściciela 27.10.2026): przed podpisem protokołu pracownik musi uzupełnić dane klienta —
// imię i nazwisko (albo nazwę firmy) obowiązkowo, e-mail zalecany („Klient nie podał e-maila”).
// Dane trafiają do montażu (a przez trigger bazy do karty kontrahenta) i do podpisanego protokołu.
const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);
const STORE_KEY = 'klima-mock-supabase-store-v3';

async function openProtocolForJobB(page) {
  await resetMockSupabase(page);
  await page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    for (const unitRef of ['jz', 'jw-1']) {
      store.photos.push({
        id: 'mock-1385-plate-' + unitRef, job_id: 'mock-job-002',
        photo_kind: 'nameplate', device_index: 1, unit_ref: unitRef,
        storage_path: 'mock-job-002/nameplates/device-1_' + unitRef + '_1385.jpg',
        ocr_status: 'approved', ocr_checked_at: '2026-10-27T10:00:00.000Z',
        upload_status: 'uploaded', created_at: '2026-10-27T10:00:00.000Z',
      });
    }
    // Typowa sytuacja z produkcji: zamiast klienta wpisana ulica, bez e-maila.
    const job = store.jobs.find((item) => item.id === 'mock-job-002');
    job.client = 'ul. Chłodna 5';
    job.title = 'ul. Chłodna 5';
    job.email = '';
    localStorage.setItem(key, JSON.stringify(store));
  }, STORE_KEY);
  await loginWithoutReset(page, WORKER);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('ul. Chłodna 5', { exact: true }).first().click();
  const protocolButton = page.locator('.mobileInlineJobDetails .workerActionProtocolV1295');
  await expect(protocolButton).toBeEnabled({ timeout: 20_000 });
  await protocolButton.click();
  await expect(page.locator('.protocolWizardModal')).toBeVisible();
  const payment = page.locator('.protocolPaymentForm');
  await expect(payment).toBeVisible();
  await payment.locator('select').selectOption('cash');
  await payment.locator('input[inputmode="decimal"]').fill('1000');
}

async function sign(page) {
  await page.getByRole('button', { name: 'Podpis klienta', exact: true }).click();
  const canvas = page.locator('#protocol-test-signature');
  await expect(canvas).toBeVisible();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Brak pola podpisu');
  await page.mouse.move(rect.x + 25, rect.y + 55);
  await page.mouse.down();
  await page.mouse.move(rect.x + 90, rect.y + 88, { steps: 5 });
  await page.mouse.move(rect.x + 150, rect.y + 45, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Zatwierdź podpis', exact: true }).click();
}

test('@mobile 13.85: bez imienia i nazwiska klienta nie da się podpisać; dane zapisują się w montażu', async ({ page }) => {
  test.setTimeout(120_000);
  await openProtocolForJobB(page);
  const section = page.getByTestId('protocol-client-section');
  await expect(section).toBeVisible();
  const name = page.getByTestId('protocol-client-name');
  const email = page.getByTestId('protocol-client-email');
  await expect(name).toHaveValue('ul. Chłodna 5');
  await expect(page.getByTestId('protocol-client-name-error')).toContainText('wygląda na adres');
  await expect(page.getByTestId('protocol-client-email-error')).toBeVisible();

  // Blokada podpisu: zamiast pola podpisu — komunikat.
  await page.getByRole('button', { name: 'Podpis klienta', exact: true }).click();
  await expect(page.locator('#protocol-test-signature')).toHaveCount(0);
  await expect(page.locator('.protocolTestMessage').filter({ hasText: 'Uzupełnij dane klienta' }).first()).toBeVisible();

  // Samo nazwisko i „Pan” nie wystarczą.
  await name.fill('Pan Kowalski');
  await expect(page.getByTestId('protocol-client-name-error')).toContainText('imię i nazwisko');
  await name.fill('Jan Kowalski');
  await expect(page.getByTestId('protocol-client-name-error')).toHaveCount(0);
  await expect(page.getByTestId('protocol-client-name-hint')).toHaveCount(0);

  // Literówka w e-mailu z podpowiedzią poprawki.
  await email.fill('jan.kowalski@gmial.com');
  await expect(page.getByTestId('protocol-client-email-error')).toContainText('gmail.com');
  await page.getByTestId('protocol-client-email-fix').click();
  await expect(email).toHaveValue('jan.kowalski@gmail.com');
  await expect(page.getByTestId('protocol-client-email-error')).toHaveCount(0);

  await sign(page);
  // Podpisane dane klienta widoczne na protokole.
  await expect(page.locator('.protocolTestClientName')).toHaveText('Jan Kowalski');

  // Zmiana danych po podpisie = potrzebny nowy podpis.
  await name.fill('Jan Kowalskii');
  await expect(page.locator('.protocolTestMessage').filter({ hasText: 'Zmieniono dane klienta' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Podpis klienta', exact: true })).toBeVisible();
  await name.fill('Jan Kowalski');
  await sign(page);

  // Zapis: najpierw dane klienta w montażu (ten sam zapis z kontrolą równoległej edycji co formularz).
  await page.getByRole('button', { name: 'Zapisz protokół' }).click();
  await expect.poll(async () => page.evaluate((key) => {
    const job = (JSON.parse(localStorage.getItem(key) || '{}').jobs || []).find((item) => item.id === 'mock-job-002');
    return job ? `${job.client}|${job.title}|${job.email}` : '';
  }, STORE_KEY), { timeout: 30_000 }).toBe('Jan Kowalski|Jan Kowalski|jan.kowalski@gmail.com');
});

test('@mobile 13.85: „Klient nie podał e-maila” pozwala podpisać bez e-maila; firma bez imienia i nazwiska', async ({ page }) => {
  test.setTimeout(120_000);
  await openProtocolForJobB(page);
  const name = page.getByTestId('protocol-client-name');
  await page.getByTestId('protocol-client-company').check();
  await name.fill('Instal-Bud sp. z o.o.');
  await expect(page.getByTestId('protocol-client-name-error')).toHaveCount(0);
  await expect(page.getByTestId('protocol-client-email-error')).toBeVisible();
  await page.getByTestId('protocol-client-no-email').check();
  await expect(page.getByTestId('protocol-client-email-error')).toHaveCount(0);
  await sign(page);
  await expect(page.locator('#protocol-test-signature')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zmień podpis' })).toBeVisible();

  await page.getByRole('button', { name: 'Zapisz protokół' }).click();
  await expect.poll(async () => page.evaluate((key) => {
    const job = (JSON.parse(localStorage.getItem(key) || '{}').jobs || []).find((item) => item.id === 'mock-job-002');
    return job ? `${job.client}|${job.email}` : '';
  }, STORE_KEY), { timeout: 30_000 }).toBe('Instal-Bud sp. z o.o.|');
});
