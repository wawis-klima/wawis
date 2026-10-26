import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.72 (decyzja właściciela 26.10.2026): po powrocie internetu pasek „Niezapisane tabliczki — Zapisz teraz”.
// Jedno dotknięcie zapisuje urządzenia wpisane bez internetu, bez szukania montażu i wchodzenia w „Tabliczki”.
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const ONLINE_FLAG = 'klima-e2e-network-state';
test.use(iphone14);

async function installControllableNetworkState(page) {
  await page.addInitScript(({ flag }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() { return window.localStorage.getItem(flag) !== 'offline'; },
    });
  }, { flag: ONLINE_FLAG });
}

async function setOnline(page, online) {
  await page.evaluate(({ flag, value }) => {
    window.localStorage.setItem(flag, value ? 'online' : 'offline');
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  }, { flag: ONLINE_FLAG, value: online });
}

const wizard = (page) => page.locator('.mobileDeviceWizardOverlay .mobileDeviceWizard');

async function addUnsavedDevice(page) {
  const w = wizard(page);
  await w.getByRole('button', { name: 'Dodaj kolejne urządzenie' }).click();
  await w.getByRole('button', { name: 'Dalej', exact: true }).click();
  await expect(w.getByText('Tryb: Single', { exact: true })).toBeVisible();
  await w.locator('.mobileDeviceWizardSelection').first().click();
  await w.locator('.mobileDevicePickerOverlay').getByRole('button', { name: 'LG', exact: true }).click();
  await w.locator('.mobileDeviceWizardBack').click();
  await expect(w.getByText('Krok 1 z 4')).toBeVisible();
  await w.locator('.mobileDeviceWizardBack').click();
  await expect(w.getByRole('heading', { name: 'Urządzenia', exact: true })).toBeVisible();
}

test('@mobile 13.72: „Zapisz teraz” po powrocie internetu zapisuje urządzenia wpisane bez internetu', async ({ page }) => {
  test.setTimeout(120_000);
  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.accept(); });
  await installControllableNetworkState(page);
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);

  const statusFilter = page.locator('.statusActionButton[title="W trakcie"]');
  if (await statusFilter.isVisible().catch(() => false)) await statusFilter.click();
  // Karta montażu na liście (nie pasek „Niezapisane tabliczki” z tą samą nazwą klienta — 13.72).
  await page.locator('.mobileJobClient[title="Klient Testowy B"]').first().click();
  await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  const saveButton = page.locator('.mobileDeviceWizardFooter .btn.primary');
  await expect(saveButton).toBeVisible({ timeout: 20_000 });
  const devicesBefore = await wizard(page).locator('.mobileDeviceOverviewCard').count();
  await addUnsavedDevice(page);

  // Bez internetu: zapis niemożliwy → „Zamknij okno”. Pasek się nie pokazuje (nie ma jak zapisać).
  await setOnline(page, false);
  await saveButton.click();
  const offlinePrompt = page.locator('.confirmDeleteModal', { hasText: 'Brak internetu' });
  const confirmWarning = page.getByRole('button', { name: 'Zapisz mimo ostrzeżenia', exact: true });
  await expect.poll(async () => await offlinePrompt.isVisible().catch(() => false) || await confirmWarning.isVisible().catch(() => false), { timeout: 20_000 }).toBe(true);
  if (!(await offlinePrompt.isVisible().catch(() => false))) await confirmWarning.click();
  await offlinePrompt.getByRole('button', { name: 'Zamknij okno', exact: true }).click();
  await expect(wizard(page)).toHaveCount(0);
  await expect(page.getByTestId('pending-device-drafts')).toHaveCount(0);

  // Internet wrócił: pasek z nazwą klienta; jedno dotknięcie „Zapisz teraz”.
  await setOnline(page, true);
  const bar = page.getByTestId('pending-device-drafts');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await expect(bar).toContainText('Klient Testowy B');
  const dialogsBefore = dialogs.length;
  await bar.getByTestId('pending-device-drafts-save').click();

  // Ten sam zapis co ręczny: ewentualne ostrzeżenie wymaga drugiego dotknięcia, potem formularz się zamyka.
  await expect.poll(async () => dialogs.length > dialogsBefore
    || await confirmWarning.isVisible().catch(() => false)
    || (await wizard(page).count()) === 0, { timeout: 30_000 }).toBe(true);
  if (await confirmWarning.isVisible().catch(() => false)) await confirmWarning.click();
  await expect(wizard(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(bar).toHaveCount(0);

  // Dane są w systemie: ponowne otwarcie bez informacji o przywróconym szkicu, z dodanym urządzeniem.
  await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  await expect(saveButton).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('device-draft-restored')).toHaveCount(0);
  await expect(wizard(page).locator('.mobileDeviceOverviewCard')).toHaveCount(devicesBefore + 1);
  const stored = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('wawis-device-drafts-v1')).map((key) => window.localStorage.getItem(key)).join(''));
  expect(stored).not.toContain('LG');
});
