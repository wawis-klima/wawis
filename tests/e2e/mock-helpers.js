export async function resetMockSupabase(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__KLIMA_MOCK_SUPABASE__?.reset));
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.__KLIMA_MOCK_SUPABASE__.reset();
  });
}

export async function loginWithoutReset(page, credentials) {
  await page.goto('/');
  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByRole('button', { name: 'Zaloguj' }).click();
}

export async function login(page, credentials) {
  await resetMockSupabase(page);
  await loginWithoutReset(page, credentials);
}

export const ADMIN = { email: 'admin@wawis.test', password: 'test1234' };
export const WORKER = { email: 'pracownik@wawis.test', password: 'test1234' };
