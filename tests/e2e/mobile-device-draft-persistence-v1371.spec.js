import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.71 — test iPhone 26.10.2026: dane urządzeń wpisane bez internetu znikały, gdy
// (1) formularz otwarto z internetem i zamknięto bez zapisu, (2) aplikacja została zamknięta.
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

async function openJobNameplates(page) {
  const statusFilter = page.locator('.statusActionButton[title="W trakcie"]');
  if (await statusFilter.isVisible().catch(() => false)) await statusFilter.click();
  // Karta montażu na liście (nie pasek „Niezapisane tabliczki” z tą samą nazwą klienta — 13.72).
  await page.locator('.mobileJobClient[title="Klient Testowy B"]').first().click();
  await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  await expect(page.locator('.mobileDeviceWizardFooter .btn.primary')).toBeVisible({ timeout: 20_000 });
}

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

async function closeWizardKeepingData(page) {
  await wizard(page).locator('.mobileDeviceWizardClose').click();
  const confirm = page.locator('.appModalOverlay.confirmDeleteOverlay');
  await expect(confirm.getByRole('heading', { name: 'Zamknąć bez zapisu?' })).toBeVisible();
  await expect(confirm).toContainText('zostaną zachowane');
  await confirm.getByRole('button', { name: 'Zamknij — zachowaj dane' }).click();
  await expect(wizard(page)).toHaveCount(0);
}

test('@mobile 13.71: dane urządzeń wpisane bez internetu przetrwają wyjście bez zapisu i zamknięcie aplikacji', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('dialog', (dialog) => dialog.accept());
  await installControllableNetworkState(page);
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);

  // 1. Bez internetu: nowe urządzenie → Zapisz → „Brak internetu” → Zamknij okno.
  await openJobNameplates(page);
  await addUnsavedDevice(page);
  await setOnline(page, false);
  await page.locator('.mobileDeviceWizardFooter .btn.primary').click();
  const offlinePrompt = page.locator('.confirmDeleteModal', { hasText: 'Brak internetu' });
  const confirmWarning = page.getByRole('button', { name: 'Zapisz mimo ostrzeżenia', exact: true });
  await expect.poll(async () => await offlinePrompt.isVisible().catch(() => false) || await confirmWarning.isVisible().catch(() => false), { timeout: 20_000 }).toBe(true);
  if (!(await offlinePrompt.isVisible().catch(() => false))) await confirmWarning.click();
  await offlinePrompt.getByRole('button', { name: 'Zamknij okno', exact: true }).click();
  await expect(wizard(page)).toHaveCount(0);

  // 2. Internet wrócił: otwarcie przywraca dane; wyjście BEZ zapisu nie może ich skasować (błąd z 26.10).
  await setOnline(page, true);
  await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  await expect(page.getByTestId('device-draft-restored')).toBeVisible({ timeout: 20_000 });
  await closeWizardKeepingData(page);
  await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  await expect(page.getByTestId('device-draft-restored')).toBeVisible({ timeout: 20_000 });
  const devicesWithDraft = await wizard(page).locator('.mobileDeviceOverviewCard').count();
  await closeWizardKeepingData(page);

  // 3. Zamknięcie aplikacji (przeładowanie): wraca sam tekst urządzeń, z informacją o zdjęciach.
  await page.reload();
  await openJobNameplates(page);
  await expect(page.getByTestId('device-draft-restored')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('device-draft-restored')).toContainText('Aplikacja była zamknięta');
  await expect(wizard(page).locator('.mobileDeviceOverviewCard')).toHaveCount(devicesWithDraft);

  // 4. Świadome „Odrzuć niezapisane dane” usuwa szkic (także z pamięci telefonu).
  await page.getByTestId('device-draft-discard').click();
  await expect(page.getByTestId('device-draft-restored')).toHaveCount(0);
  await expect(wizard(page).locator('.mobileDeviceOverviewCard')).toHaveCount(devicesWithDraft - 1);
  await wizard(page).locator('.mobileDeviceWizardClose').click();
  await expect(wizard(page)).toHaveCount(0);
  await page.reload();
  await openJobNameplates(page);
  await expect(page.getByTestId('device-draft-restored')).toHaveCount(0);
  const stored = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('wawis-device-drafts-v1')).map((key) => window.localStorage.getItem(key)));
  expect(stored.join('')).not.toContain('LG');
});
