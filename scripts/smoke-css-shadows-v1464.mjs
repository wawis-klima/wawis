// WAWIS 14.64 — wspólne cienie (box-shadow) jako zmienne --wxs-*. Dowód statyczny:
//   • cień jest zmienną tylko jako cała wartość deklaracji box-shadow;
//   • w każdym przekonwertowanym pliku liczba cieni = zapis pierwotny (css-shadow-baseline.json), a pozycja po
//     pozycji wartość zmiennej = cień pierwotny (postać kanoniczna) albo jego zapisane połączenie mieszczące się
//     w granicy SHADOW_LIMITS (od 14.65); po odtworzeniu pliki = oryginał (sprawdza smoke-css-tokens);
//   • paleta cieni zdefiniowana raz (:root w shadows.css), ładowana statycznie w src/main.jsx; brak cieni zapisanych
//     wprost w przekonwertowanych plikach.
// Dowód w przeglądarce: tests/e2e/css-tokens-equivalence-v1451.spec.js (styl z cieniami podmieniany na oryginał).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  SHADOWS_FILE, SHADOW_BASELINE_FILE, SHADOW_MERGES_FILE, SHADOW_LIMITS, SHADOW_VAR_RE, literalShadowDeclarations,
  misplacedShadowUses, normalizeShadow, selectorAt, baseSelector, parseShadow, readShadows, restoreShadows, shadowDistance, shadowNameFor,
  withinLimits,
} from './css-shadows.mjs';
import { REGISTRY_FILE } from './css-tokens.mjs';

// --- Postać kanoniczna i odległość ---
assert.equal(normalizeShadow('0px 8px 20px rgba(46, 102, 214, 0.22)'), '0 8px 20px rgba(46,102,214,.22)');
assert.equal(normalizeShadow('0 0 0 1px rgb(0 0 0 / 10%)'), '0 0 0 1px rgba(0,0,0,.1)');
assert.equal(normalizeShadow('inset 0 1px 0 rgba(255,255,255,.7),0 10px 24px rgba(15,35,69,.06)'),
  'inset 0 1px 0 rgba(255,255,255,.7), 0 10px 24px rgba(15,35,69,.06)');
assert.deepEqual(parseShadow('0 -1px 2px 3px rgba(1,2,3,.5) inset')[0], { inset: true, x: 0, y: -1, blur: 2, spread: 3, rgb: [1, 2, 3], a: 0.5 });
assert.ok(withinLimits(shadowDistance('0 10px 24px rgba(15,35,69,.05)', '0 12px 28px rgba(15,35,69,.06)')), 'kosmetyczna różnica');
assert.ok(!withinLimits(shadowDistance('0 10px 24px rgba(15,35,69,.06)', '0 20px 48px rgba(15,35,69,.22)')), 'cień okna ≠ cień karty');
assert.equal(shadowDistance('0 2px 8px rgba(0,0,0,.1)', 'inset 0 2px 8px rgba(0,0,0,.1)'), null, 'inset ≠ zwykły');
assert.equal(shadowDistance('0 2px 8px rgba(0,0,0,.1)', '0 2px 8px rgba(0,0,0,.1), 0 0 0 1px rgba(0,0,0,.1)'), null, 'inna liczba warstw');
const sample = '.a{box-shadow:0 1px 2px rgba(0,0,0,.1)!important}.b{box-shadow:none}.c{box-shadow:0 0 0 1px var(--wx-white)}';
assert.equal(literalShadowDeclarations(sample).length, 1, 'tylko cień zapisany wprost');
assert.equal(misplacedShadowUses('.a{box-shadow:var(--wxs-1-2-abcd) !important}').length, 0);
assert.equal(misplacedShadowUses('.a{color:var(--wxs-1-2-abcd)}').length, 1, 'wykrywa cień w innej właściwości');
assert.equal(misplacedShadowUses('.a{box-shadow:0 0 0 1px red, var(--wxs-1-2-abcd)}').length, 1, 'cień tylko jako cała wartość');

// --- Paleta cieni ---
const shadowsCss = fs.readFileSync(SHADOWS_FILE, 'utf8');
const shadows = readShadows(shadowsCss);
assert.equal((shadowsCss.match(/\{/g) || []).length, 1, 'shadows.css ma tylko blok :root');
assert.ok(Object.keys(shadows).length > 0);
for (const [name, value] of Object.entries(shadows)) {
  assert.equal(value, normalizeShadow(value), `${name}: wartość w postaci kanonicznej`);
  assert.equal(name, shadowNameFor(value), `${name}: nazwa zgodna z wartością`);
}
assert.equal(new Set(Object.values(shadows)).size, Object.keys(shadows).length, 'jedna zmienna na cień');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full.split(path.sep).join('/'));
  }
  return out;
};
for (const file of walk('src').filter((f) => f.endsWith('.css') && f !== SHADOWS_FILE)) {
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /--wxs-[a-z0-9-]+\s*:/, `${file} nie definiuje cieni palety`);
}
const main = fs.readFileSync('src/main.jsx', 'utf8');
const imp = main.indexOf("import './styles/shadows.css'");
assert.ok(imp > 0 && imp < main.indexOf('import('), 'statyczny import cieni w src/main.jsx przed ładowaniem ekranów');

// --- Pliki ---
const baseline = JSON.parse(fs.readFileSync(SHADOW_BASELINE_FILE, 'utf8')).files;
const merges = fs.existsSync(SHADOW_MERGES_FILE) ? JSON.parse(fs.readFileSync(SHADOW_MERGES_FILE, 'utf8')) : { map: {} };
if (merges.limits) assert.deepEqual(merges.limits, SHADOW_LIMITS, 'granica łączenia zapisana = granica w kodzie');
for (const [from, { to }] of Object.entries(merges.map)) {
  assert.ok(withinLimits(shadowDistance(from, to)), `${from} → ${to}: w granicy kosmetycznej`);
}
const registry = Object.keys(JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')).files);
const used = new Set();
let positions = 0;
let changed = 0;
for (const file of registry) {
  const css = fs.readFileSync(file, 'utf8');
  assert.deepEqual(misplacedShadowUses(css), [], `${file}: cień tylko jako cała wartość box-shadow`);
  assert.deepEqual(literalShadowDeclarations(css).map((d) => d.raw), [], `${file}: brak cieni zapisanych wprost`);
  const names = [...css.matchAll(SHADOW_VAR_RE)].map((m) => m[1]);
  const raws = baseline[file] || [];
  assert.equal(names.length, raws.length, `${file}: liczba cieni = zapis pierwotny`);
  restoreShadows(css, raws);
  names.forEach((name, i) => {
    assert.ok(name in shadows, `${file}: nieznany cień ${name}`);
    used.add(name);
    const orig = normalizeShadow(raws[i]);
    const expected = merges.map[orig]?.to || orig;
    assert.equal(shadows[name], expected, `${file}: cień ${i + 1} = ${shadows[name]}, oczekiwano ${expected} (pierwotnie ${raws[i]})`);
    positions += 1;
    if (expected !== orig) changed += 1;
  });
}
// 14.65: element w różnych stanach (zwykły / :hover / :active / aktywny) zachowuje różne cienie, jeśli różniły się
// pierwotnie — łączenie nie może zabrać reakcji przycisku na dotyk.
for (const file of registry) {
  const css = fs.readFileSync(file, 'utf8');
  const raws = baseline[file] || [];
  const byBase = new Map();
  [...css.matchAll(SHADOW_VAR_RE)].forEach((m, i) => {
    for (const part of selectorAt(css, m.index).split(',')) {
      const key = baseSelector(part);
      if (!byBase.has(key)) byBase.set(key, []);
      byBase.get(key).push({ orig: normalizeShadow(raws[i]), now: shadows[m[1]], sel: part.trim() });
    }
  });
  for (const [key, rows] of byBase) {
    for (const a of rows) for (const b of rows) {
      const stateVsOther = a.sel !== b.sel && (a.sel !== baseSelector(a.sel) || b.sel !== baseSelector(b.sel));
      if (stateVsOther && a.orig !== b.orig) assert.notEqual(a.now, b.now, `${file}: „${a.sel}” i „${b.sel}” miały różne cienie, a po łączeniu mają ten sam (${key})`);
    }
  }
}
for (const file of Object.keys(baseline)) assert.ok(registry.includes(file), `${file}: w zapisie cieni, ale nie w rejestrze`);
assert.deepEqual(Object.keys(shadows).filter((n) => !used.has(n)), [], 'brak nieużywanych cieni');

console.log(`PASS WAWIS 14.64 — ${Object.keys(shadows).length} wspólnych cieni w ${positions} miejscach; połączonych: ${changed} (granica: przesunięcie ≤ ${SHADOW_LIMITS.dy}px, rozmycie ≤ ${SHADOW_LIMITS.dblur}px, krycie ≤ ${SHADOW_LIMITS.dalpha}, kolor ΔE < ${SHADOW_LIMITS.de2000}).`);
