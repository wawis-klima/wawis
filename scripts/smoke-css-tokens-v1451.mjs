// WAWIS 14.51 — wspólna paleta kolorów bez zmiany wyglądu (decyzja właściciela 20.11.2026: „duża kontrola”).
// Dowód statyczny, że przekonwertowane pliki CSS są równoważne oryginałom:
//   • każda zmienna --wx-* stoi tylko w wartości deklaracji (nie w selektorze, @media, komentarzu, napisie, url());
//   • po podstawieniu wartości plik = oryginał (SHA-256 oryginału z chwili konwersji, kolory w postaci kanonicznej);
//   • paleta jest zdefiniowana raz (:root w tokens.css), nikt inny nie definiuje --wx-*, wejście ładuje ją statycznie.
// Dowód w przeglądarce (te same ekrany, styl oryginalny podmieniony na miejscu) — tests/e2e/css-tokens-equivalence-v1451.spec.js.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  REGISTRY_FILE, TOKENS_FILE, canonicalHex, misplacedTokenUses, normalizeForCompare, readTokens, resolveTokens,
  scanDeclarationValues, sha256, tokenNameFor, tokenizeCss, BASELINE_FILE, MERGES_FILE, tokenSequence, readStyleSource,
} from './css-tokens.mjs';
import { OWNER_KEEP, deltaE2000 } from './css-color-merge.mjs';
import { SHADOW_BASELINE_FILE, restoreShadows } from './css-shadows.mjs';
import { ALPHA_BASELINE_FILE, restoreAlpha } from './css-alpha.mjs';

// --- Zachowanie konwertera na trudnych przypadkach (selektory #id, url(), komentarze, napisy, @media, :hover) ---
const tricky = [
  '/* kolor #ffffff w komentarzu */',
  '#fade{color:#FFF;background:url("data:image/svg+xml,%3Csvg fill=\'%23ffffff\'/%3E") #0f172a}',
  'a:hover{color:#2563eb}',
  '.x:not(#abc){border:1px solid #abc}',
  '@media (max-width:700px){.y{box-shadow:0 0 0 1px #64748B80;content:"#000"}}',
  '.z{--local:#fff;color:#12345}',
].join('\n');
const { css: converted, used } = tokenizeCss(tricky);
assert.ok(converted.startsWith('/* kolor #ffffff w komentarzu */'), 'komentarz bez zmian');
assert.match(converted, /^#fade\{color:var\(--wx-white\);background:url\("data:image\/svg\+xml,%3Csvg fill='%23ffffff'\/%3E"\) var\(--wx-slate-900\)\}/m,
  'selektor #fade i url() bez zmian, kolory w wartości → zmienne');
assert.match(converted, /a:hover\{color:var\(--wx-blue-600\)\}/, 'a:hover to selektor, nie właściwość');
assert.match(converted, /\.x:not\(#abc\)\{border:1px solid var\(--wx-c-aabbcc\)\}/, 'selektor :not(#abc) bez zmian');
assert.match(converted, /@media \(max-width:700px\)\{\.y\{box-shadow:0 0 0 1px var\(--wx-c-64748b80\);content:"#000"\}\}/, '@media i napis bez zmian');
assert.match(converted, /\.z\{--local:var\(--wx-white\);color:#12345\}/, 'niepoprawny kolor (5 znaków) zostaje nietknięty');
assert.equal(used.get('--wx-white'), '#ffffff');
assert.deepEqual(misplacedTokenUses(converted), [], 'zmienne tylko w wartościach deklaracji');
assert.equal(misplacedTokenUses('.a{color:red}\n.b var(--wx-white){color:red}').length, 1, 'wykrywa zmienną w selektorze');
assert.equal(misplacedTokenUses('/* var(--wx-white) */.a{color:red}').length, 1, 'wykrywa zmienną w komentarzu');
const toks = {};
for (const [name, hex] of used) toks[name] = hex;
assert.equal(normalizeForCompare(resolveTokens(converted, toks)), normalizeForCompare(tricky), 'podstawienie = oryginał');
assert.equal(canonicalHex('#ABC'), '#aabbcc');
assert.equal(tokenNameFor('#FFF'), '--wx-white');
assert.equal(scanDeclarationValues('.a{color:#fff}').length, 1);

// --- Miara różnicy kolorów (14.61) ---
assert.equal(deltaE2000('#64748b', '#64748b'), 0, 'ten sam kolor → 0');
assert.ok(Math.abs(deltaE2000('#ffffff', '#000000') - 100) < 0.01, 'biały/czarny → 100');
assert.ok(deltaE2000('#f8fafc', '#f7f9fc') < 1 && deltaE2000('#2563eb', '#dc2626') > 40, 'bliskie < 1, niebieski/czerwony > 40');

// --- Paleta ---
const tokensCss = fs.readFileSync(TOKENS_FILE, 'utf8');
const tokens = readTokens(tokensCss);
assert.ok(Object.keys(tokens).length > 0, 'paleta niepusta');
assert.equal((tokensCss.match(/\{/g) || []).length, 1, 'tokens.css ma tylko jeden blok (:root)');
assert.match(tokensCss, /^:root \{$/m);
for (const [name, hex] of Object.entries(tokens)) {
  assert.equal(name, tokenNameFor(hex), `${name}: nazwa zgodna z wartością ${hex}`);
}
assert.equal(new Set(Object.values(tokens)).size, Object.keys(tokens).length, 'jedna zmienna na kolor');

// Nikt poza tokens.css nie definiuje --wx-* (nadpisanie zmieniłoby kolory w części aplikacji).
const cssFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.css')) cssFiles.push(full.split(path.sep).join('/'));
  }
};
walk('src');
walk('public');
for (const file of cssFiles) {
  if (file === TOKENS_FILE) continue;
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /--wx-[a-z0-9-]+\s*:/, `${file} nie definiuje zmiennych palety`);
}
for (const file of fs.readdirSync('src', { recursive: true }).filter((f) => /\.(jsx?|mjs)$/.test(f))) {
  assert.doesNotMatch(fs.readFileSync(path.join('src', file), 'utf8'), /setProperty\(\s*['"]--wx-/, `src/${file} nie zmienia palety w JS`);
}

// Paleta ładowana statycznie w punkcie wejścia (index.html → src/main.jsx), więc trafia do CSS wejścia w buildzie.
const indexHtml = fs.readFileSync('index.html', 'utf8');
assert.match(indexHtml, /<script type="module" src="\/src\/main\.jsx"><\/script>/);
const main = fs.readFileSync('src/main.jsx', 'utf8');
const firstDynamic = main.indexOf('import(');
const tokensImport = main.indexOf("import './styles/tokens.css'");
assert.ok(tokensImport > 0 && (firstDynamic === -1 || tokensImport < firstDynamic), 'statyczny import palety w src/main.jsx przed ładowaniem ekranów');

// --- Przekonwertowane pliki: dowód równoważności ---
const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
const files = Object.entries(registry.files);
assert.ok(files.length >= 1, 'co najmniej jeden przekonwertowany plik');
const usedEverywhere = new Set();
const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
const merges = fs.existsSync(MERGES_FILE) ? JSON.parse(fs.readFileSync(MERGES_FILE, 'utf8')) : { limit_de2000: 0, map: {} };
// Granica właściciela: 21.11.2026 rano „ledwo widoczne” (ΔE2000 < 2), 21.11.2026 11:15 po obejrzeniu 14.62 — etap 3
// („widoczne obok siebie”, ΔE2000 < 3); 21.11.2026 12:29 progi 4 i 5 naraz (ΔE2000 < 5) z wyjątkami OWNER_KEEP.
// Wyższy próg = nowa decyzja właściciela.
assert.ok(merges.limit_de2000 <= 5, `limit łączenia ${merges.limit_de2000} > 5 bez decyzji właściciela`);
for (const hex of OWNER_KEEP) assert.ok(!(hex in merges.map), `${hex} (wyjątek właściciela) nie może być łączony`);
for (const [from, { to, de2000 }] of Object.entries(merges.map)) {
  assert.ok(!(to in merges.map) || merges.map[to].to === to, `${from} → ${to}: łączenie jednokrokowe`);
  assert.ok(Math.abs(deltaE2000(from, to) - de2000) < 0.01 && de2000 < merges.limit_de2000, `${from} → ${to}: zapisana różnica się zgadza i mieści w limicie`);
}
let changedPositions = 0;
const alphaBaseline = fs.existsSync(ALPHA_BASELINE_FILE) ? JSON.parse(fs.readFileSync(ALPHA_BASELINE_FILE, 'utf8')).files : {};
const shadowBaseline = fs.existsSync(SHADOW_BASELINE_FILE) ? JSON.parse(fs.readFileSync(SHADOW_BASELINE_FILE, 'utf8')).files : {};
for (const [file, meta] of files) {
  // 14.81: arkusze używają ról (--wr-*); dowód liczony na postaci z rolami zamienionymi na zmienne palety (smoke-css-roles).
  const current = readStyleSource(file);
  assert.deepEqual(misplacedTokenUses(current), [], `${file}: zmienne tylko w wartościach deklaracji`);
  resolveTokens(current, tokens); // rzuca przy nieznanej zmiennej
  // 14.61: po łączeniu odcieni plik po podstawieniu PIERWOTNYCH kolorów (css-palette-baseline.json, pozycja po pozycji)
  // musi być znak w znak oryginałem, a każda pozycja ma kolor = pierwotny albo jego zapisane połączenie (ΔE2000 < limit).
  const now = tokenSequence(current, tokens);
  const orig = baseline.files[file];
  assert.ok(Array.isArray(orig), `${file}: brak zapisu pierwotnych kolorów`);
  assert.equal(now.length, orig.length, `${file}: liczba miejsc z kolorem różni się od pierwotnej`);
  let k = 0;
  // 14.64: cienie (var(--wxs-…)) najpierw wracają do pierwotnego tekstu (css-shadow-baseline.json, smoke-css-shadows).
  // 14.67: kolory półprzezroczyste (var(--wxa-…)) też wracają do pierwotnego tekstu (css-alpha-baseline.json).
  const reconstructed = restoreAlpha(restoreShadows(current, shadowBaseline[file] || []), alphaBaseline[file] || []).replace(/var\((--wx-[a-z0-9-]+)\)/g, () => orig[k++]);
  assert.equal(sha256(normalizeForCompare(reconstructed)), meta.original_sha256,
    `${file}: poza kolorami plik różni się od oryginału — zmiana wyglądu wymaga osobnej decyzji właściciela`);
  now.forEach((hex, i) => {
    const expected = merges.map[orig[i]]?.to || orig[i];
    if (OWNER_KEEP.includes(orig[i])) assert.equal(hex, orig[i], `${file}: ${orig[i]} to wyjątek właściciela — bez zmian`);
    assert.equal(hex, expected, `${file}: miejsce ${i + 1} ma kolor ${hex}, a zapis połączeń mówi ${expected} (pierwotnie ${orig[i]})`);
    if (hex !== orig[i]) {
      changedPositions += 1;
      const de = deltaE2000(orig[i], hex);
      assert.ok(de < merges.limit_de2000, `${file}: ${orig[i]} → ${hex} ΔE2000 ${de.toFixed(2)} ≥ ${merges.limit_de2000}`);
    }
  });
  for (const m of current.matchAll(/var\((--wx-[a-z0-9-]+)\)/g)) usedEverywhere.add(m[1]);
  // Ten sam plik nie może mieć pozostawionych kolorów hex w wartościach (konwersja kompletna, poza url/komentarzami).
  const leftover = tokenizeCss(current).count;
  assert.equal(leftover, 0, `${file}: wszystkie kolory hex w wartościach zastąpione zmiennymi`);
}
const unused = Object.keys(tokens).filter((name) => !usedEverywhere.has(name));
assert.deepEqual(unused, [], 'paleta bez nieużywanych zmiennych');

console.log(`PASS WAWIS 14.51/14.61 — paleta ${Object.keys(tokens).length} kolorów; ${files.length} plik(i) CSS zgodne z oryginałem poza ${changedPositions} połączonymi odcieniami (ΔE2000 < ${merges.limit_de2000 || 0}); zmienne tylko w wartościach, paleta ładowana w wejściu.`);
