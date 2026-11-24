// WAWIS 14.96 (decyzja właściciela 24.11.2026, zgłoszenie Kacpra — słaby zasięg):
// pracownik bez internetu może zapisać dane kontaktowe klienta (e-mail, telefon, nazwa, adres).
// Zmiana trafia do kolejki na telefonie i wysyła się sama; równoległej zmiany w biurze nie nadpisuje.
import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

const ONLINE_FLAG = 'klima-e2e-network-state';
const JOB_ID = 'mock-job-002';

async function installControllableNetworkState(page) {
  await page.addInitScript(({ flag }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() { return window.localStorage.getItem(flag) !== 'offline'; },
    });
  }, { flag: ONLINE_FLAG });
}

async function setOnline(page, isOnline) {
  await page.evaluate(({ flag, online }) => {
    window.localStorage.setItem(flag, online ? 'online' : 'offline');
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  }, { flag: ONLINE_FLAG, online: isOnline });
}

const serverJob = (page) => page.evaluate((id) => {
  const job = window.__KLIMA_MOCK_SUPABASE__?.getStore()?.jobs?.find((item) => item.id === id);
  return job ? { email: job.email || '', phone: job.phone || '' } : null;
}, JOB_ID);

async function openJobEdit(page) {
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).click();
  await page.locator('.mobileInlineJobDetails').getByRole('button', { name: 'Edytuj', exact: true }).first().click();
  const modal = page.locator('.formModal');
  await expect(modal.getByRole('heading', { name: 'Edytuj montaż' })).toBeVisible();
  return modal;
}

test('@mobile 14.96 pracownik: e-mail klienta bez internetu — zapis na telefonie, wysyłka po powrocie zasięgu', async ({ page }) => {
  await installControllableNetworkState(page);
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);
  const before = await serverJob(page);
  expect(before).not.toBeNull();

  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });

  const modal = await openJobEdit(page);
  await setOnline(page, false);
  await modal.getByPlaceholder('Email klienta').fill('kacper.test@example.com');
  await modal.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();

  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain('Brak internetu — dane klienta zapisano na telefonie');
  await expect(modal.getByRole('heading', { name: 'Edytuj montaż' })).toHaveCount(0);
  // Serwer jeszcze nic nie dostał.
  expect((await serverJob(page)).email).toBe(before.email);

  await setOnline(page, true);
  await expect.poll(async () => (await serverJob(page)).email, { timeout: 20_000 }).toBe('kacper.test@example.com');
  // Kolejka pusta po wysłaniu.
  await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('wawis-mobile-offline-data');
    request.onsuccess = () => {
      const db = request.result;
      const all = db.transaction('job-operations', 'readonly').objectStore('job-operations').getAll();
      all.onsuccess = () => { resolve(all.result.length); db.close(); };
    };
  })), { timeout: 20_000 }).toBe(0);
});

test('@mobile 14.96 pracownik: zmiana w biurze w międzyczasie — telefon niczego nie nadpisuje', async ({ page }) => {
  await installControllableNetworkState(page);
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);

  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });

  const modal = await openJobEdit(page);
  await setOnline(page, false);
  await modal.getByPlaceholder('Email klienta').fill('z.telefonu@example.com');
  await modal.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect.poll(() => dialogs.length).toBe(1);

  // W tym czasie biuro wpisuje inny e-mail.
  await page.evaluate((id) => {
    window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
      const job = store.jobs.find((item) => item.id === id);
      job.email = 'z.biura@example.com';
    });
  }, JOB_ID);
  expect((await serverJob(page)).email).toBe('z.biura@example.com');

  await setOnline(page, true);
  await expect(page.getByText(/Konflikt synchronizacji/).first()).toBeVisible({ timeout: 20_000 });
  expect((await serverJob(page)).email).toBe('z.biura@example.com');
});

test('@mobile 14.96 pracownik: inne zmiany bez internetu nadal wymagają internetu', async ({ page }) => {
  await installControllableNetworkState(page);
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);
  const modal = await openJobEdit(page);
  await setOnline(page, false);
  const dateInput = modal.locator('input[type="date"]').first();
  await expect(dateInput).toBeVisible();
  await dateInput.fill('2030-01-15');
  await modal.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(page.getByText(/Bez internetu można zapisać tylko dane kontaktowe klienta/)).toBeVisible();
});
