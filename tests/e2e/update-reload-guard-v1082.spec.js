import { expect, test } from '@playwright/test';
import { ADMIN, login, resetMockSupabase } from './mock-helpers.js';

async function guardState(page) {
  return page.evaluate(async () => {
    const guard = await import('/src/modules/update-reload-guard.js');
    return guard.getUpdateReloadGuardState();
  });
}

test.describe('v10.82 update reload guard — real React integration', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test.beforeEach(async ({ page }) => {
    await resetMockSupabase(page);
  });

  test('timer ponownie sprawdza bloker, który pojawił się już po zaplanowaniu reloadu', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const guard = await import('/src/modules/update-reload-guard.js');
      guard.__resetUpdateReloadGuardForTests();
      const scheduled = guard.requestUpdateReload('e2e-timer-recheck', { delayMs: 120 });
      await new Promise((resolve) => setTimeout(resolve, 25));
      guard.blockUpdateReload('e2e-late-blocker');
      await new Promise((resolve) => setTimeout(resolve, 150));
      const state = guard.getUpdateReloadGuardState();
      guard.__resetUpdateReloadGuardForTests();
      return { scheduled, state };
    });
    expect(result.scheduled).toBe(true);
    expect(result.state.blockers).toBe(1);
    expect(result.state.pending).toBe(true);
    expect(result.state.reloadScheduled).toBe(false);
  });

  test('rerender otwartego formularza nie zwalnia blokady, a beforeunload pojawia się dopiero po zmianie danych', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /^Montaże$/ }).click();
    await page.locator('button.desktopActionBtn.primary[title="Dodaj"]').click();
    const heading = page.getByRole('heading', { name: 'Nowy montaż / zlecenie' });
    await expect(heading).toBeVisible();

    let state = await guardState(page);
    expect(state.blockers).toBeGreaterThanOrEqual(1);
    expect(state.beforeUnloadWarnings).toBe(0);

    const deferred = await page.evaluate(async () => {
      const guard = await import('/src/modules/update-reload-guard.js');
      return guard.requestUpdateReload('e2e-react-rerender');
    });
    expect(deferred).toBe(false);

    await page.getByRole('textbox', { name: 'Klient', exact: true }).fill('Niezapisany draft 10.82');
    await page.waitForTimeout(100);
    await expect(heading).toBeVisible();
    state = await guardState(page);
    expect(state.blockers).toBeGreaterThanOrEqual(1);
    expect(state.pending).toBe(true);
    expect(state.beforeUnloadWarnings).toBeGreaterThanOrEqual(1);
  });

  test('paliwo i komentarz inline rejestrują ochronę dopiero po wpisaniu niezapisanych danych', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /Tankowania|Paliwo/ }).click();
    await page.getByRole('button', { name: /Rozwiń/ }).click();

    let state = await guardState(page);
    expect(state.blockers).toBe(0);
    expect(state.beforeUnloadWarnings).toBe(0);

    await page.getByPlaceholder('np. 48,5').fill('21,5');
    await page.waitForTimeout(25);
    state = await guardState(page);
    expect(state.blockers).toBeGreaterThanOrEqual(1);
    expect(state.beforeUnloadWarnings).toBeGreaterThanOrEqual(1);

    await page.getByPlaceholder('np. 48,5').fill('');
    await page.waitForTimeout(25);
    state = await guardState(page);
    expect(state.blockers).toBe(0);
    expect(state.beforeUnloadWarnings).toBe(0);

    await page.getByRole('button', { name: /^Montaże$/ }).click();
    await page.getByRole('button', { name: /W trakcie:/ }).click();
    await page.getByRole('table').getByText('Klient Testowy B', { exact: true }).click();
    const comment = page.getByPlaceholder('Napisz komentarz...');
    await expect(comment).toBeVisible();
    await comment.fill('Niezapisany komentarz 10.82');
    await page.waitForTimeout(25);
    state = await guardState(page);
    expect(state.blockers).toBeGreaterThanOrEqual(1);
    expect(state.beforeUnloadWarnings).toBeGreaterThanOrEqual(1);
  });
});
