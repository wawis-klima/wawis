import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login } from './mock-helpers.js';

// WAWIS 13.97 (prośba właściciela 28.10.2026): zakładka „Oszczędności na własnym zbiorniku” — tylko administrator,
// tylko wersja na komputer; od 30.10 cena na stacji = średnia dla Śląska (AutoCentrum → zapaliwo.pl → urzędowa). Ceny urzędowe (MP 2026) i dostawa 5000 l po 7,25 zł brutto (VAT 8%) są w danych testowych.
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

async function openSavings(page) {
  await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();
  const section = page.getByTestId('fuel-savings-section');
  await expect(section).toBeVisible({ timeout: 20_000 });
  await section.getByRole('button', { name: 'Rozwiń oszczędności na własnym zbiorniku' }).click();
  const panel = page.getByTestId('fuel-savings-panel');
  await expect(panel).toBeVisible({ timeout: 20_000 });
  return panel;
}

test('administrator na komputerze widzi oszczędności wg średniej dla Śląska, ich źródło i tankowania', async ({ page }) => {
  await login(page, ADMIN);
  await seedRefuels(page);
  const panel = await openSavings(page);
  await expect(page.getByRole('heading', { name: 'Oszczędności na własnym zbiorniku' })).toBeVisible();
  // Średnia tygodniowa dla Śląska (AutoCentrum, brutto, VAT 8%) − 6,713 zł netto ze zbiornika:
  // 56,90 × (7,86/1,08 − 6,713) + 56,73 × (7,80/1,08 − 6,713) + 51,87 × (7,92/1,08 − 6,713) = 32,14 + 28,89 + 32,18
  await expect(page.getByTestId('fuel-savings-total')).toContainText('93,21 zł');
  await expect(panel).toContainText('Z czego to wynika');
  await expect(panel).toContainText('6,71 zł/l netto');
  await expect(panel).toContainText('średnia tygodniowa dla Śląska z AutoCentrum');
  const rows = page.getByTestId('fuel-savings-table').locator('.fuelSavingsTableRow');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('SZA 0673A');
  await expect(rows.first()).toContainText('32,18 zł');
  await expect(rows.first().getByTestId('fuel-savings-source')).toHaveText('AutoCentrum');
  await expect(rows.first().getByRole('link')).toHaveAttribute('href', /autocentrum\.pl\/paliwa\/ceny-paliw\/slaskie\/on/);

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
  await openSavings(page);
  const missing = page.getByTestId('fuel-savings-missing-price');
  await expect(missing).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('fuel-savings-total')).toContainText('0,00 zł');
  await missing.getByLabel('Cena za litr brutto').fill('7,25');
  await missing.getByRole('button', { name: 'Zapisz cenę' }).click();
  await expect(page.getByTestId('fuel-savings-total')).toContainText('93,21 zł');
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

test('komputer: bez „Nowe tankowanie”; kolejność 1–4, tylko „Tankowania według samochodu” rozwinięte', async ({ page }) => {
  await login(page, ADMIN);
  await seedRefuels(page);
  await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();
  await expect(page.getByRole('heading', { name: 'Tankowania według samochodu' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Nowe tankowanie' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Potwierdź i zapisz tankowanie' })).toHaveCount(0);

  const headings = await page.locator('.fuelCard h3').allTextContents();
  expect(headings.slice(0, 4)).toEqual(['Tankowania według samochodu', 'Oszczędności na własnym zbiorniku', 'Raport miesięczny floty', 'Wszystkie tankowania']);
  const steps = await page.locator('.fuelCard .fuelStep').allTextContents();
  expect(steps.slice(0, 4)).toEqual(['1', '2', '3', '4']);

  await expect(page.locator('.fuelVehicleSummaryRow').first()).toBeVisible();
  await expect(page.getByTestId('fuel-savings-panel')).toHaveCount(0);
  await expect(page.locator('.fuelMonthlySummary')).toHaveCount(0);
  await expect(page.locator('.fuelHistoryRow')).toHaveCount(0);

  // Zwijanie i rozwijanie.
  await page.getByRole('button', { name: 'Zwiń tankowania według samochodu' }).click();
  await expect(page.locator('.fuelVehicleSummaryRow')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rozwiń tankowania według samochodu' }).click();
  await page.getByRole('button', { name: 'Rozwiń raport miesięczny floty' }).click();
  await expect(page.locator('.fuelMonthlySummary')).toBeVisible();
  await page.getByRole('button', { name: 'Rozwiń wszystkie tankowania' }).click();
  await expect(page.locator('.fuelHistoryRow')).toHaveCount(3);
  await page.getByRole('button', { name: 'Zwiń wszystkie tankowania' }).click();
  await expect(page.locator('.fuelHistoryRow')).toHaveCount(0);

  // Kliknięcie samochodu pokazuje (rozwija) jego historię.
  await page.locator('.fuelVehicleSummaryRow').filter({ hasText: 'SZA 0673A' }).click();
  await expect(page.getByRole('heading', { name: /Historia: .*SZA 0673A/ })).toBeVisible();
  await expect(page.locator('.fuelHistoryRow')).toHaveCount(1);
});
