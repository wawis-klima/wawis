import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function openNameplates(page, throughSwipe) {
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  const card = page.locator('.mobileJobCard').filter({ hasText: 'Klient Testowy Multi-Split' }).first();
  await expect(card).toBeVisible();
  if (throughSwipe) {
    const frame = card.locator('xpath=..').locator('xpath=..');
    const rect = await frame.boundingBox();
    const x = rect.x + rect.width * 0.25;
    const y = rect.y + rect.height * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 110, y, { steps: 10 });
    await page.mouse.up();
    await expect(frame).toHaveClass(/isRightOpen/);
    await frame.getByRole('button', { name: 'Otwórz tabliczki montażu' }).click();
  } else {
    await card.locator('.mobileJobCardButton').click();
    await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  }
  const wizard = page.locator('.mobileDeviceWizardOverlay .mobileDeviceWizard');
  await expect(wizard).toBeVisible();
  return wizard;
}

async function makeRealUnsavedChange(wizard) {
  // Empty placeholder rows do not count as dirty; set an actual brand/model
  // to exercise the persisted unsaved-changes guard rather than a false alert.
  await wizard.getByRole('button', { name: 'Dalej', exact: true }).click();
  await expect(wizard.getByText('Tryb: Single', { exact: true })).toBeVisible();
  await wizard.locator('.mobileDeviceWizardSelection').first().click();
  await wizard.locator('.mobileDevicePickerOverlay').getByRole('button', { name: 'LG', exact: true }).click();
  await expect(wizard.locator('.mobileDeviceWizardSelectionText').first()).toContainText('LG');
}

async function assertConfirmAboveWizard(page) {
  const confirm = page.locator('.appModalOverlay.confirmDeleteOverlay');
  await expect(confirm.getByRole('heading', { name: 'Zamknąć bez zapisu?' })).toBeVisible();
  const hit = await confirm.evaluate((overlay) => {
    const button = overlay.querySelector('button');
    if (!button) return false;
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return overlay.contains(target) && Number.parseInt(getComputedStyle(overlay).zIndex, 10) > 9999;
  });
  expect(hit, 'Potwierdzenie musi być rzeczywiście klikalne ponad kreatorem').toBe(true);
  return confirm;
}

test.describe('@mobile WAWIS 13.06 zamykanie kreatora tabliczek', () => {
  test('puste dodawanie: strzałka i Zamknij pozwalają bezpośrednio wyjść bez ukrytego okna', async ({ page }) => {
    const wizard = await openNameplates(page, true);
    await wizard.getByRole('button', { name: 'Dodaj kolejne urządzenie' }).click();
    await expect(wizard.getByRole('heading', { name: 'Dodaj urządzenie' })).toBeVisible();
    await wizard.locator('.mobileDeviceWizardBack').click();
    await expect(wizard.getByRole('heading', { name: 'Urządzenia', exact: true })).toBeVisible();
    await wizard.getByRole('button', { name: 'Dodaj kolejne urządzenie' }).click();
    await wizard.locator('.mobileDeviceWizardClose').click();
    await expect(wizard).toHaveCount(0);
    await expect(page.locator('.appModalOverlay.confirmDeleteOverlay')).toHaveCount(0);
  });


  test('wejście przez gest: Zamknij pokazuje dostępne potwierdzenie niezapisanych danych', async ({ page }) => {
    const wizard = await openNameplates(page, true);
    await wizard.getByRole('button', { name: 'Dodaj kolejne urządzenie' }).click();
    await expect(wizard.getByRole('heading', { name: 'Dodaj urządzenie' })).toBeVisible();
    await makeRealUnsavedChange(wizard);

    await wizard.locator('.mobileDeviceWizardClose').click();
    let confirm = await assertConfirmAboveWizard(page);
    await confirm.getByRole('button', { name: 'Wróć', exact: true }).click();
    await expect(wizard).toBeVisible();

    await wizard.locator('.mobileDeviceWizardClose').click();
    confirm = await assertConfirmAboveWizard(page);
    await confirm.getByRole('button', { name: 'Zamknij bez zapisu' }).click();
    await expect(wizard).toHaveCount(0);
    await expect(confirm).toHaveCount(0);
  });

  test('zwykłe Tabliczki: strzałka wraca do listy urządzeń, a Zamknij działa', async ({ page }) => {
    const wizard = await openNameplates(page, false);
    await wizard.getByRole('button', { name: 'Dodaj kolejne urządzenie' }).click();
    await expect(wizard.getByRole('heading', { name: 'Dodaj urządzenie' })).toBeVisible();
    await makeRealUnsavedChange(wizard);

    await wizard.locator('.mobileDeviceWizardBack').click();
    await expect(wizard.getByText('Krok 1 z 4')).toBeVisible();
    await wizard.locator('.mobileDeviceWizardBack').click();
    await expect(wizard.getByRole('heading', { name: 'Urządzenia', exact: true })).toBeVisible();

    await wizard.locator('.mobileDeviceWizardClose').click();
    const confirm = await assertConfirmAboveWizard(page);
    await confirm.getByRole('button', { name: 'Zamknij bez zapisu' }).click();
    await expect(wizard).toHaveCount(0);
  });
});
