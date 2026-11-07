import { expect, test } from '@playwright/test';
import { ADMIN, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 14.31 — protokół szczelności na komputerze (decyzje właściciela 07.11.2026, dane fikcyjne / mock):
// 1) przycisk „Protokół szczelności (PDF)” w sekcji „Urządzenia”, nie w górnym pasku (rozbijał menu),
// 2) numery seryjne w protokole, 3) osoba odpowiedzialna = przeprowadzająca, podpis w obu polach.
test.use({ viewport: { width: 1600, height: 900 } });

test('14.31: protokół szczelności przy urządzeniach, numery seryjne i drugi podpis', async ({ page }) => {
  await resetMockSupabase(page);
  await page.evaluate(() => {
    const key = 'klima-mock-supabase-store-v3';
    const store = JSON.parse(localStorage.getItem(key) || '{}');
    store.leak_test_signatures = [{ id: 'mock-sig-1', profile_id: 'x', confirmed_name: 'Pracownik Testowy',
      image_png: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' }];
    store.leak_test_records = [{ job_id: 'mock-job-003', test_date: '2026-04-22', temperature_c: 18, result: 'pozytywny', signature_id: 'mock-sig-1', signed_at: '2026-11-06T12:00:00Z' }];
    localStorage.setItem(key, JSON.stringify(store));
  });
  await loginWithoutReset(page, ADMIN);
  await page.getByRole('button', { name: /^Montaże$/ }).click();
  await page.getByRole('button', { name: /Zakończone:/ }).click();
  await page.getByRole('table').getByText('Klient Testowy C Zakończony', { exact: true }).first().click();

  // Górny pasek: bez przycisku protokołu.
  const quick = page.locator('.jobDetailsQuickActions');
  await expect(quick.getByRole('button', { name: 'Zamknij' })).toBeVisible();
  await expect(quick.getByTestId('leak-test-protocol-btn')).toHaveCount(0);

  // Sekcja „Urządzenia”: po rozwinięciu przycisk jest widoczny, na wierzchu i w jednym wierszu z nagłówkiem.
  const section = page.locator('.desktopJobDevicesSection');
  await section.locator('.desktopDetailsSectionToggle').click();
  const button = section.getByTestId('leak-test-protocol-btn');
  await expect(button).toHaveText('Protokół szczelności (PDF)');
  const hit = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { onTop: el.contains(top), inRow: Boolean(el.closest('.desktopJobDevicesHeadingRow')) };
  });
  expect(hit).toEqual({ onTop: true, inRow: true });

  // Dane protokołu: numery seryjne (ze struktury JW/JZ i ze starego zapisu), osoba odpowiedzialna.
  const data = await page.evaluate(async () => {
    const mod = await import('/src/mobile791/modules/leak-test-protocol-pdf.js');
    const profiles = [{ id: 'w1', full_name: 'Michał Testowy' }];
    const split = mod.buildLeakTestProtocolData({ job: { id: 'j1', completed_by: 'w1', device_model: 'JW: Imoto I35Xi | JZ: Imoto I35Xo', device_serial_number: 'JW: SN-IN-1 | JZ: SN-OUT-1' }, profiles });
    const multi = mod.buildLeakTestProtocolData({ job: { id: 'j2', completed_by: 'w1', device_model: 'JW1: A | JW2: B | JZ: C', device_serial_number: 'JW1: S1 | JW2: S2 | JZ: S3' }, profiles });
    const legacy = mod.buildLeakTestProtocolData({ job: { id: 'j3', completed_by: 'w1', device_model: 'LG Mock 3.5 kW', device_serial_number: 'MOCK-LG-003' }, profiles });
    return { split: split.pages[0].serialNumbers, multi: multi.pages[0].serialNumbers, legacy: legacy.pages[0].serialNumbers, responsible: split.responsiblePerson };
  });
  expect(data).toEqual({
    split: 'jedn. wewn.: SN-IN-1; jedn. zewn.: SN-OUT-1',
    multi: 'jedn. wewn. 1: S1; jedn. wewn. 2: S2; jedn. zewn.: S3',
    legacy: 'MOCK-LG-003',
    responsible: 'Michał Testowy',
  });

  // PDF z podpisem: dwa obrazy podpisu (osoba przeprowadzająca i odpowiedzialna).
  const images = await page.evaluate(async () => {
    const mod = await import('/src/mobile791/modules/leak-test-protocol-pdf.js');
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const make = () => mod.createLeakTestProtocolPdfBlob({ job: { id: 'j1', device_model: 'LG', device_serial_number: 'X1' }, profiles: [],
      record: { test_date: '2026-04-22', temperature_c: 18, result: 'pozytywny', signature_png: png, signed_at: '2026-11-06T12:00:00Z' } });
    const { blob } = await make();
    // Liczymy wstawienia obrazów (operator „Do”) w rozpakowanych strumieniach treści strony PDF.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    let count = 0;
    for (const match of text.matchAll(/stream\r?\n/g)) {
      const start = match.index + match[0].length;
      const end = text.indexOf('endstream', start);
      if (end < 0) continue;
      // Znak nowej linii przed „endstream” nie należy do danych — bez obcięcia rozpakowanie kończy się błędem.
      let stop = end;
      while (stop > start && (bytes[stop - 1] === 10 || bytes[stop - 1] === 13)) stop -= 1;
      let inflated = '';
      // Ostatni bajt danych też może być 0x0A/0x0D — próbujemy kolejne długości aż do „endstream”.
      for (let len = stop; len <= end && !inflated; len += 1) {
        try {
          const out = new Blob([bytes.slice(start, len)]).stream().pipeThrough(new DecompressionStream('deflate'));
          inflated = new TextDecoder('latin1').decode(await new Response(out).arrayBuffer());
        } catch { /* nie ta długość albo strumień nieskompresowany (np. obraz) */ }
      }
      count += (inflated.match(/\/\S+ Do\b/g) || []).length;
    }
    return { count, size: blob.size };
  });
  expect(images.count).toBe(2);
  expect(images.size).toBeGreaterThan(10_000);

  // Kliknięcie otwiera PDF w nowej karcie.
  const popupPromise = page.waitForEvent('popup');
  await button.click();
  const popup = await popupPromise;
  // Jak w 14.28: przeglądarka z podglądem PDF pokazuje go w karcie (blob:), bez podglądu (headless) pobiera plik.
  const downloadPromise = popup.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  const outcome = await Promise.race([
    expect.poll(() => popup.url(), { timeout: 20_000 }).toMatch(/^blob:/).then(() => 'tab').catch(() => null),
    downloadPromise.then((download) => (download ? 'download' : null)),
  ]);
  expect(outcome || (await downloadPromise ? 'download' : null), 'PDF otwarty w karcie albo pobrany').toBeTruthy();
  await expect(button).toHaveText('Protokół szczelności (PDF)');
});
