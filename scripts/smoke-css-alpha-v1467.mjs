// WAWIS 14.67 — wspólne kolory półprzezroczyste rgba(…) jako zmienne --wxa-*. Dowód statyczny:
//   • zmienna stoi tylko w wartości deklaracji (nie w box-shadow, selektorze, komentarzu, url());
//   • pozycja po pozycji (css-alpha-baseline.json) wartość = kolor pierwotny (postać kanoniczna) albo jego zapisane
//     połączenie w granicy ALPHA_LIMITS (od 14.68); po odtworzeniu pliki = oryginał (sprawdza smoke-css-tokens);
//   • stany przycisków, które miały różne kolory, mają je nadal; brak rgba zapisanych wprost w przekonwertowanych plikach;
//   • paleta zdefiniowana raz (:root w alpha.css), ładowana statycznie w src/main.jsx.
// Dowód w przeglądarce: tests/e2e/css-tokens-equivalence-v1451.spec.js.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  ALPHA_BASELINE_FILE, ALPHA_FILE, ALPHA_LIMITS, ALPHA_MERGES_FILE, ALPHA_VAR_RE, alphaDistance, alphaNameFor,
  alphaWithinLimits, literalAlphaUses, misplacedAlphaUses, normalizeRgba, readAlpha, restoreAlpha,
} from './css-alpha.mjs';
import { baseSelector, selectorAt } from './css-shadows.mjs';
import { REGISTRY_FILE } from './css-tokens.mjs';

// --- Postać kanoniczna, odległość, wykrywanie ---
assert.equal(normalizeRgba('rgba(15, 35, 69, 0.060)'), 'rgba(15,35,69,.06)');
assert.equal(normalizeRgba('rgb(255,255,255)'), 'rgba(255,255,255,1)');
assert.equal(alphaNameFor('rgba(15,35,69,.06)'), '--wxa-0f2345-060');
assert.ok(alphaWithinLimits(alphaDistance('rgba(15,23,42,.06)', 'rgba(15,23,42,.07)')), 'niewidoczna różnica krycia');
assert.ok(!alphaWithinLimits(alphaDistance('rgba(15,23,42,.06)', 'rgba(15,23,42,.45)')), 'przyciemnienie pod oknem ≠ delikatne tło');
assert.ok(!alphaWithinLimits(alphaDistance('rgba(37,99,235,.12)', 'rgba(220,38,38,.12)')), 'niebieski ≠ czerwony');
const sample = '.a{background:rgba(0,0,0,.1);box-shadow:0 1px 2px rgba(0,0,0,.1)}/* rgba(1,1,1,.1) */.b{background:url("x.svg#rgba(1,1,1,1)")}';
assert.equal(literalAlphaUses(sample).length, 1, 'tylko wartość deklaracji, bez cieni, komentarzy i url()');
assert.equal(misplacedAlphaUses('.a{color:var(--wxa-000000-100)}').length, 0);
assert.equal(misplacedAlphaUses('.a{box-shadow:0 0 0 1px var(--wxa-000000-100)}').length, 1, 'nie w box-shadow');
assert.equal(misplacedAlphaUses('/* var(--wxa-000000-100) */.a{color:red}').length, 1, 'nie w komentarzu');

// --- Paleta ---
const alphaCss = fs.readFileSync(ALPHA_FILE, 'utf8');
const alpha = readAlpha(alphaCss);
assert.equal((alphaCss.match(/\{/g) || []).length, 1, 'alpha.css ma tylko blok :root');
for (const [name, value] of Object.entries(alpha)) {
  assert.equal(value, normalizeRgba(value), `${name}: postać kanoniczna`);
  assert.equal(name, alphaNameFor(value), `${name}: nazwa zgodna z wartością`);
}
assert.equal(new Set(Object.values(alpha)).size, Object.keys(alpha).length, 'jedna zmienna na kolor');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full.split(path.sep).join('/'));
  }
  return out;
};
for (const file of walk('src').filter((f) => f.endsWith('.css') && f !== ALPHA_FILE)) {
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /--wxa-[a-z0-9-]+\s*:/, `${file} nie definiuje kolorów palety rgba`);
}
const main = fs.readFileSync('src/main.jsx', 'utf8');
const imp = main.indexOf("import './styles/alpha.css'");
assert.ok(imp > 0 && imp < main.indexOf('import('), 'statyczny import w src/main.jsx przed ładowaniem ekranów');

// --- Pliki ---
const baseline = JSON.parse(fs.readFileSync(ALPHA_BASELINE_FILE, 'utf8')).files;
const merges = fs.existsSync(ALPHA_MERGES_FILE) ? JSON.parse(fs.readFileSync(ALPHA_MERGES_FILE, 'utf8')) : { map: {} };
if (merges.limits) assert.deepEqual(merges.limits, ALPHA_LIMITS, 'granica zapisana = granica w kodzie');
for (const [from, { to }] of Object.entries(merges.map)) assert.ok(alphaWithinLimits(alphaDistance(from, to)), `${from} → ${to}: w granicy`);
const registry = Object.keys(JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')).files);
const used = new Set();
let positions = 0; let changed = 0;
for (const file of registry) {
  const css = fs.readFileSync(file, 'utf8');
  assert.deepEqual(misplacedAlphaUses(css), [], `${file}: zmienne rgba tylko w wartościach`);
  assert.deepEqual(literalAlphaUses(css).map((u) => u.raw), [], `${file}: brak rgba zapisanych wprost`);
  const raws = baseline[file] || [];
  const matches = [...css.matchAll(ALPHA_VAR_RE)];
  assert.equal(matches.length, raws.length, `${file}: liczba kolorów rgba = zapis pierwotny`);
  restoreAlpha(css, raws);
  const byBase = new Map();
  matches.forEach((m, i) => {
    const name = m[1];
    assert.ok(name in alpha, `${file}: nieznany kolor ${name}`);
    used.add(name);
    const orig = normalizeRgba(raws[i]);
    const expected = merges.map[orig]?.to || orig;
    assert.equal(alpha[name], expected, `${file}: kolor ${i + 1} = ${alpha[name]}, oczekiwano ${expected} (pierwotnie ${raws[i]})`);
    positions += 1;
    if (expected !== orig) changed += 1;
    for (const part of selectorAt(css, m.index).split(',')) {
      const key = baseSelector(part);
      if (!byBase.has(key)) byBase.set(key, []);
      byBase.get(key).push({ orig, now: alpha[name], sel: part.trim() });
    }
  });
  for (const [key, rows] of byBase) {
    for (const a of rows) for (const b of rows) {
      const stateVsOther = a.sel !== b.sel && (a.sel !== baseSelector(a.sel) || b.sel !== baseSelector(b.sel));
      if (stateVsOther && a.orig !== b.orig) assert.notEqual(a.now, b.now, `${file}: „${a.sel}” i „${b.sel}” miały różne kolory, po łączeniu ten sam (${key})`);
    }
  }
}
for (const file of Object.keys(baseline)) assert.ok(registry.includes(file), `${file}: w zapisie, ale nie w rejestrze`);
assert.deepEqual(Object.keys(alpha).filter((k) => !used.has(k)), [], 'brak nieużywanych kolorów');

console.log(`PASS WAWIS 14.67 — ${Object.keys(alpha).length} wspólnych kolorów półprzezroczystych w ${positions} miejscach; połączonych: ${changed} (granica: kolor na białym i ciemnym tle ΔE < ${ALPHA_LIMITS.de2000}, krycie ≤ ${ALPHA_LIMITS.dalpha}).`);
