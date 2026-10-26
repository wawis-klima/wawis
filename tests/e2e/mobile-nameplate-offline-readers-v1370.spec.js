import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.70 — zgłoszenie z iPhone'a (25.10.2026 12:17): w trybie samolotowym model z EAN był,
// ale numer SN pozostawał pusty, bo czytnik Code 128 i OCR pobierały pliki z internetu.
// Test: z internetem aplikacja zapisuje czytniki w trwałym cache, po PRAWDZIWYM wyłączeniu sieci
// (context.setOffline) pliki czytników są dostępne, a odczyt tabliczki wpisuje numer SN.
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];

const INDOOR_EAN = '5905567600791';
const INDOOR_SERIAL = 'IMOTO35XI2400012345';

test.use({ ...iphone14, serviceWorkers: 'allow' });

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


test('@mobile bez internetu (prawdziwy offline) czytniki są w telefonie i numer SN zostaje wpisany', async ({ page, context }) => {
  test.setTimeout(240_000);
  await resetMockSupabase(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 60_000 });
  await loginWithoutReset(page, WORKER);
  await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible({ timeout: 30_000 });

  // Czytniki pobierają się w tle po zalogowaniu (z internetem).
  await expect.poll(async () => page.evaluate(() => {
    try { return JSON.parse(window.localStorage.getItem('wawis-nameplate-readers-offline') || 'null')?.ready === true; }
    catch { return false; }
  }), { timeout: 150_000, intervals: [2000] }).toBe(true);

  const readerUrls = await page.evaluate(async () => {
    const cache = await caches.open('wawis-nameplate-readers-v1');
    return (await cache.keys()).map((request) => request.url);
  });
  expect(readerUrls.some((url) => url.includes('/npm/barcode-detector@'))).toBe(true);
  expect(readerUrls.some((url) => /\/npm\/zxing-wasm@.*\.wasm/.test(url))).toBe(true);
  expect(readerUrls.some((url) => url.includes('/ocr/core/tesseract-core'))).toBe(true);

  // Formularz otwieramy z internetem (ekrany aplikacji są już w telefonie), odczyt robimy bez sieci.
  await page.locator('.statusActionButton[title="W trakcie"]').click();
  await page.getByText('Klient Testowy Multi-Split', { exact: true }).click();
  await page.getByRole('button', { name: 'Tabliczki', exact: true }).click();
  await page.locator('.mobileDeviceOverviewOpen').first().click();
  await page.locator('.mobileMultiIndoorCard').first().click();

  const failedRequests = [];
  const consoleErrors = [];
  page.on('requestfailed', (request) => failedRequests.push(`${request.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 90)} ${request.failure()?.errorText || ''}`));
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text().slice(0, 140)); });
  page.on('worker', (worker) => worker.on('console', (message) => consoleErrors.push(`[worker] ${message.text().slice(0, 140)}`)));
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  // Bez sieci pliki czytników nadal się ładują (z cache service workera).
  const offlineFetch = await page.evaluate(async (urls) => {
    const results = [];
    for (const url of urls) {
      try {
        const response = await fetch(url, { mode: url.startsWith(location.origin) ? 'same-origin' : 'cors' });
        results.push({ url, ok: response.ok, status: response.status, type: response.type });
      } catch (error) {
        results.push({ url, ok: false, error: String(error?.message || error).slice(0, 120) });
      }
    }
    // Kontrola emulacji: czy bez sieci działa cokolwiek z cache service workera (ekran aplikacji).
    let shell = 'n/a';
    try { shell = String((await fetch('/', { cache: 'no-store' })).status); } catch (error) { shell = `błąd: ${String(error?.message || error).slice(0, 60)}`; }
    let cached = 0;
    for (const url of urls) { if (await caches.match(url)) cached += 1; }
    return { results, controlled: Boolean(navigator.serviceWorker?.controller), shell, cached };
  }, readerUrls);
  expect(offlineFetch.results.length).toBeGreaterThan(0);
  const offlineFailures = offlineFetch.results.filter((item) => !item.ok)
    .map((item) => `${item.url.replace(/^https?:\/\/[^/]+/, '')} ${item.status || ''} ${item.type || ''} ${item.error || ''}`);
  expect(offlineFailures, `Pliki czytników niedostępne bez sieci (SW kontroluje stronę: ${offlineFetch.controlled}; ekran aplikacji offline: ${offlineFetch.shell}; w cache: ${offlineFetch.cached}/${readerUrls.length})`).toEqual([]);

  await page.locator('.nameplateGalleryInput').setInputFiles({
    name: 'rotenso-offline.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(buildNameplateSvg()),
  });
  await expect(page.locator('.nameplateCropModal')).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz kadr' }).click();
  const cropModal = page.locator('.nameplateCropModal');
  const saveAnyway = page.getByRole('button', { name: 'Zapisz mimo to', exact: true });
  const cropOutcome = await Promise.race([
    cropModal.waitFor({ state: 'hidden', timeout: 30_000 }).then(() => 'hidden'),
    saveAnyway.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'warning'),
  ]);
  if (cropOutcome === 'warning') await saveAnyway.click();
  await expect(cropModal).toBeHidden();
  await expect(page.locator('.nameplateVerifyModal')).toBeVisible();
  try {
    await expect(page.locator('.nameplateVerifyMethod')).toBeVisible({ timeout: 150_000 });
  } catch (error) {
    const progress = await page.locator('.nameplateVerifyProgress').innerText().catch(() => '(brak paska)');
    throw new Error(`Odczyt offline nie zakończył się. Pasek: ${progress.replace(/\s+/g, ' ')} | nieudane żądania: ${failedRequests.slice(-8).join(' ; ')} | konsola: ${consoleErrors.slice(-5).join(' ; ')}`);
  }

  await expect(page.locator('.nameplateVerifyMethod')).toHaveText('Odczyt lokalny — bez internetu');
  await expect(page.getByPlaceholder('Przepisz model z tabliczki')).toHaveValue(/I35Xi R14/i);
  const serial = await page.getByPlaceholder('Przepisz numer seryjny').inputValue();
  expect(serial, 'bez internetu numer SN musi zostać odczytany lokalnie').not.toBe('');
  expect(serial).not.toBe(INDOOR_EAN);
  await expect(page.getByTestId('nameplate-offline-reader')).not.toContainText('może nie być jeszcze zapisany');
  await context.setOffline(false);
});
