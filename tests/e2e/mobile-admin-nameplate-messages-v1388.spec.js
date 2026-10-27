import { devices, expect, test } from '@playwright/test';
import { ADMIN, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.88 (zgłoszenie właściciela 27.10.2026, Biała 4a): u administratora przy brakującej tabliczce
// pokazywał się zielony „Urządzenia są dodane. Uzupełnij protokół…” obok czerwonego „Krok 1/3…”.
// Teraz zielony komunikat tylko przy komplecie tabliczek, a „Krok 1/3” mówi, której brakuje.
const { defaultBrowserType: _browserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);
const STORE_KEY = 'klima-mock-supabase-store-v3';

async function openJobBWithPlates(page, unitRefs) {
  await resetMockSupabase(page);
  await page.evaluate(({ key, refs }) => {
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    for (const unitRef of refs) {
      store.photos.push({
        id: 'mock-1388-plate-' + unitRef, job_id: 'mock-job-002',
        photo_kind: 'nameplate', device_index: 1, unit_ref: unitRef,
        storage_path: 'mock-job-002/nameplates/device-1_' + unitRef + '_1388.jpg',
        upload_status: 'uploaded', created_at: '2026-10-27T13:00:00.000Z',
      });
    }
    localStorage.setItem(key, JSON.stringify(store));
  }, { key: STORE_KEY, refs: unitRefs });
  await loginWithoutReset(page, ADMIN);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy B', { exact: true }).click();
  await expect(page.locator('.mobileInlineJobDetails .adminProtocolActionGridV1323')).toBeVisible();
}

test('@mobile 13.88: admin — brak tabliczki JZ: bez zielonego „Urządzenia są dodane”, „Krok 1/3” mówi czego brakuje', async ({ page }) => {
  await openJobBWithPlates(page, ['jw-1']);
  const details = page.locator('.mobileInlineJobDetails');
  const step = details.getByTestId('finish-nameplate-step-missing');
  await expect(step).toBeVisible({ timeout: 20_000 });
  await expect(step).toContainText('Krok 1/3');
  await expect(step).toContainText('Brakuje: JZ urządzenia 1.');
  await expect(step).not.toContainText('JW urządzenia 1');
  await expect(details.getByText(/Urządzenia są dodane/)).toHaveCount(0);
  await expect(details.locator('.workerActionProtocolV1295')).toBeDisabled();
});

test('@mobile 13.88: admin — komplet tabliczek: zielony komunikat wraca, bez „Krok 1/3”', async ({ page }) => {
  await openJobBWithPlates(page, ['jz', 'jw-1']);
  const details = page.locator('.mobileInlineJobDetails');
  await expect(details.locator('.workerActionProtocolV1295')).toBeEnabled({ timeout: 20_000 });
  await expect(details.getByText('Urządzenia są dodane. Uzupełnij protokół, aby zakończyć zlecenie.')).toBeVisible();
  await expect(details.getByTestId('finish-nameplate-step-missing')).toHaveCount(0);
});
