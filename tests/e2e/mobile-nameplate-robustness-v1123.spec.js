import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

const INDOOR_EAN = '5905567600791';
const OUTDOOR_EAN = '5905567600807';
const INDOOR_SERIAL = 'IMOTO35XI2400012345';
const OUTDOOR_SERIAL = 'IMOTO35XO2400098765';

test.use(iphone14);

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

function buildNameplateSvg({
  ean = INDOOR_EAN,
  model = 'I35Xi R14',
  serial = INDOOR_SERIAL,
  unit = 'INDOOR UNIT',
  rotate = 0,
  blur = 0,
  lowContrast = false,
  hideSerial = false,
} = {}) {
  const bits = buildEan13Bits(ean);
  const moduleWidth = 7;
  const xStart = 75;
  const ink = lowContrast ? '#777' : '#000';
  const paper = lowContrast ? '#dcdcdc' : '#fff';
  const bars = [...bits].map((bit, index) => (
    bit === '1'
      ? `<rect x="${xStart + (index * moduleWidth)}" y="410" width="${moduleWidth}" height="220" fill="${ink}"/>`
      : ''
  )).join('');
  const filter = blur > 0
    ? `<filter id="soft"><feGaussianBlur stdDeviation="${blur}"/></filter>`
    : '';
  const filterAttr = blur > 0 ? ' filter="url(#soft)"' : '';
  const serialBlock = hideSerial
    ? '<rect x="830" y="455" width="900" height="260" fill="#f5f5f5"/>'
    : `<text x="860" y="530" font-size="56">S/N:</text><text x="860" y="615" font-size="62">${serial}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1000" viewBox="0 0 1800 1000">
    <defs>${filter}</defs>
    <rect width="1800" height="1000" fill="${paper}"/>
    <g transform="rotate(${rotate} 900 500)"${filterAttr}>
      <rect x="80" y="70" width="1640" height="860" rx="8" fill="${paper}" stroke="${ink}" stroke-width="6"/>
      <g fill="${ink}" font-family="Arial, Helvetica, sans-serif" font-weight="700">
        <text x="140" y="165" font-size="76">ROTENSO</text>
        <text x="140" y="250" font-size="56">MODEL: ${model}</text>
        <text x="140" y="315" font-size="40">${unit}   230V ~ 50Hz</text>
        <text x="140" y="380" font-size="40">Cooling capacity: 3.5 kW   Refrigerant: R32</text>
        <g transform="translate(65 5)">${bars}</g>
        <text x="140" y="715" font-size="42">${ean}</text>
        ${serialBlock}
        <text x="860" y="715" font-size="40">PC/EAN: ${ean}</text>
        <text x="140" y="860" font-size="42">MADE IN P.R.C.</text>
      </g>
    </g>
  </svg>`;
}

function svgFile(name, options) {
  return {
    name,
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(buildNameplateSvg(options)),
  };
}

function buildNonNameplateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1000" viewBox="0 0 1800 1000">
    <rect width="1800" height="1000" fill="#dfe7ee"/>
    <rect x="90" y="90" width="520" height="330" rx="70" fill="#4f86a8"/>
    <circle cx="1320" cy="300" r="190" fill="#85b66f"/>
    <path d="M120 870 C420 540 650 960 930 650 S1450 520 1720 820" fill="none" stroke="#7a6a9a" stroke-width="70"/>
    <rect x="720" y="160" width="300" height="250" rx="30" fill="#c58b6b"/>
  </svg>`;
}

const syntheticNonNameplatePhoto = {
  name: 'to-nie-jest-tabliczka.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(buildNonNameplateSvg()),
};

async function openFirstIndoorNameplate(page) {
  await resetMockSupabase(page);
  await loginWithoutReset(page, WORKER);
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();
  await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  await page.locator('.mobileDeviceOverviewOpen').first().click();
  await page.locator('.mobileMultiIndoorCard').first().click();
}

async function cropAndContinue(page, file, { expectWarning = null } = {}) {
  await page.locator('.nameplateGalleryInput').setInputFiles(file);
  const cropModal = page.locator('.nameplateCropModal');
  await expect(cropModal).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz kadr' }).click();

  const saveAnyway = page.getByRole('button', { name: 'Zapisz mimo to', exact: true });
  const outcome = await Promise.race([
    cropModal.waitFor({ state: 'hidden', timeout: 15_000 }).then(() => 'hidden'),
    saveAnyway.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'warning'),
  ]);
  if (outcome === 'warning') {
    if (expectWarning) await expect(page.getByText(expectWarning, { exact: true })).toBeVisible();
    await saveAnyway.click();
  } else if (expectWarning) {
    throw new Error(`Oczekiwano ostrzeżenia jakości: ${expectWarning}`);
  }
  await expect(cropModal).toBeHidden();
  await expect(page.locator('.nameplateVerifyModal')).toBeVisible();
}

async function waitForVerificationDone(page, timeout = 130_000) {
  await expect(page.locator('.nameplateVerifyMethod')).toBeVisible({ timeout });
}

test.describe('@mobile 11.23 — odporność odczytu tabliczek w warunkach terenowych', () => {
  test('zdjęcie bez żadnych śladów tabliczki kończy lokalnie i nie uruchamia AI', async ({ page }) => {
    test.setTimeout(180_000);
    let aiRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/read-nameplate-ai')) aiRequests += 1;
    });

    await openFirstIndoorNameplate(page);
    await cropAndContinue(page, syntheticNonNameplatePhoto);
    await waitForVerificationDone(page);

    await expect(page.locator('.nameplateVerifyMethod')).toHaveText('Nie wykryto tabliczki');
    await expect(page.locator('.nameplateVerifyTarget')).toHaveText('Zdjęcie tabliczki JW — jednostka wewnętrzna');
    await expect(page.locator('.nameplateVerifyMismatch')).toContainText('AI nie zostało uruchomione');
    await expect(page.getByPlaceholder('Przepisz model z tabliczki')).toBeDisabled();
    await expect(page.getByPlaceholder('Przepisz numer seryjny')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Potwierdź', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Wpisz ręcznie', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zrób zdjęcie ponownie', exact: true })).toBeVisible();

    const compactLightUi = await page.evaluate(() => {
      const modal = document.querySelector('.nameplateVerifyModal');
      const header = document.querySelector('.nameplateVerifyHeader');
      const body = document.querySelector('.nameplateVerifyBody');
      const image = document.querySelector('.nameplateVerifyImage');
      const mismatch = document.querySelector('.nameplateVerifyMismatch');
      const inputs = [...document.querySelectorAll('.nameplateVerifyField .input')];
      const buttons = [...document.querySelectorAll('.nameplateVerifyFooter .btn')];
      const title = document.querySelector('.nameplateVerifyHeader strong');
      return {
        modalBg: modal ? getComputedStyle(modal).backgroundColor : '',
        modalColor: modal ? getComputedStyle(modal).color : '',
        headerBg: header ? getComputedStyle(header).backgroundColor : '',
        titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 99,
        targetFont: document.querySelector('.nameplateVerifyTarget') ? parseFloat(getComputedStyle(document.querySelector('.nameplateVerifyTarget')).fontSize) : 0,
        bodyScrollHeight: body?.scrollHeight || 0,
        bodyClientHeight: body?.clientHeight || 0,
        imageHeight: image?.getBoundingClientRect().height || 0,
        mismatchFont: mismatch ? parseFloat(getComputedStyle(mismatch).fontSize) : 99,
        inputHeights: inputs.map((node) => node.getBoundingClientRect().height),
        buttonHeights: buttons.map((node) => node.getBoundingClientRect().height),
      };
    });
    expect(compactLightUi.modalBg).toBe('rgb(248, 250, 252)');
    expect(compactLightUi.modalColor).toBe('rgb(15, 23, 42)');
    expect(compactLightUi.headerBg).toBe('rgb(255, 255, 255)');
    expect(compactLightUi.titleFont).toBeLessThanOrEqual(15);
    expect(compactLightUi.targetFont).toBeGreaterThanOrEqual(12);
    expect(compactLightUi.targetFont).toBeLessThanOrEqual(13);
    expect(compactLightUi.imageHeight).toBeLessThanOrEqual(210);
    expect(compactLightUi.mismatchFont).toBeLessThanOrEqual(10);
    for (const height of compactLightUi.inputHeights) expect(height).toBeLessThanOrEqual(44);
    for (const height of compactLightUi.buttonHeights) expect(height).toBeLessThanOrEqual(44);
    expect(compactLightUi.bodyScrollHeight).toBeLessThanOrEqual(compactLightUi.bodyClientHeight + 4);

    expect(aiRequests).toBe(0);
  });

  test('krzywa tabliczka +12° nadal korzysta z desktopowego prostowania i nie myli EAN z SN', async ({ page }) => {
    test.setTimeout(180_000);
    await openFirstIndoorNameplate(page);
    await cropAndContinue(page, svgFile('rotenso-i35xi-krzywa-12.svg', { rotate: 12 }));
    await waitForVerificationDone(page);

    const modelInput = page.getByPlaceholder('Przepisz model z tabliczki');
    const serialInput = page.getByPlaceholder('Przepisz numer seryjny');
    await expect(modelInput).toHaveValue(/I35Xi R14/i, { timeout: 130_000 });

    const serial = await serialInput.inputValue();
    expect(serial).not.toBe(INDOOR_EAN);
    if (serial) expect(serial).toBe(INDOOR_SERIAL);
    else await expect(page.getByRole('button', { name: 'Potwierdź', exact: true })).toBeDisabled();
  });

  test('lekko nieostra tabliczka daje ostrzeżenie jakości przed odczytem', async ({ page }) => {
    test.setTimeout(120_000);
    await openFirstIndoorNameplate(page);
    await cropAndContinue(
      page,
      svgFile('rotenso-i35xi-nieostra.svg', { blur: 4.5, lowContrast: true }),
      { expectWarning: 'Zdjęcie może być poruszone lub nieostre.' },
    );

    // Po świadomym „Zapisz mimo to” aplikacja nadal próbuje odczytu,
    // ale użytkownik nie traci możliwości przejścia do ręcznego potwierdzenia.
    await expect(page.getByRole('button', { name: 'Wpisz ręcznie', exact: true })).toBeVisible();
  });

  test('nieczytelny SN nie może zostać zastąpiony numerem EAN ani starym numerem urządzenia', async ({ page }) => {
    test.setTimeout(180_000);
    await openFirstIndoorNameplate(page);
    await cropAndContinue(page, svgFile('rotenso-i35xi-bez-sn.svg', { hideSerial: true }));
    await waitForVerificationDone(page);

    const modelInput = page.getByPlaceholder('Przepisz model z tabliczki');
    const serialInput = page.getByPlaceholder('Przepisz numer seryjny');
    await expect(modelInput).toHaveValue(/I35Xi R14/i, { timeout: 130_000 });
    await expect(serialInput).toHaveValue('');
    await expect(serialInput).not.toHaveValue(INDOOR_EAN);
    await expect(serialInput).not.toHaveValue('TEST-MULTI-JW-1');
    await expect(page.getByRole('button', { name: 'Potwierdź', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Wpisz ręcznie', exact: true })).toBeVisible();
  });

  test('tabliczka JZ włożona do pola JW pokazuje niezgodność i blokuje potwierdzenie', async ({ page }) => {
    test.setTimeout(150_000);
    await openFirstIndoorNameplate(page);
    await cropAndContinue(page, svgFile('rotenso-i35xo-na-jw.svg', {
      ean: OUTDOOR_EAN,
      model: 'I35Xo R14',
      serial: OUTDOOR_SERIAL,
      unit: 'OUTDOOR UNIT',
    }));
    await waitForVerificationDone(page);

    await expect(page.locator('.nameplateVerifyMismatch')).toContainText('jednostkę zewnętrzną');
    await expect(page.locator('.nameplateVerifyMismatch')).toContainText('tabliczka jednostki wewnętrznej JW');
    await expect(page.getByRole('button', { name: 'Potwierdź', exact: true })).toBeDisabled();
  });
});
