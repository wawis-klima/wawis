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
    // Nie można wystawić protokołu przed zapisaniem wymaganych tabliczek.
    await expect(actions.locator('.workerActionProtocolV1295')).toBeDisabled();
    await expect(actions.locator('.workerActionProtocolV1295')).toHaveAttribute('title', /Najpierw dodaj/);
    await expect(page.getByText(/Krok 1\/3: uzupełnij i zsynchronizuj tabliczki/)).toBeVisible();
  });
  test('kolejne etapy: zapisane JW/JZ → aktywny Protokół → podpisany protokół → aktywne Zakończ', async ({ page }) => {
    await resetMockSupabase(page);
    await page.evaluate(() => {
      const key = 'klima-mock-supabase-store-v3';
      const store = JSON.parse(localStorage.getItem(key) || '{}');
      for (const unitRef of ['jz', 'jw-1']) {
        store.photos.push({
          id: 'mock-stage-plate-' + unitRef, job_id: 'mock-job-002',
          photo_kind: 'nameplate', device_index: 1, unit_ref: unitRef,
          storage_path: 'mock-job-002/nameplates/device-1_' + unitRef + '_test.jpg',
          upload_status: 'uploaded', created_at: '2026-10-16T06:00:00.000Z',
        });
      }
      localStorage.setItem(key, JSON.stringify(store));
    });
    await loginWithoutReset(page, ADMIN);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();

    const actions = page.locator('.mobileInlineJobDetails .adminProtocolActionGridV1323');
    const protocol = actions.locator('.workerActionProtocolV1295');
    const finish = actions.locator('.workerActionFinishV1295');
    await expect(protocol).toBeEnabled();
    await expect(finish).toBeDisabled();
    await protocol.click();
    await expect(page.locator('.protocolPaymentMethodField select')).toBeVisible();

    await page.evaluate(() => {
      const key = 'klima-mock-supabase-store-v3';
      const store = JSON.parse(localStorage.getItem(key) || '{}');
      store.job_protocols = [{
        id: 'mock-signed-protocol', job_id: 'mock-job-002',
        storage_path: 'mock-job-002/signed-protocol.pdf',
        file_name: 'protokol-testowy.pdf', file_size_bytes: 12500,
        signed_at: '2026-10-16T06:05:00.000Z', created_at: '2026-10-16T06:05:00.000Z',
        created_by: 'mock-admin-1',
      }];
      localStorage.setItem(key, JSON.stringify(store));
    });
    await page.reload();
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await expect(page.locator('.mobileInlineJobDetails .adminProtocolActionGridV1323 .workerActionFinishV1295')).toBeEnabled();
  });

});
