import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function startSignedProtocol(page, credentials = WORKER) {
  await resetMockSupabase(page);
  await page.evaluate(() => {
    const key = 'klima-mock-supabase-store-v3';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    for (const unitRef of ['jz', 'jw-1']) {
      store.photos.push({
        id: 'mock-reminder-plate-' + unitRef,
        job_id: 'mock-job-002',
        photo_kind: 'nameplate', device_index: 1, unit_ref: unitRef,
        storage_path: 'mock-job-002/nameplates/device-1_' + unitRef + '_reminder.jpg',
        ocr_status: 'approved', ocr_checked_at: '2026-10-23T13:00:00.000Z',
        upload_status: 'uploaded', created_at: '2026-10-23T13:00:00.000Z',
      });
    }
    localStorage.setItem(key, JSON.stringify(store));
  });
  await loginWithoutReset(page, credentials);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).click();
  const protocolButton = page.locator('.mobileInlineJobDetails .workerActionProtocolV1295');
  await expect(protocolButton).toBeEnabled();
  await protocolButton.click();
  const payment = page.locator('.protocolPaymentForm');
  await expect(payment).toBeVisible();
  await payment.locator('select').selectOption('cash');
  await payment.locator('input[inputmode="decimal"]').fill('1000');
  await page.getByRole('button', { name: 'Podpis klienta', exact: true }).click();
  const canvas = page.locator('#protocol-test-signature');
  await expect(canvas).toBeVisible();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Brak podpisu');
  await page.mouse.move(rect.x + 25, rect.y + 55);
  await page.mouse.down();
  await page.mouse.move(rect.x + 90, rect.y + 88, { steps: 5 });
  await page.mouse.move(rect.x + 150, rect.y + 45, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Zatwierdź podpis', exact: true }).click();

  // Serwer potwierdza istniejącą transakcję zanim klient ponowi zapis.
  // Ten sam mechanizm idempotencji protokołu pokrywa dotychczasowy test E2E.
  await page.evaluate(() => {
    const key = 'klima-mock-supabase-store-v3';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    store.job_protocols = [{
      id: 'mock-reminder-protocol', job_id: 'mock-job-002',
      storage_path: 'mock-job-002/protocol-signed-reminder.pdf',
      file_name: 'protocol-signed-reminder.pdf', file_size_bytes: 65578,
      signed_at: '2026-10-23T13:10:00.000Z', created_at: '2026-10-23T13:10:00.000Z',
      created_by: 'mock-worker-1', note: '',
    }];
    localStorage.setItem(key, JSON.stringify(store));
  });
  await page.getByRole('button', { name: 'Zapisz protokół' }).click();
  await expect(page.getByText(/Protokół podpisany i zapisany/).first()).toBeVisible();
  await page.locator('.mobileDeviceWizardClose').click();
  await expect(page.getByRole('heading', { name: 'Protokół podpisany' })).toBeVisible();
}

test.describe('@mobile przypomnienie zakończenia po protokole', () => {
  test('13.58 — kompaktowe okno: dwa przyciski w jednym rzędzie na iPhonie', async ({ page }) => {
    await startSignedProtocol(page, ADMIN);
    const modal = page.locator('.finishReminderModal');
    await expect(modal).toBeVisible();
    const cancel = modal.getByRole('button', { name: 'Jeszcze nie' });
    const confirm = modal.getByRole('button', { name: 'Zakończ montaż' });
    const [modalBox, cancelBox, confirmBox] = await Promise.all([
      modal.boundingBox(), cancel.boundingBox(), confirm.boundingBox(),
    ]);
    expect(modalBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();
    expect(confirmBox).not.toBeNull();
    expect(modalBox.height).toBeLessThan(240);
    expect(modalBox.width).toBeLessThanOrEqual(392);
    expect(Math.abs(cancelBox.y - confirmBox.y)).toBeLessThan(2);
    expect(confirmBox.x).toBeGreaterThan(cancelBox.x + cancelBox.width);
    expect(cancelBox.height).toBeGreaterThanOrEqual(44);
    expect(confirmBox.height).toBeGreaterThanOrEqual(44);
    await cancel.click();
    const store = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__?.getStore?.());
    expect(store.jobs.find((job) => job.id === 'mock-job-002')?.status).toBe('W trakcie');
  });


  test('administrator na iPhonie dostaje przypomnienie po zapisie PDF; Jeszcze nie nie kończy montażu', async ({ page }) => {
    await startSignedProtocol(page, ADMIN);
    await expect(page.getByRole('button', { name: 'Zakończ montaż' })).toBeVisible();
    await page.getByRole('button', { name: 'Jeszcze nie' }).click();
    const store = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__?.getStore?.());
    expect(store.jobs.find((job) => job.id === 'mock-job-002')?.status).toBe('W trakcie');
    await page.locator('.protocolTestButton').click();
    await page.locator('.mobileDeviceWizardClose').click();
    await expect(page.getByRole('heading', { name: 'Protokół podpisany' })).toHaveCount(0);
  });

  test('administrator na iPhonie może świadomie zakończyć po przypomnieniu', async ({ page }) => {
    await startSignedProtocol(page, ADMIN);
    const before = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__?.getStore?.());
    expect(before.jobs.find((job) => job.id === 'mock-job-002')?.status).toBe('W trakcie');
    await page.getByRole('button', { name: 'Zakończ montaż' }).click();
    await expect.poll(async () => {
      const store = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__?.getStore?.());
      return store.jobs.find((job) => job.id === 'mock-job-002')?.status;
    }).toBe('Zakończone');
  });
  test('Jeszcze nie zostawia W trakcie; ponowne otwarcie protokołu nie ponawia przypomnienia', async ({ page }) => {
    await startSignedProtocol(page);
    await expect(page.getByRole('button', { name: 'Zakończ montaż' })).toBeVisible();
    await page.getByRole('button', { name: 'Jeszcze nie' }).click();
    await expect(page.getByRole('heading', { name: 'Protokół podpisany' })).toHaveCount(0);
    let store = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__?.getStore?.());
    expect(store.jobs.find((job) => job.id === 'mock-job-002')?.status).toBe('W trakcie');
    await page.locator('.protocolTestButton').click();
    await page.locator('.mobileDeviceWizardClose').click();
    await expect(page.getByRole('heading', { name: 'Protokół podpisany' })).toHaveCount(0);
    store = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__?.getStore?.());
    expect(store.jobs.find((job) => job.id === 'mock-job-002')?.status).toBe('W trakcie');
  });

  test('Zakończ montaż uruchamia istniejący zapis statusu dopiero po potwierdzeniu', async ({ page }) => {
    await startSignedProtocol(page);
    let store = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__?.getStore?.());
    expect(store.jobs.find((job) => job.id === 'mock-job-002')?.status).toBe('W trakcie');
    await page.getByRole('button', { name: 'Zakończ montaż' }).click();
    await expect.poll(async () => {
      const next = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__?.getStore?.());
      return next.jobs.find((job) => job.id === 'mock-job-002')?.status;
    }).toBe('Zakończone');
  });
});
