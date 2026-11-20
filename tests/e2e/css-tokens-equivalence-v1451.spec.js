// WAWIS 14.51 — paleta kolorów (zmienne --wx-*) bez zmiany wyglądu: dowód w przeglądarce.
// Dla każdego przekonwertowanego pliku CSS na żywym ekranie aplikacji:
//   1. zapisujemy pełny styl obliczony (getComputedStyle, wszystkie właściwości, także ::before/::after)
//      każdego elementu ekranu;
//   2. wyłączamy przekonwertowany arkusz i W TYM SAMYM MIEJSCU wstawiamy oryginał (kolory zamiast zmiennych);
//   3. styl obliczony musi być identyczny co do znaku — inaczej konwersja zmieniła wygląd.
// Dodatkowo: każda deklaracja ze zmienną była poprawna w oryginale (CSS.supports) — inaczej przeglądarka
// zignorowałaby ją w oryginale, a po konwersji unieważniła dopiero przy liczeniu stylu (inny wynik kaskady).
import fs from 'node:fs';
import { devices, expect, test } from '@playwright/test';
import { ADMIN, login } from './mock-helpers.js';
import { REGISTRY_FILE, TOKENS_FILE, readTokens, resolveTokens, scanDeclarationValues } from '../../scripts/css-tokens.mjs';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

const tokens = readTokens(fs.readFileSync(TOKENS_FILE, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')).files;

// Każdy przekonwertowany plik musi mieć tu ekran, na którym jest sprawdzany (bez tego test nie przejdzie).
const SCENARIOS = {
  'src/mobile791/components/devices/ServiceAdminPanel.css': {
    root: '.serviceAdminPage',
    negativeControl: ['padding-bottom:18px;color:#172b45}', 'padding-bottom:18px;color:#ff00ff}'],
    async open(page) {
      await login(page, ADMIN);
      await page.locator('.moduleSwitcherMobile button[data-module="devices"]').click();
      await expect(page.locator('.serviceAdminPage')).toBeVisible();
    },
    // Widoki modułu: wyszukiwarka, zaplanowane, wykonane, kosz.
    states: [
      { name: 'Szukaj', async go(page) { await page.locator('.serviceAdminNav button', { hasText: 'Szukaj' }).click(); } },
      { name: 'Zaplanowane', async go(page) { await page.locator('.serviceAdminNav button', { hasText: 'Zaplanowane' }).click(); } },
      { name: 'Wykonane', async go(page) { await page.locator('.serviceAdminNav button', { hasText: 'Wykonane' }).click(); } },
      { name: 'Kosz', async go(page) { await page.locator('.serviceAdminNav button', { hasText: 'Kosz' }).click(); } },
    ],
  },
};

function declarationsWithTokens(css) {
  const out = [];
  for (const value of scanDeclarationValues(css)) {
    const text = css.slice(value.start, value.end);
    if (!/var\(--wx-/.test(text)) continue;
    let p = value.start - 2;
    while (p >= 0 && !/[;{}]/.test(css[p])) p -= 1;
    const property = css.slice(p + 1, value.start - 1).trim();
    const original = resolveTokens(text, tokens).replace(/!\s*important\s*$/i, '').trim();
    out.push({ property, original });
  }
  return out;
}

async function swapAndCompare(page, file, rootSelector, originalCss) {
  return page.evaluate(async ({ file, rootSelector, originalCss }) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const styleEl = [...document.querySelectorAll('style[data-vite-dev-id]')]
      .find((el) => el.getAttribute('data-vite-dev-id').replace(/\\/g, '/').endsWith(`/${file}`));
    if (!styleEl) return { error: `brak arkusza ${file} na stronie` };
    const root = document.querySelector(rootSelector);
    if (!root) return { error: `brak ekranu ${rootSelector}` };
    const elements = [document.documentElement, document.body, root, ...root.querySelectorAll('*')];
    const snapshot = () => elements.map((el) => {
      const parts = [];
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        const props = [];
        for (let i = 0; i < cs.length; i += 1) props.push(`${cs[i]}=${cs.getPropertyValue(cs[i])}`);
        parts.push(props.join(';'));
      }
      return parts.join('||');
    });
    const before = snapshot();
    const original = document.createElement('style');
    original.textContent = originalCss;
    styleEl.after(original);
    styleEl.sheet.disabled = true;
    await frame();
    const after = snapshot();
    original.remove();
    styleEl.sheet.disabled = false;
    await frame();
    const diffs = [];
    for (let i = 0; i < elements.length && diffs.length < 5; i += 1) {
      if (before[i] === after[i]) continue;
      const a = before[i].split(/;|\|\|/);
      const b = after[i].split(/;|\|\|/);
      const changed = a.filter((x, k) => x !== b[k]).slice(0, 3);
      diffs.push({ element: `${elements[i].tagName.toLowerCase()}.${String(elements[i].className || '').split(' ').join('.')}`, changed });
    }
    return { elements: elements.length, diffs };
  }, { file, rootSelector, originalCss });
}

test.describe('@mobile paleta kolorów 14.51 — wygląd identyczny z oryginałem', () => {
  test('każdy przekonwertowany plik ma ekran do sprawdzenia', () => {
    expect(Object.keys(registry).filter((file) => !SCENARIOS[file])).toEqual([]);
  });

  for (const [file, scenario] of Object.entries(SCENARIOS)) {
    test(`${file}: podmiana na oryginał nie zmienia stylu obliczonego`, async ({ page }) => {
      const converted = fs.readFileSync(file, 'utf8');
      const originalCss = resolveTokens(converted, tokens);
      await scenario.open(page);

      // Paleta jest wczytana w aplikacji (wartości zmiennych = kolory z tokens.css).
      const loaded = await page.evaluate((names) => {
        const cs = getComputedStyle(document.documentElement);
        return Object.fromEntries(names.map((name) => [name, cs.getPropertyValue(name).trim()]));
      }, Object.keys(tokens));
      expect(loaded).toEqual(tokens);

      // Każda deklaracja ze zmienną była poprawna w oryginale.
      const declarations = declarationsWithTokens(converted);
      expect(declarations.length).toBeGreaterThan(0);
      const invalid = await page.evaluate((list) => list.filter(({ property, original }) =>
        CSS.supports(property, 'inherit') && !CSS.supports(property, original)), declarations);
      expect(invalid).toEqual([]);

      // Kontrola samego testu: celowo zmieniony kolor w „oryginale” MUSI zostać wykryty.
      if (scenario.negativeControl) {
        const [from, to] = scenario.negativeControl;
        expect(originalCss.includes(from), 'kontrola negatywna: fragment w oryginale').toBe(true);
        const tampered = await swapAndCompare(page, file, scenario.root, originalCss.replace(from, to));
        expect(tampered.error).toBeUndefined();
        expect(tampered.diffs.length, 'zmieniony kolor musi być wykryty').toBeGreaterThan(0);
      }

      for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        for (const state of scenario.states) {
          await state.go(page);
          await expect(page.locator(scenario.root)).toBeVisible();
          const result = await swapAndCompare(page, file, scenario.root, originalCss);
          expect(result.error, `${state.name} @${width}px`).toBeUndefined();
          expect(result.elements, `${state.name} @${width}px: elementy na ekranie`).toBeGreaterThan(5);
          expect(result.diffs, `${state.name} @${width}px: styl po podmianie na oryginał`).toEqual([]);
        }
      }
    });
  }
});
