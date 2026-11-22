// WAWIS 14.58 — paleta kolorów w silniku Safari (WebKit): każda deklaracja, w której kolor zastąpiono zmienną,
// była poprawna dla WebKit w oryginale. Inaczej Safari ignorowałby ją w oryginale (kaskada bierze wcześniejszą
// wartość), a po konwersji unieważniałby dopiero przy liczeniu stylu (wartość domyślna) — inny wygląd tylko na iPhonie.
// Uruchamiane w WebKit (playwright.webkit-built.config.js, zbudowana aplikacja) i w Chromium (zwykłe E2E).
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { REGISTRY_FILE, ROLES_FILE, TOKENS_FILE, readRoles, readStyleSource, readTokens, resolveTokens, scanDeclarationValues } from '../../scripts/css-tokens.mjs';
import { SHADOWS_FILE, readShadows } from '../../scripts/css-shadows.mjs';
import { ALPHA_FILE, readAlpha } from '../../scripts/css-alpha.mjs';

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

  // 14.81: role kolorów wczytane w zbudowanej aplikacji; w motywie jasnym rola = kolor palety ze swojej nazwy.
  const roles = readRoles(fs.readFileSync(ROLES_FILE, 'utf8'));
  const loadedRoles = await page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, cs.getPropertyValue(name).trim()]));
  }, Object.keys(roles));
  // 14.82: rola koloru półprzezroczystego = wartość jej zmiennej --wxa-* w tej samej przeglądarce.
  const loadedAlpha = await page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, cs.getPropertyValue(name).trim()]));
  }, [...new Set(Object.values(roles).filter((p) => p.startsWith('--wxa-')))]);
  expect(Object.values(loadedAlpha).every(Boolean)).toBe(true);
  expect(loadedRoles, 'role wczytane w zbudowanej aplikacji').toEqual(
    Object.fromEntries(Object.entries(roles).map(([role, palette]) => [role, palette.startsWith('--wxa-') ? loadedAlpha[palette] : tokens[palette]])));
  expect(Object.keys(roles).length).toBeGreaterThan(100);

  let checked = 0;
  for (const file of Object.keys(registry)) {
    const declarations = declarationsWithTokens(readStyleSource(file));
    checked += declarations.length;
    const invalid = await page.evaluate((list) => list.filter(({ property, original }) =>
      CSS.supports(property, 'inherit') && !CSS.supports(property, original)), declarations);
    expect(invalid, `${file}: deklaracje niepoprawne w oryginale (${testInfo.project.name})`).toEqual([]);
  }
  expect(checked).toBeGreaterThan(1000);

  // 14.64: wspólne cienie — wczytane w zbudowanej aplikacji i poprawne dla silnika przeglądarki.
  const shadows = readShadows(fs.readFileSync(SHADOWS_FILE, 'utf8'));
  const shadowState = await page.evaluate((list) => {
    const cs = getComputedStyle(document.documentElement);
    return {
      missing: list.filter(([name]) => !cs.getPropertyValue(name).trim()).map(([name]) => name),
      invalid: list.filter(([, value]) => !CSS.supports('box-shadow', value)).map(([name, value]) => `${name}: ${value}`),
    };
  }, Object.entries(shadows));
  expect(shadowState, `cienie (${testInfo.project.name})`).toEqual({ missing: [], invalid: [] });
  expect(Object.keys(shadows).length).toBeGreaterThan(50);

  // 14.67: wspólne kolory półprzezroczyste — wczytane i poprawne dla silnika przeglądarki.
  const alpha = readAlpha(fs.readFileSync(ALPHA_FILE, 'utf8'));
  const alphaState = await page.evaluate((list) => {
    const cs = getComputedStyle(document.documentElement);
    return {
      missing: list.filter(([name]) => !cs.getPropertyValue(name).trim()).map(([name]) => name),
      invalid: list.filter(([, value]) => !CSS.supports('color', value)).map(([name, value]) => `${name}: ${value}`),
    };
  }, Object.entries(alpha));
  expect(alphaState, `kolory półprzezroczyste (${testInfo.project.name})`).toEqual({ missing: [], invalid: [] });
  expect(Object.keys(alpha).length).toBeGreaterThan(20);
});
