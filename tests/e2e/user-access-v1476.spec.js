import { expect, test } from '@playwright/test';
import { ADMIN, WORKER, login } from './mock-helpers.js';

// WAWIS 14.76 — Diagnostyka administratora: logowania kont, „Wyloguj i zablokuj”, „Odblokuj” (atrapa RPC).
test.describe('14.76: logowania i blokada kont — komputer', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('administrator widzi logowania, blokuje i odblokowuje pracownika, ale nie siebie', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: 'Diagnostyka' }).click();
    const card = page.getByTestId('user-access-card');
    await expect(card).toBeVisible();
    const rows = card.getByTestId('user-access-row');
    await expect(rows.first()).toBeVisible();
    await expect(card).toContainText('iPhone, Safari');
    await expect(card).toContainText('(to urządzenie)');

    // Własne konto bez przycisku blokady.
    const selfRow = rows.filter({ hasText: '(to urządzenie)' });
    await expect(selfRow.getByRole('button')).toHaveCount(0);

    const workerRow = rows.filter({ has: page.getByRole('button', { name: 'Wyloguj i zablokuj' }) }).first();
    const workerName = (await workerRow.locator('strong').textContent())?.trim();

    // Anulowanie potwierdzenia nic nie zmienia.
    page.once('dialog', (dialog) => dialog.dismiss());
    await workerRow.getByRole('button', { name: 'Wyloguj i zablokuj' }).click();
    await expect(card.getByTestId('user-access-blocked')).toHaveCount(0);

    page.once('dialog', (dialog) => { expect(dialog.message()).toContain('Konto i historia zostają'); return dialog.accept(); });
    await workerRow.getByRole('button', { name: 'Wyloguj i zablokuj' }).click();
    await expect(card.getByTestId('user-access-info')).toContainText(`Konto „${workerName}” jest zablokowane`);
    const blockedRow = rows.filter({ hasText: workerName });
    await expect(blockedRow.getByTestId('user-access-blocked')).toHaveText('Zablokowane');
    await expect(blockedRow).toContainText('Brak aktywnych logowań.');

    page.once('dialog', (dialog) => dialog.accept());
    await blockedRow.getByRole('button', { name: 'Odblokuj' }).click();
    await expect(card.getByTestId('user-access-info')).toContainText('jest odblokowane');
    await expect(card.getByTestId('user-access-blocked')).toHaveCount(0);
  });

  test('pracownik nie widzi karty logowań', async ({ page }) => {
    await login(page, WORKER);
    await expect(page.getByTestId('user-access-card')).toHaveCount(0);
  });
});
