import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function swipe(page, frame, dx, dy = 0) {
  const b = await frame.boundingBox();
  const x = b.x + b.width * (dx > 0 ? 0.25 : 0.65);
  const y = b.y + b.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

async function card(page, user = WORKER, status = 'W trakcie', name = 'Klient Testowy B') {
  await resetMockSupabase(page);
  await loginWithoutReset(page, user);
  await page.locator('.statusActionButton[title="' + status + '"]').click();
  const jobCard = page.locator('.mobileJobCard').filter({ hasText: name }).first();
  await expect(jobCard).toBeVisible();
  return jobCard.locator('xpath=..').locator('xpath=..');
}

test.describe('@mobile WAWIS 13.05 swipe w prawo', () => {
  test('pracownik: gest odsłania tabliczki i otwiera istniejący kreator bez rozwijania karty', async ({ page }) => {
    const frame = await card(page);
    await swipe(page, frame, 108);
    await expect(frame).toHaveClass(/isRightOpen/);
    await expect(page.locator('.mobileInlineJobDetails')).toHaveCount(0);
    await expect(frame.getByRole('button', { name: 'Otwórz tabliczki montażu' })).toBeEnabled();
    await expect(frame.getByRole('button', { name: 'Otwórz protokół montażu' })).toBeDisabled();
    await page.waitForTimeout(220);
    const geometry = await frame.evaluate(el => {
      const action = el.querySelector('.wawisSwipeAction.isNameplates');
      const box = action.getBoundingClientRect();
      return {
        hit: action.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.hit).toBe(true);
    expect(geometry.overflow).toBeLessThanOrEqual(2);
    await frame.getByRole('button', { name: 'Otwórz tabliczki montażu' }).click();
    // Serial-only mode uses MobileDeviceWizard (not the legacy form header).
    // Assert the real editor opens, including its step header.
    const wizard = page.locator('.mobileDeviceWizardOverlay .mobileDeviceWizard');
    await expect(wizard).toBeVisible({ timeout: 20000 });
    await expect(wizard.getByRole('heading', { name: /^(Urządzenia|Dodaj urządzenie)$/ })).toBeVisible();
    await expect(page.locator('.mobileInlineJobDetails')).toHaveCount(0);
  });

  test('pracownik: szybki Protokół czeka na komplet zsynchronizowanych tabliczek', async ({ page }) => {
    const frame = await card(page);
    await swipe(page, frame, 110);
    const protocol = frame.getByRole('button', { name: 'Otwórz protokół montażu' });
    await expect(protocol).toBeDisabled();
    await expect(protocol).toHaveAttribute('title', /Najpierw uzupełnij/);
    await expect(page.getByRole('heading', { name: 'Protokół klienta' })).toHaveCount(0);
  });

  test('administrator: protokół aktywnego zlecenia zachowuje dotychczasowe ograniczenie', async ({ page }) => {
    const frame = await card(page, ADMIN);
    await swipe(page, frame, 105);
    await expect(frame).toHaveClass(/isRightOpen/);
    await expect(frame.getByRole('button', { name: 'Otwórz tabliczki montażu' })).toBeEnabled();
    await expect(frame.getByRole('button', { name: 'Otwórz protokół montażu' })).toBeDisabled();
  });

  test('administrator: zakończony montaż pozwala otworzyć zapisany protokół', async ({ page }) => {
    const frame = await card(page, ADMIN, 'Zakończone', 'Klient Testowy C Zakończony');
    await swipe(page, frame, 108);
    await expect(frame.getByRole('button', { name: 'Otwórz protokół montażu' })).toBeEnabled();
    await frame.getByRole('button', { name: 'Otwórz protokół montażu' }).click();
    await expect(page.getByRole('heading', { name: 'Protokół klienta' })).toBeVisible({ timeout: 20000 });
  });

  test('pracownik: zakończone zlecenie blokuje edycję tabliczek', async ({ page }) => {
    const frame = await card(page, WORKER, 'Zakończone', 'Klient Testowy C Zakończony');
    await swipe(page, frame, 108);
    await expect(frame.getByRole('button', { name: 'Otwórz tabliczki montażu' })).toBeDisabled();
    await expect(frame.getByRole('button', { name: 'Otwórz protokół montażu' })).toBeEnabled();
  });

  test('oba kierunki, zamknięcie, zwykły tap i pionowy scroll nie kolidują', async ({ page }) => {
    const frame = await card(page);
    await swipe(page, frame, 105);
    await expect(frame).toHaveClass(/isRightOpen/);
    await swipe(page, frame, -105);
    await expect(frame).not.toHaveClass(/isOpen/);
    await swipe(page, frame, -105);
    await expect(frame).toHaveClass(/isLeftOpen/);
    await expect(frame.getByRole('link', { name: 'Zadzwoń do klienta' })).toHaveAttribute('href', /^tel:/);
    await expect(frame.getByRole('link', { name: 'Nawiguj do klienta' })).toHaveAttribute('href', /google\.com\/maps\/search/);
    await swipe(page, frame, 115);
    await expect(frame).not.toHaveClass(/isOpen/);
    await swipe(page, frame, 10, 95);
    await expect(frame).not.toHaveClass(/isOpen/);
    await frame.locator('.mobileJobCardButton').click();
    await expect(page.locator('.mobileInlineJobDetails')).toBeVisible();
  });
});
