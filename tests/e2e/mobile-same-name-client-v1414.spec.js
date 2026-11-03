import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _ignored, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

// WAWIS 14.14 — pracownik dodaje klienta o nazwie, która już jest w bazie („Klient Testowy A”,
// tel. 500100200, Warszawa). Montaż nie może trafić po cichu do istniejącego klienta.
async function fillWorkerClient(page, { phone, email = '' }) {
  await page.getByRole('button', { name: /Dodaj nowego klienta/ }).first().click();
  const modal = page.locator('.formModal').first();
  await expect(modal).toBeVisible();
  await modal.getByPlaceholder('Klient', { exact: true }).fill('Klient Testowy A');
  if (email) await modal.getByPlaceholder('Email klienta').fill(email);
  await modal.getByPlaceholder('Telefon klienta / SMS').fill(phone);
  await modal.getByPlaceholder('Ulica i numer').fill('Inna 7');
  await modal.getByPlaceholder('Miejscowość').fill('Myszków');
  return modal;
}

const jobsForClient = (page) => page.evaluate(() => {
  const store = window.__KLIMA_MOCK_SUPABASE__?.getStore();
  return (store?.jobs || [])
    .filter((job) => job.client === 'Klient Testowy A')
    .map((job) => ({ id: job.id, contractor_id: job.contractor_id || null, phone: job.phone }));
});

test.describe('@mobile WAWIS 14.14 — klient o tej samej nazwie', () => {
  test('pracownik: „inna osoba” zatrzymuje zapis, dane zostają w formularzu', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    const dialogs = [];
    page.on('dialog', async (dialog) => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      if (dialog.type() === 'confirm') await dialog.dismiss();
      else await dialog.accept();
    });
    const before = await jobsForClient(page);
    const modal = await fillWorkerClient(page, { phone: '501999888' });
    await modal.getByRole('button', { name: 'Dodaj klienta' }).click();

    await expect.poll(() => dialogs.map((item) => item.type), { timeout: 15000 }).toEqual(['confirm', 'alert']);
    expect(dialogs[0].message).toContain('W bazie jest już klient „Klient Testowy A”');
    expect(dialogs[0].message).toContain('Warszawa, Klimatyczna 12');
    expect(dialogs[0].message).toContain('kończący się na 200');
    expect(dialogs[1].message).toContain('Montaż nie został zapisany');
    expect(dialogs[1].message).toContain('dopisz do nazwy miejscowość');

    await expect(modal).toBeVisible();
    await expect(modal.getByPlaceholder('Telefon klienta / SMS')).toHaveValue('501999888');
    expect(await jobsForClient(page)).toEqual(before);
  });

  test('pracownik: „ten sam klient” zapisuje montaż u istniejącego klienta', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    const dialogs = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.accept();
    });
    const before = await jobsForClient(page);
    const modal = await fillWorkerClient(page, { phone: '501999888' });
    await modal.getByRole('button', { name: 'Dodaj klienta' }).click();

    await expect.poll(async () => (await jobsForClient(page)).length, { timeout: 20000 }).toBe(before.length + 1);
    expect(dialogs[0]).toBe('confirm');
    const created = (await jobsForClient(page)).find((job) => !before.some((item) => item.id === job.id));
    expect(created.contractor_id).toBe('mock-contractor-001');
  });

  test('pracownik: ten sam telefon potwierdza klienta bez pytania', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    const dialogs = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.accept();
    });
    const before = await jobsForClient(page);
    const modal = await fillWorkerClient(page, { phone: '+48 500 100 200' });
    await modal.getByRole('button', { name: 'Dodaj klienta' }).click();

    await expect.poll(async () => (await jobsForClient(page)).length, { timeout: 20000 }).toBe(before.length + 1);
    expect(dialogs).not.toContain('confirm');
  });
});
