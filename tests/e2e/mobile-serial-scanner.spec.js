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

const genericNameplateEvidence = {
  name: 'tabliczka-testowa-techniczna.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#fff"/>
    <rect x="45" y="45" width="1510" height="810" fill="none" stroke="#000" stroke-width="6"/>
    <g fill="#000" font-family="Arial, Helvetica, sans-serif" font-weight="700">
      <text x="110" y="160" font-size="72">TABLICZKA TECHNICZNA</text>
      <text x="110" y="280" font-size="58">MODEL: TEST UNIT</text>
      <text x="110" y="390" font-size="50">230V ~ 50Hz</text>
      <text x="110" y="500" font-size="50">REFRIGERANT R32</text>
      <text x="110" y="610" font-size="50">COOLING CAPACITY 3.5 kW</text>
      <text x="110" y="735" font-size="44">MADE IN P.R.C.</text>
    </g>
  </svg>`),
};

const SYNTHETIC_ROTENSO_EAN = '5905567600791';
const SYNTHETIC_ROTENSO_SERIAL = 'IMOTO35XI2400012345';

function buildEan13Bits(value) {
  const L = { 0:'0001101', 1:'0011001', 2:'0010011', 3:'0111101', 4:'0100011', 5:'0110001', 6:'0101111', 7:'0111011', 8:'0110111', 9:'0001011' };
  const G = { 0:'0100111', 1:'0110011', 2:'0011011', 3:'0100001', 4:'0011101', 5:'0111001', 6:'0000101', 7:'0010001', 8:'0001001', 9:'0010111' };
  const R = Object.fromEntries(Object.entries(L).map(([digit, bits]) => [digit, bits.replace(/[01]/g, (bit) => bit === '0' ? '1' : '0')]));
  const parity = {
    0:'LLLLLL', 1:'LLGLGG', 2:'LLGGLG', 3:'LLGGGL', 4:'LGLLGG',
    5:'LGGLLG', 6:'LGGGLL', 7:'LGLGLG', 8:'LGLGGL', 9:'LGGLGL',
  };
  let bits = '101';
  for (let index = 1; index <= 6; index += 1) {
    bits += (parity[value[0]][index - 1] === 'L' ? L : G)[value[index]];
  }
  bits += '01010';
  for (let index = 7; index <= 12; index += 1) bits += R[value[index]];
  return bits + '101';
}

function buildSyntheticRotensoNameplateSvg() {
  const bits = buildEan13Bits(SYNTHETIC_ROTENSO_EAN);
  const moduleWidth = 7;
  const xStart = 75;
  const bars = [...bits].map((bit, index) => (
    bit === '1'
      ? `<rect x="${xStart + (index * moduleWidth)}" y="410" width="${moduleWidth}" height="220" fill="#000"/>`
      : ''
  )).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1000" viewBox="0 0 1800 1000">
    <rect width="1800" height="1000" fill="#fff"/>
    <rect x="20" y="20" width="1760" height="960" fill="none" stroke="#000" stroke-width="6"/>
    <g fill="#000" font-family="Arial, Helvetica, sans-serif" font-weight="700">
      <text x="70" y="125" font-size="76">ROTENSO</text>
      <text x="70" y="220" font-size="56">MODEL: I35Xi R14</text>
      <text x="70" y="285" font-size="40">INDOOR UNIT   230V ~ 50Hz</text>
      <text x="70" y="350" font-size="40">Cooling capacity: 3.5 kW   Refrigerant: R32</text>
      ${bars}
      <text x="75" y="690" font-size="42">${SYNTHETIC_ROTENSO_EAN}</text>
      <text x="860" y="530" font-size="56">S/N:</text>
      <text x="860" y="615" font-size="62">${SYNTHETIC_ROTENSO_SERIAL}</text>
      <text x="860" y="690" font-size="40">PC/EAN: ${SYNTHETIC_ROTENSO_EAN}</text>
      <text x="70" y="875" font-size="42">MADE IN P.R.C.</text>
    </g>
  </svg>`;
}

const syntheticRotensoNameplate = {
  name: 'rotenso-i35xi-r14.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(buildSyntheticRotensoNameplateSvg()),
};

test.use(iphone14);

async function selectNameplateAndCrop(page, input) {
  await input.setInputFiles(genericNameplateEvidence);
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
  const modelInput = page.getByPlaceholder('Przepisz model z tabliczki');
  const serialInput = page.getByPlaceholder('Przepisz numer seryjny');

  await expect.poll(async () => {
    if (await modelInput.isVisible().catch(() => false)) return true;
    const manualButton = page.getByRole('button', { name: 'Wpisz ręcznie', exact: true });
    if (await manualButton.isVisible().catch(() => false)) {
      await manualButton.evaluate((element) => element.click()).catch(() => {});
    }
    return modelInput.isVisible().catch(() => false);
  }, { timeout: 10_000, intervals: [100, 200, 300, 500] }).toBe(true);

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


  test('v11.34 — kreator urządzeń ma kompaktowe wysokości jak zaakceptowany wzorzec', async ({ page }, testInfo) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();
    await page.getByRole('button', { name: 'Dodaj brakujące tabliczki' }).click();

    const wizard = page.locator('.mobileDeviceWizard');
    await expect(wizard).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Urządzenia', exact: true })).toBeVisible();

    const overviewLayout = await page.evaluate(() => {
      const body = document.querySelector('.mobileDeviceWizardBody');
      const card = document.querySelector('.mobileDeviceOverviewOpen');
      const add = document.querySelector('.mobileDeviceAddAnother');
      const bodyStyle = body ? getComputedStyle(body) : null;
      const cardRect = card?.getBoundingClientRect();
      const addRect = add?.getBoundingClientRect();
      return {
        alignContent: bodyStyle?.alignContent || '',
        gridAutoRows: bodyStyle?.gridAutoRows || '',
        cardHeight: cardRect?.height || 0,
        addHeight: addRect?.height || 0,
        addWidth: addRect?.width || 0,
      };
    });
    expect(overviewLayout.alignContent).toBe('start');
    expect(overviewLayout.gridAutoRows).toBe('max-content');
    expect(overviewLayout.cardHeight).toBeGreaterThanOrEqual(68);
    expect(overviewLayout.cardHeight).toBeLessThanOrEqual(84);
    expect(overviewLayout.addHeight).toBeGreaterThanOrEqual(34);
    expect(overviewLayout.addHeight).toBeLessThanOrEqual(44);
    expect(overviewLayout.addWidth).toBeLessThanOrEqual(300);
    await page.screenshot({ path: testInfo.outputPath('v11.34-step4-compact.png'), fullPage: true });

    await page.getByRole('button', { name: /Dodaj kolejne urządzenie/ }).click();
    await expect(page.getByRole('heading', { name: 'Dodaj urządzenie', exact: true })).toBeVisible();

    const typeHeights = await page.locator('.mobileDeviceTypeCard').evaluateAll((nodes) => (
      nodes.map((node) => node.getBoundingClientRect().height)
    ));
    expect(typeHeights).toHaveLength(2);
    for (const height of typeHeights) {
      expect(height).toBeGreaterThanOrEqual(66);
      expect(height).toBeLessThanOrEqual(80);
    }
    await page.screenshot({ path: testInfo.outputPath('v11.34-step1-compact.png'), fullPage: true });

    await page.getByRole('button', { name: 'Dalej', exact: true }).click();
    await expect(page.getByText('Tryb: Single', { exact: true })).toBeVisible();

    const selectionHeights = await page.locator('.mobileDeviceWizardSelection').evaluateAll((nodes) => (
      nodes.map((node) => node.getBoundingClientRect().height)
    ));
    expect(selectionHeights).toHaveLength(3);
    for (const height of selectionHeights) {
      expect(height).toBeGreaterThanOrEqual(54);
      expect(height).toBeLessThanOrEqual(64);
    }

    const actionHeights = await page.locator('.nameplateCapture.compact .nameplateCaptureCameraBtn, .nameplateCapture.compact .nameplateCaptureGalleryBtn').evaluateAll((nodes) => (
      nodes.map((node) => node.getBoundingClientRect().height)
    ));
    expect(actionHeights.length).toBeGreaterThanOrEqual(4);
    for (const height of actionHeights) {
      expect(height).toBeGreaterThanOrEqual(32);
      expect(height).toBeLessThanOrEqual(40);
    }
    await page.screenshot({ path: testInfo.outputPath('v11.34-step2-compact.png'), fullPage: true });
  });

  test('automatycznie odczytuje prawdziwe pola modelu i SN z czytelnej tabliczki Rotenso', async ({ page }) => {
    test.setTimeout(150_000);
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();
    await page.getByRole('button', { name: 'Dodaj brakujące tabliczki' }).click();
    await page.locator('.mobileDeviceOverviewOpen').first().click();
    await page.locator('.mobileMultiIndoorCard').first().click();

    await page.locator('.nameplateGalleryInput').setInputFiles(syntheticRotensoNameplate);
    const cropModal = page.locator('.nameplateCropModal');
    await expect(cropModal).toBeVisible();
    await page.getByRole('button', { name: 'Zapisz kadr' }).click();

    const saveAnyway = page.getByRole('button', { name: 'Zapisz mimo to', exact: true });
    const cropOutcome = await Promise.race([
      cropModal.waitFor({ state: 'hidden', timeout: 12_000 }).then(() => 'hidden'),
      saveAnyway.waitFor({ state: 'visible', timeout: 12_000 }).then(() => 'override'),
    ]);
    if (cropOutcome === 'override') await saveAnyway.click();
    await expect(cropModal).toBeHidden();

    const verifyModal = page.locator('.nameplateVerifyModal');
    await expect(verifyModal).toBeVisible();
    const modelInput = page.getByPlaceholder('Przepisz model z tabliczki');
    const serialInput = page.getByPlaceholder('Przepisz numer seryjny');

    await expect(page.locator('.nameplateVerifyMethod')).toBeVisible({ timeout: 120_000 });
    await expect(modelInput).toHaveValue(/I35Xi R14/i, { timeout: 120_000 });
    await expect(serialInput).not.toHaveValue(SYNTHETIC_ROTENSO_EAN);
    await expect(serialInput).not.toHaveValue('TEST-MULTI-JW-1');

    const automaticSerial = await serialInput.inputValue();
    if (automaticSerial) {
      expect(automaticSerial).toBe(SYNTHETIC_ROTENSO_SERIAL);
    } else {
      const methodLabel = await page.locator('.nameplateVerifyMethod').textContent();
      const aiWarningVisible = await page.locator('.nameplateVerifyWarning').isVisible().catch(() => false);
      expect(String(methodLabel || '').includes('AI') || aiWarningVisible).toBe(true);
      await expect(page.getByRole('button', { name: 'Potwierdź', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Wpisz ręcznie', exact: true }).click();
      await serialInput.fill(SYNTHETIC_ROTENSO_SERIAL);
    }

    await page.getByRole('button', { name: 'Potwierdź', exact: true }).click();
    await expect(verifyModal).toBeHidden();
    await expect(page.getByText('Potwierdzona', { exact: true })).toBeVisible();
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
    await expect.poll(async () => page.evaluate((storeKey) => {
      const store = JSON.parse(window.localStorage.getItem(storeKey) || '{}');
      return (store.photos || []).filter((photo) => (
        photo.job_id === 'mock-job-005'
        && photo.photo_kind === 'nameplate'
        && String(photo.ocr_status || '').toLowerCase() === 'approved'
        && Boolean(photo.ocr_checked_at)
      )).length;
    }, MOCK_STORE_KEY), { timeout: 20_000, intervals: [200, 400, 800] }).toBe(4);
    await expect(page.locator('.mobileDeviceWizard')).toBeHidden({ timeout: 20_000 });

    await expect(page.getByText('Wszystkie wymagane zdjęcia tabliczek są zapisane.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zakończ', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Zakończ', exact: true }).click();
    await expect(page.locator('.statusActionButton[title="Zakończone"]')).toContainText('2');
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();
    await expect(page.getByText('Zakończone · tylko podgląd', { exact: true })).toBeVisible();
  });
});
