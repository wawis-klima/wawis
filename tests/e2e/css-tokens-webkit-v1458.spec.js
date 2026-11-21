// WAWIS 14.58 — paleta kolorów w silniku Safari (WebKit): każda deklaracja, w której kolor zastąpiono zmienną,
// była poprawna dla WebKit w oryginale. Inaczej Safari ignorowałby ją w oryginale (kaskada bierze wcześniejszą
// wartość), a po konwersji unieważniałby dopiero przy liczeniu stylu (wartość domyślna) — inny wygląd tylko na iPhonie.
// Uruchamiane w WebKit (playwright.webkit-built.config.js, zbudowana aplikacja) i w Chromium (zwykłe E2E).
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { REGISTRY_FILE, TOKENS_FILE, readTokens, resolveTokens, scanDeclarationValues } from '../../scripts/css-tokens.mjs';

const tokens = readTokens(fs.readFileSync(TOKENS_FILE, 'utf8'));
const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')).files;

function declarationsWithTokens(css) {
  const out = [];
  for (const value of scanDeclarationValues(css)) {
    const text = css.slice(value.start, value.end);
    if (!/var\(--wx-/.test(text)) continue;
    let p = value.start - 2;
    while (p >= 0 && !/[;{}]/.test(css[p])) p -= 1;
    const property = css.slice(p + 1, value.start - 1).trim();
    out.push({ property, original: resolveTokens(text, tokens).replace(/!\s*important\s*$/i, '').trim() });
  }
  return out;
}

test('@mobile paleta kolorów 14.58 — deklaracje poprawne w silniku przeglądarki i paleta wczytana', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20_000 });

  const loaded = await page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, cs.getPropertyValue(name).trim()]));
  }, Object.keys(tokens));
  expect(loaded, 'paleta wczytana w zbudowanej aplikacji').toEqual(tokens);

  let checked = 0;
  for (const file of Object.keys(registry)) {
    const declarations = declarationsWithTokens(fs.readFileSync(file, 'utf8'));
    checked += declarations.length;
    const invalid = await page.evaluate((list) => list.filter(({ property, original }) =>
      CSS.supports(property, 'inherit') && !CSS.supports(property, original)), declarations);
    expect(invalid, `${file}: deklaracje niepoprawne w oryginale (${testInfo.project.name})`).toEqual([]);
  }
  expect(checked).toBeGreaterThan(1000);
});
