import { expect, test } from '@playwright/test';
import { ADMIN, login, resetMockSupabase } from './mock-helpers.js';

test.describe('desktop administrator — wąski kreator urządzeń premium', () => {
  test.use({ viewport: { width: 1752, height: 871 } });

  test.beforeEach(async ({ page }) => {
    await resetMockSupabase(page);
  });

  test('okno urządzeń jest wąskie, zwarte i pozbawione szerokich bocznych pasów', async ({ page }, testInfo) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /Zlecenia/ }).click();
    await page.getByText('Klient Testowy A', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Dodaj / edytuj urządzenia i tabliczki' }).click();

    const modal = page.locator('.desktopAdminDeviceWizardModal');
    const deviceCard = modal.locator('.mobileDeviceOverviewCard').first();
    const addButton = modal.getByRole('button', { name: 'Dodaj kolejne urządzenie' });
    const saveButton = modal.getByRole('button', { name: 'Zapisz urządzenia' });

    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'Urządzenia' })).toBeVisible();
    await expect(deviceCard).toBeVisible();
    await expect(addButton).toBeVisible();
    await expect(saveButton).toBeVisible();

    const geometry = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() || null;
      const save = document.querySelector('.desktopAdminDeviceWizardModal .mobileDeviceWizardFooter .btn');
      const body = document.querySelector('.desktopAdminDeviceWizardModal .mobileDeviceWizardBody');
      const wizard = document.querySelector('.desktopAdminDeviceWizardModal .mobileDeviceWizard');
      const card = document.querySelector('.desktopAdminDeviceWizardModal .mobileDeviceOverviewCard');
      return {
        modal: rect('.desktopAdminDeviceWizardModal'),
        wizard: wizard?.getBoundingClientRect() || null,
        card: rect('.desktopAdminDeviceWizardModal .mobileDeviceOverviewCard'),
        add: rect('.desktopAdminDeviceWizardModal .mobileDeviceAddAnother'),
        sideGutters: body && card ? body.getBoundingClientRect().width - card.getBoundingClientRect().width : null,
        saveBackground: save ? getComputedStyle(save).backgroundColor : '',
        saveColor: save ? getComputedStyle(save).color : '',
        bodyBackground: body ? getComputedStyle(body).backgroundColor : '',
        modalRadius: getComputedStyle(document.querySelector('.desktopAdminDeviceWizardModal')).borderRadius,
      };
    });

    expect(geometry.modal?.height).toBeLessThan(520);
    expect(geometry.modal?.height).toBeGreaterThan(260);
    expect(geometry.modal?.width).toBeGreaterThan(500);
    expect(geometry.modal?.width).toBeLessThan(570);
    expect(Math.abs((geometry.modal?.width || 0) - (geometry.wizard?.width || 0))).toBeLessThan(3);
    expect(geometry.sideGutters).toBeLessThan(46);
    expect(geometry.card?.height).toBeLessThan(100);
    expect(geometry.add?.height).toBeLessThan(52);
    expect(geometry.saveBackground).toBe('rgb(37, 45, 58)');
    expect(geometry.saveColor).toBe('rgb(255, 255, 255)');
    expect(geometry.bodyBackground).toBe('rgb(246, 247, 248)');
    expect(geometry.modalRadius).toBe('18px');

    await page.screenshot({ path: testInfo.outputPath('desktop-device-wizard-v935.png'), fullPage: true });
  });
});
