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

function resolvePalette(css) {
  const palette = readPalette();
  return css.replace(/var\((--wx-[a-z0-9-]+)\)/g, (whole, name) => {
    if (!palette[name]) throw new Error(`Nieznana zmienna palety ${name}`);
    return palette[name];
  });
}

function readCssResolved(...parts) {
  return resolvePalette(fs.readFileSync(path.join(root, ...parts), 'utf8'));
}

module.exports = { readPalette, resolvePalette, readCssResolved };
