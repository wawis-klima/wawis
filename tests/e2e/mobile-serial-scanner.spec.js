import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const MOCK_STORE_KEY = 'klima-mock-supabase-store-v3';
const tinyPng = {
  name: 'tabliczka-znamionowa.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==', 'base64'),
};
const tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==';
let manualVerificationCounter = 0;

test.use(iphone14);

async function selectNameplateAndCrop(page, input) {
  await input.setInputFiles(tinyPng);
  const cropModal = page.locator('.nameplateCropModal');
  await expect(cropModal).toBeVisible();
  await expect(page.getByText('Dopasuj kadr', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz kadr' }).click();

  const saveAnyway = page.getByRole('button', { name: 'Zapisz mimo to', exact: true });
  const outcome = await Promise.race([
    cropModal.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => 'hidden'),
    saveAnyway.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'override'),
  ]);
  if (outcome === 'override') {
    await saveAnyway.click();
  }
  await expect(cropModal).toBeHidden();

  const verifyModal = page.locator('.nameplateVerifyModal');
  await expect(verifyModal).toBeVisible();
  const manualButton = page.getByRole('button', { name: 'Wpisz ręcznie', exact: true });
  if (await manualButton.isVisible().catch(() => false)) {
    await manualButton.click({ force: true, timeout: 5_000 }).catch(() => {});
  }
  const modelInput = page.getByPlaceholder('Przepisz model z tabliczki');
  const serialInput = page.getByPlaceholder('Przepisz numer seryjny');
  await expect(modelInput).toBeVisible();
  manualVerificationCounter += 1;
  await modelInput.fill(`Rotenso E2E ${manualVerificationCounter}`);
  await serialInput.fill(`E2ESERIAL${String(manualVerificationCounter).padStart(4, '0')}`);
  await page.getByRole('button', { name: 'Potwierdź', exact: true }).click();
  await expect(verifyModal).toBeHidden();
}

test.describe('@mobile iPhone — uproszczony kreator urządzeń bez OCR z kadrowaniem tabliczek', () => {
  test('chowa miniatury tabliczek i pokazuje zdjęcie dopiero po kliknięciu', async ({ page }, testInfo) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);

    await page.evaluate(({ storeKey, imageUrl }) => {
      const store = JSON.parse(window.localStorage.getItem(storeKey) || '{}');
      store.photos = Array.isArray(store.photos) ? store.photos : [];
      store.photos.push(
        {
          id: 'mock-e2e-nameplate-jz',
          job_id: 'mock-job-002',
          image_url: imageUrl,
          storage_path: 'mock-job-002/nameplates/device-1_jz_MOCK-MIT-002_e2e.jpg',
          uploaded_by: 'mock-worker-1',
          created_at: '2026-09-14T10:00:00.000Z',
          photo_kind: 'nameplate',
          device_index: 1,
          unit_ref: 'jz',
          device_ref: 'device-1-jz',
          upload_status: 'uploaded',
        },
        {
          id: 'mock-e2e-nameplate-jw1',
          job_id: 'mock-job-002',
          image_url: imageUrl,
          storage_path: 'mock-job-002/nameplates/device-1_jw-1_MOCK-MIT-JW-002_e2e.jpg',
          uploaded_by: 'mock-worker-1',
          created_at: '2026-09-14T10:01:00.000Z',
          photo_kind: 'nameplate',
          device_index: 1,
          unit_ref: 'jw-1',
          device_ref: 'device-1-jw-1',
          upload_status: 'uploaded',
        },
      );
      window.localStorage.setItem(storeKey, JSON.stringify(store));
    }, { storeKey: MOCK_STORE_KEY, imageUrl: tinyPngDataUrl });

    await page.reload();
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await expect(page.getByText('Urządzenia i tabliczki', { exact: true })).toBeVisible();

    const deviceToggle = page.getByRole('button', { name: 'Rozwiń Urządzenie 1' });
    await expect(deviceToggle).toBeVisible();
    await expect(deviceToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.deviceUnitDocumentationRow')).toHaveCount(2);
    await expect(page.locator('.deviceUnitDocumentationRow').first()).toBeHidden();
    await deviceToggle.click();
    await expect(page.getByRole('button', { name: 'Zwiń Urządzenie 1' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.deviceUnitDocumentationRow').first()).toBeVisible();
    await expect(page.locator('[data-mobile-device-table="8.89"]')).toBeVisible();
    await expect(page.locator('.deviceUnitDocumentationTableHeader > span')).toHaveText([
      'Urządzenie',
      'Model / moc',
      'Tabliczka',
      'Status',
    ]);
    const deviceTableLayout = await page.locator('.deviceUnitDocumentationRow').first().evaluate((row) => {
      const style = getComputedStyle(row);
      const cells = [...row.children].map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right };
      });
      return {
        display: style.display,
        columns: style.gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        noRowOverflow: row.scrollWidth <= row.clientWidth,
        noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        leftToRight: cells.every((cell, index) => index === 0 || cell.x > cells[index - 1].x),
        sameVisualRow: cells.every((cell) => Math.abs(cell.y - cells[0].y) < 18),
      };
    });
    expect(deviceTableLayout).toEqual({
      display: 'grid',
      columns: 4,
      noRowOverflow: true,
      noPageOverflow: true,
      leftToRight: true,
      sameVisualRow: true,
    });
    await page.screenshot({ path: testInfo.outputPath('mobile-device-table-v8.89.png'), fullPage: true });
    await expect(page.locator('.deviceUnitDocumentationRow img')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Otwórz tabliczkę znamionową/ })).toHaveCount(2);
    await expect(page.getByText('Stary zapis numeru seryjnego:')).toHaveCount(0);

    await page.getByRole('button', { name: 'Otwórz tabliczkę znamionową JZ' }).click();
    await expect(page.locator('.previewImageWrap .fullPreview')).toBeVisible();

    const lockedPreviewState = await page.evaluate(() => {
      const overlay = document.querySelector('.previewOverlay');
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      return {
        bodyPosition: document.body.style.position,
        bodyOverflow: document.body.style.overflow,
        bodyTop: document.body.style.top,
        rootOverflow: document.documentElement.style.overflow,
        rootOverscroll: document.documentElement.style.overscrollBehavior,
        overlayTouchAction: overlayStyle?.touchAction || '',
        overlayOverscroll: overlayStyle?.overscrollBehavior || '',
      };
    });
    expect(lockedPreviewState.bodyPosition).toBe('fixed');
    expect(lockedPreviewState.bodyOverflow).toBe('hidden');
    expect(lockedPreviewState.rootOverflow).toBe('hidden');
    expect(lockedPreviewState.rootOverscroll).toBe('none');
    expect(lockedPreviewState.overlayTouchAction).toBe('none');
    expect(lockedPreviewState.overlayOverscroll).toBe('none');
    expect(lockedPreviewState.bodyTop).toMatch(/^-?\d+px$/);

    await page.mouse.wheel(0, 500);
    const bodyTopAfterWheel = await page.evaluate(() => document.body.style.top);
    expect(bodyTopAfterWheel).toBe(lockedPreviewState.bodyTop);

    await page.keyboard.press('Escape');
    await expect(page.locator('.previewOverlay')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.position)).not.toBe('fixed');
  });

  test('nie pozwala pracownikowi zakończyć zlecenia bez tabliczki JZ i każdej JW', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();

    await expect(page.getByText('Nie można zakończyć zlecenia.', { exact: true })).toBeVisible();
    await expect(page.getByText(/Brakuje: JZ urządzenia 1, JW 1 urządzenia 1, JW 2 urządzenia 1, JW 3 urządzenia 1/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zakończ', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Dodaj brakujące tabliczki' }).click();
    await expect(page.locator('.mobileDeviceWizard')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Urządzenia', exact: true })).toBeVisible();
    await expect(page.getByText('Multi', { exact: true })).toBeVisible();

    // Niepełny zestaw można zapisać, ale zakończenie nadal pozostaje zablokowane.
    await page.getByRole('button', { name: 'Zapisz urządzenia i tabliczki' }).click();
    await expect(page.locator('.mobileDeviceWizard')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Zakończ', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Dodaj brakujące tabliczki' }).click();
    await page.locator('.mobileDeviceOverviewOpen').first().click();
    await expect(page.getByText('Tryb: Multi', { exact: true })).toBeVisible();

    await page.locator('.mobileMultiOutdoorCard').click();
    await selectNameplateAndCrop(page, page.locator('.nameplateGalleryInput'));
    await expect(page.getByText('Potwierdzona', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz jednostkę' }).click();

    for (let index = 0; index < 3; index += 1) {
      await page.locator('.mobileMultiIndoorCard').nth(index).click();
      await selectNameplateAndCrop(page, page.locator('.nameplateGalleryInput'));
      await page.getByRole('button', { name: 'Zapisz jednostkę' }).click();
    }

    await expect(page.getByText('Tabliczka dodana', { exact: true })).toHaveCount(4);
    await page.getByRole('button', { name: 'Dalej do podsumowania' }).click();
    await expect(page.getByText('Wszystkie tabliczki dodane', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz urządzenia i tabliczki' }).click();
    await expect(page.locator('.mobileDeviceWizard')).toBeHidden();

    await expect(page.getByText('Wszystkie wymagane zdjęcia tabliczek są zapisane.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zakończ', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
    await expect(page.locator('.statusActionButton[title="Zakończone"]')).toContainText('2');
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();
    await expect(page.getByText('Zakończone · tylko podgląd', { exact: true })).toBeVisible();
  });
});
