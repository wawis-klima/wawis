import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, login, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 14.72 — kod z telefonu przy logowaniu administratora (MFA TOTP). Atrapa MFA: poprawny kod 123456.
const CODE = '123456';
const { defaultBrowserType: _unused, ...iphone14 } = devices['iPhone 14'];

test.describe('14.72: kod z telefonu — komputer', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('administrator włącza kod w Diagnostyce, a kolejne logowanie wymaga kodu', async ({ page }) => {
    await login(page, ADMIN);
    await expect(page.getByTestId('mfa-challenge')).toHaveCount(0);
    await page.getByRole('button', { name: 'Diagnostyka' }).click();
    const card = page.getByTestId('mfa-settings-card');
    await expect(card.getByTestId('mfa-settings-status')).toHaveText('Wyłączony');
    await card.getByRole('button', { name: 'Włącz kod z telefonu' }).click();
    await expect(card.getByTestId('mfa-qr')).toBeVisible();
    await expect(card.getByTestId('mfa-secret')).toHaveText('MOCKSECRETWAWIS');
    await expect(card.getByTestId('mfa-otpauth-link')).toHaveAttribute('href', /^otpauth:\/\/totp\//);
    const input = card.getByLabel('Kod z aplikacji');
    await input.fill('11a1111');
    await expect(input).toHaveValue('111111');
    await card.getByRole('button', { name: 'Potwierdź i włącz' }).click();
    await expect(card.getByTestId('mfa-settings-error')).toContainText('nieprawidłowy');
    await input.fill(CODE);
    await card.getByRole('button', { name: 'Potwierdź i włącz' }).click();
    await expect(card.getByTestId('mfa-settings-status')).toHaveText('Włączony');
    await expect(card.getByTestId('mfa-settings-info')).toContainText('włączony');

    // Ta sama sesja (już z kodem) po przeładowaniu nie pyta ponownie.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Diagnostyka' })).toBeVisible();
    await expect(page.getByTestId('mfa-challenge')).toHaveCount(0);

    // Nowe logowanie: po haśle krok kodu, bez danych w tle.
    await page.getByRole('button', { name: 'Wyloguj' }).first().click();
    await loginWithoutReset(page, ADMIN);
    const challenge = page.getByTestId('mfa-challenge');
    await expect(challenge).toBeVisible();
    await expect(page.getByRole('button', { name: 'Diagnostyka' })).toHaveCount(0);
    await challenge.getByLabel('Kod z telefonu').fill('000000');
    await challenge.getByRole('button', { name: 'Potwierdź' }).click();
    await expect(page.getByTestId('mfa-challenge-error')).toContainText('nieprawidłowy');
    // Wklejony kod ze spacją (np. z autouzupełniania) też działa.
    await challenge.getByLabel('Kod z telefonu').fill('123 456');
    await expect(challenge.getByLabel('Kod z telefonu')).toHaveValue(CODE);
    await challenge.getByRole('button', { name: 'Potwierdź' }).click();
    await expect(page.getByRole('button', { name: 'Diagnostyka' })).toBeVisible();
    await expect(page.getByTestId('mfa-challenge')).toHaveCount(0);

    // Wyłączenie (sesja z kodem) — kolejne logowanie bez kroku kodu.
    await page.getByRole('button', { name: 'Diagnostyka' }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('mfa-settings-card').getByRole('button', { name: 'Wyłącz kod z telefonu' }).click();
    await expect(page.getByTestId('mfa-settings-status')).toHaveText('Wyłączony');
    await page.getByRole('button', { name: 'Wyloguj' }).first().click();
    await loginWithoutReset(page, ADMIN);
    await expect(page.getByRole('button', { name: 'Diagnostyka' })).toBeVisible();
    await expect(page.getByTestId('mfa-challenge')).toHaveCount(0);
  });

  test('pracownik nie widzi ustawień kodu i loguje się bez zmian', async ({ page }) => {
    await login(page, WORKER);
    await expect(page.getByTestId('mfa-challenge')).toHaveCount(0);
    await expect(page.getByTestId('mfa-settings-card')).toHaveCount(0);
  });
});

test.describe('14.72: kod z telefonu — iPhone', () => {
  test.use(iphone14);

  test('@mobile administrator z włączonym kodem: po haśle krok kodu, potem aplikacja', async ({ page }) => {
    await resetMockSupabase(page);
    await page.evaluate(() => {
      localStorage.setItem('klima-mock-mfa', JSON.stringify({ factors: { 'mock-admin-1': [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'WAWIS — telefon' }] } }));
    });
    await loginWithoutReset(page, ADMIN);
    const challenge = page.getByTestId('mfa-challenge');
    await expect(challenge).toBeVisible();
    await expect(page.getByRole('button', { name: /Wyloguj użytkownika/ })).toHaveCount(0);
    const input = challenge.getByLabel('Kod z telefonu');
    await expect(input).toHaveAttribute('inputmode', 'numeric');
    await expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    await input.fill(CODE);
    await challenge.getByRole('button', { name: 'Potwierdź' }).click();
    await expect(page.getByRole('button', { name: /Wyloguj użytkownika/ })).toBeVisible();
    await expect(page.getByTestId('mfa-challenge')).toHaveCount(0);
  });

  test('@mobile administrator bez kodu i pracownik: logowanie jak dotąd', async ({ page }) => {
    await login(page, WORKER);
    await expect(page.locator('.statusButtonsBar')).toBeVisible();
    await expect(page.getByTestId('mfa-challenge')).toHaveCount(0);
  });
});
