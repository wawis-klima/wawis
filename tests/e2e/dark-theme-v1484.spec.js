// WAWIS 14.84 — motyw ciemny „Grafit z czerwienią” na telefonie (decyzja właściciela 22.11.2026).
// Przełącznik w nagłówku zamiast „Synchronizuj dane”: zmienia wygląd bez przeładowania, zapamiętuje wybór,
// a w motywie ciemnym tekst na głównych ekranach jest czytelny (kontrast liczony z wyglądu w przeglądarce).
// Zrzuty ekranów (test-results/…/*.png) służą do przeglądu wyglądu przed wdrożeniem.
import { devices, expect, test } from '@playwright/test';
import { ADMIN, WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

// Kontrast każdego widocznego tekstu z tłem pod nim (pierwszy przodek z nieprzezroczystym tłem).
async function contrastAudit(page) {
  return page.evaluate(() => {
    const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    function background(el) {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        // Gradient (np. tło strony, przyciski): przybliżenie pierwszym kolorem gradientu.
        const gradient = cs.backgroundImage && cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage) ? parse(cs.backgroundImage) : null;
        const bg = gradient && gradient.a > 0 ? gradient : parse(cs.backgroundColor);
        if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 0.99) break; }
      }
      let out = { r: 255, g: 255, b: 255, a: 1 };
      if (document.documentElement.getAttribute('data-theme') === 'dark') out = { r: 12, g: 12, b: 13, a: 1 };
      for (const layer of layers.reverse()) out = blend(layer, out);
      return out;
    }
    const failures = [];
    let checked = 0;
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!rect.width || !rect.height || cs.visibility === 'hidden' || Number(cs.opacity) < 0.3 || rect.bottom < 0 || rect.top > innerHeight) continue;
      if (el.closest('[aria-hidden="true"], svg, canvas, img')) continue;
      const fg = parse(cs.color); const bg = background(el);
      if (!fg || !bg) continue;
      const text = blend(fg, bg);
      const [a, b] = [lum(text), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      checked += 1;
      if (ratio < 4.5) failures.push({ ratio: Number(ratio.toFixed(2)), text: el.textContent.trim().slice(0, 40), cls: String(el.className || el.tagName).slice(0, 60), color: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` });
    }
    return { checked, failures };
  });
}

async function shot(page, testInfo, name) {
  await page.waitForTimeout(250);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  // Podgląd do przeglądu wyglądu z logu CI (mały JPEG, w częściach): WAWIS-SHOT <projekt>/<nazwa> <nr>/<razem> <base64>
  const preview = (await page.screenshot({ type: 'jpeg', quality: 70, scale: 'css' })).toString('base64');
  const parts = Math.ceil(preview.length / 6000);
  for (let i = 0; i < parts; i += 1) console.log(`WAWIS-SHOT ${testInfo.project.name}/${name} ${i + 1}/${parts} ${preview.slice(i * 6000, (i + 1) * 6000)}`);
  const audit = await contrastAudit(page);
  await testInfo.attach(`${name}-kontrast.json`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
  console.log(`WAWIS-CONTRAST ${testInfo.project.name}/${name} sprawdzone=${audit.checked} ponizej4.5=${JSON.stringify(audit.failures.slice(0, 25))}`);
  return audit;
}

function expectReadable(audit, label) {
  // Twarda granica 3:1 (szacunek tła w przeglądarce), pełna lista < 4,5 w załączniku do przeglądu.
  const hard = audit.failures.filter((f) => f.ratio < 3);
  expect(audit.checked, `${label}: sprawdzone teksty`).toBeGreaterThan(5);
  expect(hard, `${label}: nieczytelny tekst w motywie ciemnym`).toEqual([]);
}

test.describe('@mobile 14.84 motyw ciemny', () => {
  test('administrator: przełącznik, zapamiętanie wyboru i czytelność głównych ekranów', async ({ page }, testInfo) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, ADMIN);
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Synchronizuj dane' })).toHaveCount(0);
    await shot(page, testInfo, '00-jasny-lista');
    const lightCard = await page.locator('.mobileJobCard').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lightCard).toBe('rgb(255, 255, 255)');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Włącz tryb jasny');
    const cardBg = () => page.locator('.mobileJobCard').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await cardBg()).toBe('rgb(24, 24, 26)');
    expect(await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'))).toBe('#0c0c0d');
    expectReadable(await shot(page, testInfo, '01-ciemny-lista'), 'lista montaży');

    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await expect(page.locator('.mobileInlineJobDetails').first()).toBeVisible();
    expectReadable(await shot(page, testInfo, '02-ciemny-szczegoly'), 'szczegóły montażu');
    await page.evaluate(() => window.scrollBy(0, 500));
    await shot(page, testInfo, '03-ciemny-szczegoly-dol');

    // Zapamiętanie po ponownym uruchomieniu.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.wawisVersionDiagnosticsButton').click();
    await expect(page.getByTestId('diagnostics-actions-card')).toBeVisible();
    expectReadable(await shot(page, testInfo, '04-ciemny-diagnostyka'), 'diagnostyka');
    await page.locator('.wawisVersionDiagnosticsButton').click();

    await page.getByRole('button', { name: 'Dodaj zlecenie' }).click();
    await page.waitForTimeout(400);
    expectReadable(await shot(page, testInfo, '05-ciemny-nowe-zlecenie'), 'nowe zlecenie');
    await page.keyboard.press('Escape');
    await page.reload();

    // Powrót do jasnego: bez atrybutu, wygląd jak przed 14.84, wybór zapamiętany.
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    expect(await page.locator('.mobileJobCard').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(lightCard);
  });

  test('pracownik: ciemna lista i szczegóły są czytelne', async ({ page }, testInfo) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expectReadable(await shot(page, testInfo, '10-pracownik-lista'), 'lista pracownika');
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await expect(page.locator('.mobileInlineJobDetails').first()).toBeVisible();
    expectReadable(await shot(page, testInfo, '11-pracownik-szczegoly'), 'szczegóły pracownika');
  });
});
