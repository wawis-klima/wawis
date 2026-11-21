// WAWIS 14.69 — domknięcie porządków w stylach (decyzja właściciela 21.11.2026: „domknijmy to”).
//   • nieużywany punkt wejścia src/mobile791/main.jsx i jego jedyny arkusz v1056 są usunięte;
//   • każdy plik CSS w src jest gdzieś importowany (nie ma martwych arkuszy);
//   • żaden plik CSS poza paletą nie ma koloru hex zapisanego wprost (wszystkie są w rejestrze palety) — poza
//     IMPORT_ONLY: plikami wczytywanymi wyłącznie przez @import w innym arkuszu. Przeglądarkowy test palety podmienia
//     arkusz na oryginał w miejscu jego <style>, a takiego pliku nie da się podmienić osobno, więc zostaje bez zmian.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { REGISTRY_FILE, TOKENS_FILE, tokenizeCss } from './css-tokens.mjs';

assert.ok(!fs.existsSync('src/mobile791/main.jsx'), 'nieużywany src/mobile791/main.jsx nie wraca');
assert.ok(!fs.existsSync('src/mobile791/v1056-new-job-spacing.css'), 'nieużywany v1056-new-job-spacing.css nie wraca');
assert.ok(fs.readFileSync('index.html', 'utf8').includes('/src/main.jsx'), 'jedyny punkt wejścia: src/main.jsx');

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full); else files.push(full.split(path.sep).join('/'));
  }
};
walk('src');
const sources = files.filter((f) => /\.(jsx?|mjs|css)$/.test(f)).map((f) => [f, fs.readFileSync(f, 'utf8')]);
const css = files.filter((f) => f.endsWith('.css'));
const unused = css.filter((c) => !sources.some(([f, s]) => f !== c && s.includes(path.basename(c))));
assert.deepEqual(unused, [], 'każdy arkusz CSS jest importowany');

const IMPORT_ONLY = Object.freeze({
  // 1 kolor (#10203a — ta sama wartość co --wx-c-10203a w palecie); wczytywany przez @import w v1092-inline-width.css.
  'src/mobile791/v1103-completed-note-compact.css': 'src/mobile791/v1092-inline-width.css',
});
for (const [file, parent] of Object.entries(IMPORT_ONLY)) {
  assert.ok(fs.readFileSync(parent, 'utf8').includes(`@import './${path.basename(file)}'`), `${file}: wczytywany przez @import w ${parent}`);
  assert.equal(tokenizeCss(fs.readFileSync(file, 'utf8')).count, 1, `${file}: nadal jeden kolor wprost`);
}
const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')).files;
const palette = new Set([TOKENS_FILE, 'src/styles/shadows.css', 'src/styles/alpha.css']);
const leftovers = css.filter((f) => !palette.has(f) && !registry[f] && !IMPORT_ONLY[f] && tokenizeCss(fs.readFileSync(f, 'utf8')).count > 0);
assert.deepEqual(leftovers, [], 'kolory hex tylko w palecie — pozostałe pliki CSS bez kolorów zapisanych wprost');

console.log(`PASS WAWIS 14.69 — ${css.length} arkuszy CSS, wszystkie importowane; kolory hex wyłącznie w palecie (${Object.keys(registry).length} plików w rejestrze).`);
