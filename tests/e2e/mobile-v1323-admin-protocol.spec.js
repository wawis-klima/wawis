import { devices, expect, test } from '@playwright/test';
import { ADMIN, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _browserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

test.describe('@mobile 13.23 — protokół przed zakończeniem', () => {
  test('administrator ma Protokół pod Urządzenia, a Zakończ pozostaje zablokowany', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, ADMIN);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    const actions = page.locator('.mobileInlineJobDetails .adminProtocolActionGridV1323');
    await expect(actions).toBeVisible();
    const rects = await actions.evaluate(root => {
      const rect = cls => {
        const el = root.querySelector('.' + cls);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x:r.x, y:r.y, width:r.width, height:r.height };
      };
      return {
        edit:rect('workerActionEditV1295'), devices:rect('workerActionNameplatesV1295'),
        remove:rect('deleteCardBtn'), protocol:rect('workerActionProtocolV1295'),
        close:rect('workerActionCloseV1295'), finish:rect('workerActionFinishV1295'),
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      };
    });
    for (const key of ['edit','devices','remove','protocol','close','finish']) expect(rects[key]).toBeTruthy();
    expect(rects.devices.x).toBeGreaterThan(rects.edit.x);
    expect(Math.abs(rects.edit.y-rects.devices.y)).toBeLessThan(3);
    expect(rects.protocol.x).toBeGreaterThan(rects.remove.x);
    expect(Math.abs(rects.protocol.y-rects.remove.y)).toBeLessThan(3);
    expect(rects.protocol.y).toBeGreaterThan(rects.devices.y);
    expect(rects.finish.x).toBeGreaterThan(rects.close.x);
    expect(Math.abs(rects.finish.y-rects.close.y)).toBeLessThan(3);
    expect(rects.finish.y).toBeGreaterThan(rects.protocol.y);
    expect(rects.overflow).toBeLessThanOrEqual(2);
    await expect(actions.locator('.workerActionFinishV1295')).toBeDisabled();
    await actions.locator('.workerActionProtocolV1295').click();
    await expect(page.locator('.protocolPaymentMethodField select')).toBeVisible();
  });
});
