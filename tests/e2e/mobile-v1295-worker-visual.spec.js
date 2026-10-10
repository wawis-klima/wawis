import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function openActive(page, credentials) {
  await resetMockSupabase(page);
  await loginWithoutReset(page, credentials);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).click();
}

test.describe('@mobile 12.95 — zmiany pracownika bez naruszania administratora', () => {
  test('pracownik ma akcje w oczekiwanych kolumnach i przycisk zakończenia pozostaje zablokowany', async ({ page }) => {
    await openActive(page, WORKER);
    const actions = page.locator('.mobileInlineJobDetails .workerDetailsActionGridV1295');
    await expect(actions).toBeVisible();
    const positions = await actions.evaluate((root) => {
      const get = cls => {
        const e = root.querySelector('.' + cls);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      return {
        edit: get('workerActionEditV1295'),
        close: get('workerActionCloseV1295'),
        plates: get('workerActionNameplatesV1295'),
        protocol: get('workerActionProtocolV1295'),
        finish: get('workerActionFinishV1295'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    for (const key of ['edit','close','plates','protocol','finish']) expect(positions[key]).toBeTruthy();
    expect(positions.edit.left).toBeLessThan(positions.plates.left);
    expect(positions.close.left).toBeLessThan(positions.protocol.left);
    expect(Math.abs(positions.edit.top - positions.plates.top)).toBeLessThan(3);
    expect(Math.abs(positions.close.top - positions.protocol.top)).toBeLessThan(3);
    expect(positions.finish.top).toBeGreaterThan(positions.protocol.top);
    expect(positions.overflow).toBeLessThanOrEqual(2);
    await expect(actions.locator('.workerActionFinishV1295')).toBeDisabled();
  });

  test('pracownik ma kompaktową edycję i wyrównaną datę bez przekroczenia szerokości iPhone', async ({ page }) => {
    await openActive(page, WORKER);
    await page.locator('.workerDetailsActionGridV1295 .workerActionEditV1295').click();
    const modal = page.locator('.workerMobileEditModalV1295');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'Edytuj montaż' })).toBeVisible();
    const layout = await modal.evaluate(el => {
      const rect = sel => el.querySelector(sel)?.getBoundingClientRect();
      const input = rect('input.input');
      const label = rect('.installationDateLabelRow > span');
      const clear = rect('.installationDateClearBtn');
      const date = rect('.installationDateInputShell');
      const modalRect = el.getBoundingClientRect();
      return {
        height:input?.height, labelY:label?.y, labelH:label?.height, clearY:clear?.y, clearH:clear?.height,
        dateY:date?.y, modalRight:modalRect.right, width:document.documentElement.clientWidth,
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        scroll:getComputedStyle(el).overflowY,
      };
    });
    expect(layout.height).toBeGreaterThanOrEqual(40);
    expect(layout.height).toBeLessThanOrEqual(47);
    expect(Math.abs((layout.labelY + layout.labelH/2) - (layout.clearY + layout.clearH/2))).toBeLessThan(8);
    expect(layout.dateY).toBeGreaterThan(layout.labelY);
    expect(layout.modalRight).toBeLessThanOrEqual(layout.width + 2);
    expect(layout.overflow).toBeLessThanOrEqual(2);
    expect(layout.scroll).toBe('auto');
    const dateText = modal.locator('.workerDateVisibleLabelV1296');
    const nativeDate = modal.locator('input.installationDateNativeInput[type="date"]');
    await expect(dateText).toBeVisible();
    await expect(nativeDate).toHaveCSS('opacity', '0');
    // Previous regression checked the heading/clear but missed the actual
    // rendered date text, which iOS WebKit was painting at the top.
    const center = await modal.evaluate((el) => {
      const shell = el.querySelector('.installationDateInputShell').getBoundingClientRect();
      const displayed = el.querySelector('.workerDateVisibleLabelV1296').getBoundingClientRect();
      const input = el.querySelector('.installationDateNativeInput').getBoundingClientRect();
      const shellCenter = shell.top + shell.height / 2;
      const labelCenter = displayed.top + displayed.height / 2;
      return {
        centerDelta: Math.abs(shellCenter - labelCenter),
        inputHeightDelta: Math.abs(shell.height - input.height),
        inputWidthDelta: Math.abs(shell.width - input.width),
        textAlign: getComputedStyle(el.querySelector('.workerDateVisibleLabelV1296')).alignItems,
      };
    });
    expect(center.centerDelta).toBeLessThanOrEqual(2);
    expect(center.inputHeightDelta).toBeLessThanOrEqual(2);
    expect(center.inputWidthDelta).toBeLessThanOrEqual(2);
    expect(center.textAlign).toBe('center');
    await nativeDate.fill('2026-10-16');
    await expect(nativeDate).toHaveValue('2026-10-16');
    await expect(dateText).toContainText(/16 paź/i);
    await modal.locator('.installationDateClearBtn').click();
    await expect(dateText).toHaveText('Wybierz datę');
    await expect(nativeDate).toHaveValue('');
    await expect(modal.getByRole('button', { name:'Zapisz zmiany' })).toBeAttached();
  });

  test('protokół pracownika ma krótszy tekst wyboru płatności', async ({ page }) => {
    await openActive(page, WORKER);
    await page.locator('.workerDetailsActionGridV1295 .workerActionProtocolV1295').click();
    const method = page.locator('.protocolPaymentMethodField select');
    await expect(method).toBeVisible();
    await expect(method.locator('option[value=""]')).toHaveText('Gotówka lub przelew');
    await expect(method.locator('option')).toHaveCount(3);
  });

  test('administrator zachowuje akcje, ale edycja nie pokazuje urządzeń i monterów oraz centruje datę', async ({ page }) => {
    await openActive(page, ADMIN);
    const actions = page.locator('.mobileInlineJobDetails .detailActionsBottom.mobileFourButtons');
    await expect(actions).toBeVisible();
    await expect(actions).not.toHaveClass(/workerDetailsActionGridV1295/);
    await actions.getByRole('button', { name:'Edytuj', exact:true }).click();
    const modal = page.locator('.formModal');
    await expect(modal).toBeVisible();
    await expect(modal).not.toHaveClass(/workerMobileEditModalV1295/);
    await expect(modal).toHaveClass(/adminMobileEditModalV1297/);
    await expect(modal.locator('.workerDateVisibleLabelV1296')).toHaveCount(0);
    await expect(modal.locator('.jobDevicesSection')).toHaveCount(0);
    await expect(modal.getByRole('heading', { name: /Instalatorzy/ })).toHaveCount(0);
    await expect(modal.locator('.viewerGrid')).toHaveCount(0);
    // WAWIS 12.99: assert actual rendered geometry, not merely CSS source existence.
    const compactLayout = await modal.evaluate((el) => {
      const rect = (selector) => el.querySelector(selector)?.getBoundingClientRect();
      const email = rect('input[placeholder="Email klienta"]');
      const phone = rect('input[placeholder="Telefon klienta / SMS"]');
      const nip = rect('input.jobNipCompactInput');
      const input = el.querySelector('input[placeholder="Email klienta"]');
      return {
        emailHeight:email?.height,
        phoneHeight:phone?.height,
        nipHeight:nip?.height,
        phoneGap:phone && email ? phone.top-email.bottom : -1,
        nipGap:nip && phone ? nip.top-phone.bottom : -1,
        closeHeight:rect('.jobHead > .btn')?.height,
        voiceHeight:rect('.voiceClientMainBtn')?.height,
        dateHeight:rect('.installationDateInputShell')?.height,
        fontSize:input ? parseFloat(getComputedStyle(input).fontSize) : 0,
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      };
    });
    for (const k of ['emailHeight','phoneHeight','nipHeight','closeHeight','voiceHeight','dateHeight']) {
      expect(compactLayout[k], k + ' must actually render in compact size').toBeGreaterThanOrEqual(35);
      expect(compactLayout[k], k + ' must not render with old large size').toBeLessThanOrEqual(40);
    }
    expect(compactLayout.phoneGap).toBeGreaterThanOrEqual(3);
    expect(compactLayout.phoneGap).toBeLessThanOrEqual(8);
    expect(compactLayout.nipGap).toBeGreaterThanOrEqual(3);
    expect(compactLayout.nipGap).toBeLessThanOrEqual(8);
    expect(compactLayout.fontSize).toBeGreaterThanOrEqual(16);
    expect(compactLayout.overflow).toBeLessThanOrEqual(2);
    await expect(modal.getByRole('heading', { name:'Edytuj montaż' })).toBeVisible();
    const dateText = modal.locator('.adminDateVisibleLabelV1297');
    const nativeDate = modal.locator('input.installationDateNativeInput[type="date"]');
    await expect(dateText).toBeVisible();
    await expect(nativeDate).toHaveCSS('opacity', '0');
    const geometry = await modal.evaluate((el) => {
      const shell = el.querySelector('.installationDateInputShell').getBoundingClientRect();
      const label = el.querySelector('.adminDateVisibleLabelV1297').getBoundingClientRect();
      const input = el.querySelector('.installationDateNativeInput').getBoundingClientRect();
      return {
        center: Math.abs(shell.top + shell.height / 2 - label.top - label.height / 2),
        hitArea: Math.abs(shell.width - input.width) + Math.abs(shell.height - input.height),
        verticalAlignment: getComputedStyle(el.querySelector('.adminDateVisibleLabelV1297')).alignItems,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.center).toBeLessThanOrEqual(2);
    // Obszar inputu pokrywa wnętrze powłoki; po 1px ramki na krawędź daje do 4px sumy różnic.
    expect(geometry.hitArea).toBeLessThanOrEqual(4);
    expect(geometry.verticalAlignment).toBe('center');
    expect(geometry.overflow).toBeLessThanOrEqual(2);
    await nativeDate.fill('2026-10-16');
    await expect(dateText).toContainText(/16 paź/i);
    await modal.locator('.installationDateClearBtn').click();
    await expect(nativeDate).toHaveValue('');
    await expect(dateText).toHaveText('Wybierz datę');
    await expect(modal.getByRole('button', { name:'Zapisz zmiany' })).toBeEnabled();
  });
});
