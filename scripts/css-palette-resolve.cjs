// WAWIS 14.55 — odczyt arkusza CSS z podstawioną wspólną paletą (src/styles/tokens.css).
// Testy sprawdzające konkretne kolory w arkuszach (np. „jasne tło kadrowania”) porównują wartości
// po podstawieniu zmiennych --wx-*, bo od 14.51 arkusze mają zmienne zamiast kodów kolorów.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readPalette() {
  const css = fs.readFileSync(path.join(root, 'src', 'styles', 'tokens.css'), 'utf8');
  return Object.fromEntries([...css.matchAll(/(--wx-[a-z0-9-]+):\s*(#[0-9a-f]+);/g)].map((m) => [m[1], m[2]]));
}

// 14.64: wspólne cienie (--wxs-*) z src/styles/shadows.css.
function readShadowPalette() {
  const file = path.join(root, 'src', 'styles', 'shadows.css');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries([...fs.readFileSync(file, 'utf8').matchAll(/(--wxs-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

// 14.81: role kolorów (--wr-*) z src/styles/roles.css → zmienne palety.
function readRoles() {
  const file = path.join(root, 'src', 'styles', 'roles.css');
  if (!fs.existsSync(file)) return {};
  const block = fs.readFileSync(file, 'utf8').match(/:root\s*\{([\s\S]*?)\}/);
  return block ? Object.fromEntries([...block[1].matchAll(/(--wr-[a-z0-9-]+)\s*:\s*var\((--wx-[a-z0-9-]+)\)\s*;/g)].map((m) => [m[1], m[2]])) : {};
}

function resolvePalette(css) {
  const roles = readRoles();
  css = css.replace(/var\((--wr-[a-z0-9-]+)\)/g, (whole, name) => {
    if (!roles[name]) throw new Error(`Nieznana rola koloru ${name}`);
    return `var(${roles[name]})`;
  });
  const palette = readPalette();
  const shadows = readShadowPalette();
  // 14.67: kolory półprzezroczyste (--wxa-*) z src/styles/alpha.css.
  const alphaFile = path.join(root, 'src', 'styles', 'alpha.css');
  const alpha = fs.existsSync(alphaFile) ? Object.fromEntries([...fs.readFileSync(alphaFile, 'utf8').matchAll(/(--wxa-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])) : {};
  css = css.replace(/var\((--wxa-[a-z0-9-]+)\)/g, (whole, name) => {
    if (!alpha[name]) throw new Error(`Nieznany kolor ${name}`);
    return alpha[name];
  });
  css = css.replace(/var\((--wxs-[a-z0-9-]+)\)/g, (whole, name) => {
    if (!shadows[name]) throw new Error(`Nieznany cień ${name}`);
    return shadows[name];
  });
  return css.replace(/var\((--wx-[a-z0-9-]+)\)/g, (whole, name) => {
    if (!palette[name]) throw new Error(`Nieznana zmienna palety ${name}`);
    return palette[name];
  });
}

function readCssResolved(...parts) {
  return resolvePalette(fs.readFileSync(path.join(root, ...parts), 'utf8'));
}

module.exports = { readPalette, resolvePalette, readCssResolved };
