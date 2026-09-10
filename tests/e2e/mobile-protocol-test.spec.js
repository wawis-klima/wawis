import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

test.use(iphone14);

async function openJob(page, credentials, status, client) {
  await login(page, credentials);
  await page.locator(`.statusActionButton[title="${status}"]`).click();
  await page.getByText(client, { exact: true }).click();
}

async function drawSignature(page) {
  await page.getByRole('button', { name: 'Podpis klienta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Podpis klienta', exact: true })).toBeVisible();
  const canvas = page.locator('#protocol-test-signature');
  await expect(canvas).toBeVisible();
  const screenState = await page.locator('.protocolSignatureModal').evaluate((element) => ({
    overflow: getComputedStyle(element).overflow,
    height: Math.round(element.getBoundingClientRect().height),
    viewport: window.innerHeight,
  }));
  expect(screenState.overflow).toBe('hidden');
  expect(Math.abs(screenState.height - screenState.viewport)).toBeLessThanOrEqual(2);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Brak pola podpisu.');
  await page.mouse.move(box.x + 35, box.y + 95);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 50, { steps: 6 });
  await page.mouse.move(box.x + 125, box.y + 105, { steps: 6 });
  await page.mouse.move(box.x + 180, box.y + 62, { steps: 6 });
  await page.mouse.move(box.x + 245, box.y + 92, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Zatwierdź podpis', exact: true }).click();
  await expect(page.getByText('Podpis klienta zapisany', { exact: true })).toBeVisible();
}

test.describe('@mobile protokół po zakończeniu zlecenia', () => {
  test('protokół nie jest dostępny przed zakończeniem zlecenia', async ({ page }) => {
    await openJob(page, WORKER, 'W trakcie', 'Klient Testowy B');
    await expect(page.locator('.protocolTestButton')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Zakończ/ })).toBeVisible();
  });

  test('pracownik tworzy protokół, wysyła go z biuro@wawis.pl i pobiera PDF', async ({ page }) => {
    await openJob(page, WORKER, 'Zakończone', 'Klient Testowy C Zakończony');
    await expect(page.getByText('Zakończone · tylko podgląd', { exact: true })).toBeVisible();
    await expect(page.locator('.protocolTestButton')).toBeVisible();

    await page.locator('.protocolTestButton').click();
    await expect(page.getByRole('heading', { name: 'Protokół klienta' })).toBeVisible();
    await expect(page.getByText(/Protokół jest opcjonalny/)).toBeVisible();
    await expect(page.getByText('LG Mock 3.5 kW', { exact: true })).toBeVisible();
    await expect(page.getByText('MOCK-LG-003', { exact: true })).toHaveCount(0);
    await drawSignature(page);
    await page.getByRole('button', { name: 'Zapisz protokół' }).click();

    await expect(page.getByRole('button', { name: 'Drukuj lub wyślij', exact: true })).toBeVisible();
    await expect(page.getByText(/Protokół został zapisany/)).toBeVisible();

    await page.getByRole('button', { name: 'Drukuj lub wyślij', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Drukuj protokół', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wyślij z biuro@wawis.pl', exact: true })).toBeVisible();
    await expect(page.getByText('Do: klient.c@example.test', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Wyślij z biuro@wawis.pl', exact: true }).click();
    await expect(page.getByText('Protokół został wysłany z biuro@wawis.pl do klient.c@example.test.', { exact: true })).toBeVisible();

    const store = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__?.getStore?.());
    expect(store.jobs.find((job) => job.id === 'mock-job-003')?.status).toBe('Zakończone');
    expect(store.job_protocols).toHaveLength(1);
    expect(store.job_protocols[0].job_id).toBe('mock-job-003');
    expect(store.job_protocol_email_log).toHaveLength(1);
    expect(store.job_protocol_email_log[0].sender_email).toBe('biuro@wawis.pl');
    expect(store.job_protocol_email_log[0].recipient_email).toBe('klient.c@example.test');
    expect(store.job_protocol_email_log[0].sent_by).toBe('mock-worker-1');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Zapisz PDF w telefonie', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^wawis-protokol-test-klient-testowy-c-zakonczony-.*\.pdf$/);
    await download.saveAs('test-results/wawis-protokol-v979-worker.pdf');
  });

  test('administrator na telefonie również tworzy protokół tylko dla zakończonego zlecenia', async ({ page }) => {
    await resetMockSupabase(page);
    await openJob(page, ADMIN, 'W trakcie', 'Klient Testowy B');
    await expect(page.locator('.protocolTestButton')).toHaveCount(0);

    await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
    await expect(page.locator('.protocolTestButton')).toBeVisible();
  });
});
