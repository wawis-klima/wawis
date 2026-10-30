import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login } from './mock-helpers.js';

// WAWIS 13.97 (prośba właściciela 28.10.2026): zakładka „Oszczędności na własnym zbiorniku” — tylko administrator,
// tylko wersja na komputer. Ceny urzędowe (MP 2026) i dostawa 5000 l po 7,25 zł brutto (VAT 8%) są w danych testowych.
async function seedRefuels(page) {
  await page.evaluate(() => {
    window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
      const opening = {
        id: 'mock-fuel-tank-opening', movement_type: 'opening', delta_liters: 5000, fuel_entry_id: null,
        note: 'Stan początkowy zbiornika — dostawa 5000 l', happened_at: '2026-10-07T07:57:00.000Z', created_by: null,
        created_at: '2026-10-07T07:57:00.000Z', purchase_gross_per_liter: 7.25, purchase_vat_rate: 8, purchase_net_per_liter: 6.713,
      };
      const refuels = [
        ['mock-1397-e1', 'mock-fuel-vehicle-001', 56.9, '2026-10-09T12:48:01.000Z', 125000],
        ['mock-1397-e2', 'mock-fuel-vehicle-001', 56.73, '2026-10-12T05:49:27.000Z', 125600],
        ['mock-1397-e3', 'mock-fuel-vehicle-002', 51.87, '2026-10-21T06:07:59.000Z', 98000],
      ];
      store.fuel_entries = refuels.map(([id, vehicleId, liters, at, km]) => ({
        id, vehicle_id: vehicleId, liters, odometer_km: km, fueled_at: at, created_at: at, created_by: 'mock-admin-1', odometer_read_source: 'manual',
      }));
      store.fuel_tank_movements = [opening, ...refuels.map(([id, , liters, at]) => ({
        id: `mov-${id}`, movement_type: 'refuel', delta_liters: -liters, fuel_entry_id: id, note: 'Tankowanie pojazdu', happened_at: at, created_by: null, created_at: at,
      }))];
    });
  });
}

test('administrator na komputerze widzi oszczędności, ich źródło i tankowania', async ({ page }) => {
  await login(page, ADMIN);
  await seedRefuels(page);
  await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();

  const panel = page.getByTestId('fuel-savings-panel');
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole('heading', { name: 'Oszczędności na własnym zbiorniku' })).toBeVisible();
  // 56,90 × (7,24 − 6,713) + 56,73 × (7,46 − 6,713) + 51,87 × (7,39 − 6,713) = 29,99 + 42,38 + 35,12
  await expect(page.getByTestId('fuel-savings-total')).toContainText('107,49 zł');
  await expect(panel).toContainText('Z czego to wynika');
  await expect(panel).toContainText('6,71 zł/l netto');
  await expect(panel).toContainText('górne oszacowanie');
  const rows = page.getByTestId('fuel-savings-table').locator('.fuelSavingsTableRow');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('SZA 0673A');
  await expect(rows.first()).toContainText('35,12 zł');
  await expect(rows.first().getByRole('link')).toHaveAttribute('href', /api\.sejm\.gov\.pl\/eli\/acts\/MP\/2026\/1022/);

  // Dostawa z ceną z komputera — pole ceny jest w okienku dostawy.
  await page.getByRole('button', { name: 'Dodaj dostawę' }).click();
  await expect(page.getByTestId('fuel-delivery-price')).toBeVisible();
});

test('dostawa bez ceny: zakładka prosi o cenę i po jej wpisaniu liczy oszczędność', async ({ page }) => {
  await login(page, ADMIN);
  await seedRefuels(page);
  await page.evaluate(() => {
    window.__KLIMA_MOCK_SUPABASE__.mutate((store) => {
      const opening = store.fuel_tank_movements.find((item) => item.movement_type === 'opening');
      opening.purchase_gross_per_liter = null; opening.purchase_vat_rate = null; opening.purchase_net_per_liter = null;
    });
  });
  await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();
  const missing = page.getByTestId('fuel-savings-missing-price');
  await expect(missing).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('fuel-savings-total')).toContainText('0,00 zł');
  await missing.getByLabel('Cena za litr brutto').fill('7,25');
  await missing.getByRole('button', { name: 'Zapisz cenę' }).click();
  await expect(page.getByTestId('fuel-savings-total')).toContainText('107,49 zł');
  await expect(missing).toHaveCount(0);
});

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

test.describe('@mobile oszczędności tylko na komputerze', () => {
  test.use(iphone14);

  test('pracownik na telefonie nie widzi oszczędności ani cen', async ({ page }) => {
    await login(page, WORKER);
    await page.getByRole('button', { name: 'Paliwo' }).click();
    await expect(page.getByRole('heading', { name: 'Tankowania', exact: true })).toBeVisible();
    await expect(page.getByTestId('fuel-savings-panel')).toHaveCount(0);
    await expect(page.getByText(/Oszczędności/)).toHaveCount(0);
  });
});
