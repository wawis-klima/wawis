import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const MOCK_STORE_KEY = 'klima-mock-supabase-store-v3';

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
  const rasterState = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      pixelWidth: element.width,
      pixelHeight: element.height,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
  expect(rasterState.pixelWidth / rasterState.cssWidth).toBeGreaterThanOrEqual(1.9);
  expect(rasterState.pixelHeight / rasterState.cssHeight).toBeGreaterThanOrEqual(1.9);

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

async function seedProtocolRecordForPostSaveFlow(page) {
  await page.evaluate(({ storeKey }) => {
    const store = JSON.parse(window.localStorage.getItem(storeKey) || '{}');
    store.job_protocols = [{
      id: 'mock-protocol-e2e-003',
      job_id: 'mock-job-003',
      storage_path: 'mock-job-003/protocol-e2e.pdf',
      file_name: 'wawis-protokol-test-klient-testowy-c-zakonczony-e2e.pdf',
      file_size_bytes: 65578,
      signed_at: '2026-09-14T10:00:00.000Z',
      created_at: '2026-09-14T10:00:00.000Z',
      created_by: 'mock-worker-1',
    }];
    const serialized = JSON.stringify(store);
    window.localStorage.setItem(storeKey, serialized);
    window.dispatchEvent(new StorageEvent('storage', { key: storeKey, newValue: serialized }));
  }, { storeKey: MOCK_STORE_KEY });
}

test.describe('@mobile protokół po zakończeniu zlecenia', () => {
  test('protokół nie jest dostępny przed zakończeniem zlecenia', async ({ page }) => {
    await openJob(page, WORKER, 'W trakcie', 'Klient Testowy B');
    await expect(page.locator('.protocolTestButton')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zakończ', exact: true })).toBeVisible();
  });

  test('pracownik tworzy protokół, wysyła go z biuro@wawis.pl i pobiera PDF', async ({ page }) => {
    await openJob(page, WORKER, 'Zakończone', 'Klient Testowy C Zakończony');
    await expect(page.getByText('Zakończone · tylko podgląd', { exact: true })).toBeVisible();
    await expect(page.locator('.protocolTestButton')).toBeVisible();

    await page.locator('.protocolTestButton').click();
    const protocolModal = page.locator('.mobileProtocolWizard');
    await expect(page.getByRole('heading', { name: 'Protokół klienta' })).toBeVisible();
    await expect(page.getByText(/Protokół jest opcjonalny/)).toBeVisible();

    const protocolScrollState = await page.locator('.protocolWizardModal').evaluate((modal) => {
      const paymentSection = modal.querySelector('.protocolPaymentSection');
      const modalRect = modal.getBoundingClientRect();
      const paymentRect = paymentSection?.getBoundingClientRect();
      return {
        scrollTop: modal.scrollTop,
        paymentVisible: Boolean(paymentRect && paymentRect.top < modalRect.bottom && paymentRect.bottom > modalRect.top),
      };
    });
    expect(protocolScrollState.scrollTop).toBeGreaterThan(0);
    expect(protocolScrollState.paymentVisible).toBe(true);

    const paymentToggle = page.locator('.protocolPaymentToggle');
    await expect(paymentToggle).toContainText('Dodaj');
    const paymentToggleStyle = await paymentToggle.evaluate((element) => ({
      whiteSpace: getComputedStyle(element).whiteSpace,
      spanWhiteSpace: getComputedStyle(element.querySelector('span')).whiteSpace,
    }));
    expect(paymentToggleStyle.whiteSpace).toBe('nowrap');
    expect(paymentToggleStyle.spanWhiteSpace).toBe('nowrap');

    await paymentToggle.click();
    const paymentForm = page.locator('.protocolPaymentForm');
    await expect(paymentForm).toBeVisible();

    const paymentKind = paymentForm.locator('select').nth(0);
    const paymentMethod = paymentForm.locator('select').nth(1);
    const paymentDate = paymentForm.locator('input[type="date"]');
    const paymentDateShell = paymentForm.locator('.protocolPaymentDateShell');
    const compactPaymentLayout = await paymentForm.evaluate((form) => {
      const selects = [...form.querySelectorAll('select.input')];
      const paymentMethod = selects[1];
      const date = form.querySelector('input[type="date"]');
      const dateShell = form.querySelector('.protocolPaymentDateShell');
      const formRect = form.getBoundingClientRect();
      const methodRect = paymentMethod?.getBoundingClientRect();
      const dateRect = date?.getBoundingClientRect();
      const dateShellRect = dateShell?.getBoundingClientRect();
      return {
        selectHeights: selects.map((element) => element.getBoundingClientRect().height),
        selectFontSizes: selects.map((element) => parseFloat(getComputedStyle(element).fontSize)),
        paymentMethodWidth: methodRect?.width ?? 0,
        paymentMethodHeight: methodRect?.height ?? 0,
        dateShellWidth: dateShellRect?.width ?? 0,
        dateShellHeight: dateShellRect?.height ?? 0,
        dateHeight: dateRect?.height ?? 0,
        dateFontSize: date ? parseFloat(getComputedStyle(date).fontSize) : 0,
        dateFitsHorizontally: Boolean(dateShellRect && dateShellRect.left >= formRect.left - 1 && dateShellRect.right <= formRect.right + 1),
        nativeDateFitsShell: Boolean(dateRect && dateShellRect && dateRect.left >= dateShellRect.left - 1 && dateRect.right <= dateShellRect.right + 1 && dateRect.top >= dateShellRect.top - 1 && dateRect.bottom <= dateShellRect.bottom + 1),
      };
    });
    expect(compactPaymentLayout.selectHeights.every((height) => height <= 39)).toBe(true);
    expect(compactPaymentLayout.selectFontSizes.every((size) => size <= 16)).toBe(true);
    expect(Math.abs(compactPaymentLayout.dateShellHeight - compactPaymentLayout.paymentMethodHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(compactPaymentLayout.dateShellWidth - compactPaymentLayout.paymentMethodWidth)).toBeLessThanOrEqual(1);
    expect(compactPaymentLayout.dateShellHeight).toBeLessThanOrEqual(39);
    expect(compactPaymentLayout.dateHeight).toBeLessThanOrEqual(39);
    expect(compactPaymentLayout.dateFontSize).toBeLessThanOrEqual(16);
    expect(compactPaymentLayout.dateFitsHorizontally).toBe(true);
    expect(compactPaymentLayout.nativeDateFitsShell).toBe(true);
    await expect(paymentKind).toBeVisible();
    await expect(paymentMethod).toBeVisible();
    await expect(paymentDateShell).toBeVisible();
    await expect(paymentDate).toBeVisible();
    await paymentForm.locator('input[inputmode="decimal"]').fill('1000');
    await expect(protocolModal.getByText('LG Mock 3.5 kW', { exact: true }).first()).toBeVisible();
    await expect(protocolModal.getByText('Zapisana w systemie', { exact: true })).toHaveCount(0);
    await expect(protocolModal.getByText('STATUS', { exact: true })).toHaveCount(0);
    await expect(protocolModal.getByText(/S\/N: Brak numeru seryjnego/).first()).toBeVisible();
    await expect(page.getByText('MOCK-LG-003', { exact: true })).toHaveCount(0);
    await drawSignature(page);

    // Backendowy zapis insert/select/single jest osobno sprawdzany przez smoke-mobile-protocol-save.
    // W pełnym E2E stabilizujemy istniejący rekord, aby sprawdzić ekran po zapisie,
    // wysyłkę e-mail i pobieranie bez ograniczenia uproszczonego klienta mock.
    await seedProtocolRecordForPostSaveFlow(page);
    await page.getByRole('button', { name: 'Zapisz protokół' }).click();

    await expect(page.getByRole('button', { name: 'Drukuj lub wyślij', exact: true })).toBeVisible();
    await expect(page.getByText(/Protokół podpisany i zapisany/).first()).toBeVisible();

    // Odtwarzamy realny scenariusz z iPhone'a: zapisany protokół jest zamykany i otwierany ponownie.
    // Przy ponownym otwarciu istniejący mechanizm ustawia widok na dolnej części protokołu.
    await page.locator('.mobileDeviceWizardClose').click();
    await expect(page.getByRole('heading', { name: 'Protokół klienta' })).toHaveCount(0);
    await page.locator('.protocolTestButton').click();
    await expect(page.getByRole('button', { name: 'Drukuj lub wyślij', exact: true })).toBeVisible();

    const editProtocolButton = page.getByRole('button', { name: 'Uzupełnij protokół', exact: true });
    const scrollSetup = await page.locator('.protocolWizardModal').evaluate((modal) => {
      // Fixture E2E ma krótsze dane niż zgłoszony protokół z iPhone'a.
      // Zmniejszamy wyłącznie wysokość testowego scroll-containera, żeby odtworzyć realny zapas przewijania.
      modal.style.setProperty('height', '420px', 'important');
      modal.style.setProperty('min-height', '420px', 'important');
      modal.style.setProperty('max-height', '420px', 'important');
      modal.style.setProperty('overflow-y', 'auto', 'important');
      modal.scrollTop = 0;
      return { maxScroll: Math.max(0, modal.scrollHeight - modal.clientHeight) };
    });
    expect(scrollSetup.maxScroll).toBeGreaterThan(44);
    // Kliknięcie przez DOM nie uruchamia pomocniczego auto-scroll Playwrighta,
    // więc test mierzy wyłącznie przewinięcie wykonywane przez samą aplikację.
    await editProtocolButton.evaluate((button) => button.click());
    await expect(page.getByRole('button', { name: 'Podpis klienta', exact: true })).toBeVisible();
    await expect.poll(async () => page.locator('.protocolWizardModal').evaluate((modal) => {
      const confirmation = [...modal.querySelectorAll('.protocolTestSection')]
        .find((section) => section.querySelector('h3')?.textContent?.includes('Potwierdzenie klienta'));
      const footer = modal.querySelector('.mobileDeviceWizardFooter');
      if (!confirmation || !footer) return -999;
      const confirmationRect = confirmation.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return Math.round(footerRect.top - confirmationRect.bottom);
    })).toBeGreaterThanOrEqual(10);
    await expect.poll(async () => page.locator('.protocolWizardModal').evaluate((modal) => {
      const confirmation = [...modal.querySelectorAll('.protocolTestSection')]
        .find((section) => section.querySelector('h3')?.textContent?.includes('Potwierdzenie klienta'));
      const footer = modal.querySelector('.mobileDeviceWizardFooter');
      if (!confirmation || !footer) return 999;
      const confirmationRect = confirmation.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return Math.round(footerRect.top - confirmationRect.bottom);
    })).toBeLessThanOrEqual(24);
    await page.locator('.protocolWizardModal').evaluate((modal) => {
      modal.style.removeProperty('height');
      modal.style.removeProperty('min-height');
      modal.style.removeProperty('max-height');
      modal.style.removeProperty('overflow-y');
      modal.scrollTop = 0;
    });

    await page.locator('.mobileDeviceWizardClose').evaluate((button) => button.click());
    await expect(page.getByRole('heading', { name: 'Protokół klienta' })).toHaveCount(0);
    await page.locator('.protocolTestButton').click();
    await expect(page.getByRole('button', { name: 'Drukuj lub wyślij', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Drukuj lub wyślij', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Drukuj protokół', exact: true })).toBeVisible();
    await expect.poll(async () => page.locator('.protocolOutputActions').evaluate((section) => {
      const sectionRect = section.getBoundingClientRect();
      const footerRect = document.querySelector('.mobileProtocolWizard .mobileDeviceWizardFooter')?.getBoundingClientRect();
      return sectionRect.bottom <= (footerRect?.top ?? window.innerHeight) + 2;
    })).toBe(true);
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
