// WAWIS 14.81/14.82 — role kolorów (krok 1 do motywu ciemnego, decyzja właściciela 22.11.2026): wygląd bez zmian.
// Arkusze ekranów odwołują się do ról var(--wr-<rodzaj>-<kolor>), a nie wprost do palety var(--wx-<kolor>).
// Dowód, że motyw jasny wygląda tak samo:
//   • każda rola w src/styles/roles.css (:root) = dokładnie var(--wx-<kolor z nazwy roli>), więc kolor się nie zmienia;
//   • po zamianie ról na zmienne palety każdy arkusz z rejestru = oryginał (smoke-css-tokens, dowód z 14.51);
//   • w przeglądarce role mają kolory palety i podmiana arkusza na oryginał nie zmienia stylu (testy E2E i WebKit).
// Kontrola ról: rodzaj roli zgadza się z właściwością CSS (tło w background, tekst w color, ramka w border…).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ALPHA_FILE, readAlpha } from './css-alpha.mjs';
import {
  ROLES_FILE, ROLE_EXEMPT_FILES, ROLE_KINDS, ROLE_PREFIX, TOKENS_FILE, assignRoles, misplacedTokenUses, readRoles, readTokens,
  resolveRoles, roleKindFor, roleNameFor, roleUses,
} from './css-tokens.mjs';

// --- Zachowanie narzędzia na trudnych przypadkach ---
assert.equal(roleKindFor('background'), 'bg');
assert.equal(roleKindFor('background-image'), 'bg');
assert.equal(roleKindFor('color'), 'text');
assert.equal(roleKindFor('-webkit-text-fill-color'), 'text');
assert.equal(roleKindFor('border-bottom'), 'line');
assert.equal(roleKindFor('outline'), 'line');
assert.equal(roleKindFor('accent-color'), 'icon');
assert.equal(roleKindFor('stroke'), 'icon');
assert.equal(roleKindFor('box-shadow'), 'shadow');
assert.equal(roleKindFor('--wawisDesktopSoftBorder'), 'line', 'zmienna lokalna: rola z nazwy (ramka przed „soft”)');
assert.equal(roleKindFor('--desktopModuleTitleColor'), 'text');
assert.equal(roleKindFor('--wizard-blue'), 'accent');
assert.equal(roleKindFor('width'), null, 'kolor we właściwości bez roli → błąd konwersji, nie zgadywanie');
assert.equal(roleNameFor('bg', '--wx-white'), '--wr-bg-white');
assert.equal(roleNameFor('line', '--wx-c-dbe6f2'), '--wr-line-c-dbe6f2');
assert.equal(roleNameFor('bg', '--wxa-0f172a-080'), '--wr-bg-a-0f172a-080', '14.82: kolor półprzezroczysty → rola z „a-”');
assert.match(assignRoles('.m{background:var(--wxa-000000-500);color:var(--wx-white)}').css, /background:var\(--wr-bg-a-000000-500\);color:var\(--wr-text-white\)/);
assert.throws(() => roleNameFor('glow', '--wx-white'), /Nieznany rodzaj/);

const sample = [
  '/* var(--wx-white) w komentarzu */',
  '.btn{background:var(--wx-blue-600);color:var(--wx-white);border:1px solid var(--wx-blue-700)}',
  '.card{background:linear-gradient(var(--wx-white),var(--wx-slate-50))}',
  'a:hover{color:var(--wx-blue-700)}',
  '@media (max-width:700px){.x{box-shadow:0 0 0 1px var(--wx-white)}}',
].join('\n');
const { css: withRoles, used } = assignRoles(sample, 'próbka');
assert.ok(withRoles.startsWith('/* var(--wx-white) w komentarzu */'), 'komentarz bez zmian');
assert.match(withRoles, /\.btn\{background:var\(--wr-bg-blue-600\);color:var\(--wr-text-white\);border:1px solid var\(--wr-line-blue-700\)\}/,
  'ten sam biały: tło i tekst to różne role');
assert.match(withRoles, /linear-gradient\(var\(--wr-bg-white\),var\(--wr-bg-slate-50\)\)/, 'gradient w tle → role tła');
assert.match(withRoles, /a:hover\{color:var\(--wr-text-blue-700\)\}/, 'a:hover to selektor, nie właściwość');
assert.match(withRoles, /box-shadow:0 0 0 1px var\(--wr-shadow-white\)/, 'kolor w cieniu → rola cienia');
assert.equal(used.get('--wr-text-white'), '--wx-white');
assert.equal(resolveRoles(withRoles, Object.fromEntries(used)), sample, 'role → paleta = oryginał');
assert.throws(() => assignRoles('.a{width:var(--wx-white)}', 'próbka'), /nie wiem, jaką rolę/);
assert.throws(() => resolveRoles('.a{color:var(--wr-text-nieznany)}', {}), /Nieznana rola/);
assert.deepEqual(roleUses('.a{border-top:1px solid var(--wr-line-white)}').map((u) => u.property), ['border-top']);

// --- roles.css: jeden blok :root, rola = kolor palety ze swojej nazwy ---
const tokens = readTokens(fs.readFileSync(TOKENS_FILE, 'utf8'));
// 14.82: także kolory półprzezroczyste (--wxa-*).
const alpha = readAlpha(fs.readFileSync(ALPHA_FILE, 'utf8'));
const rolesCss = fs.readFileSync(ROLES_FILE, 'utf8');
const roles = readRoles(rolesCss);
assert.equal((rolesCss.match(/\{/g) || []).length, 1, 'roles.css ma tylko blok :root (motyw ciemny = osobna decyzja)');
assert.match(rolesCss, /^:root \{$/m);
assert.equal((rolesCss.match(/--wr-[a-z0-9-]+\s*:/g) || []).length, Object.keys(roles).length, 'każda rola zapisana jako var(--wx-…)');
assert.doesNotMatch(rolesCss, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'role bez kolorów wpisanych wprost');
for (const [role, palette] of Object.entries(roles)) {
  assert.ok(palette in tokens || palette in alpha, `${role}: ${palette} jest w palecie`);
  const kind = role.slice(ROLE_PREFIX.length).split('-')[0];
  assert.ok(kind in ROLE_KINDS, `${role}: znany rodzaj roli`);
  assert.equal(role, roleNameFor(kind, palette), `${role}: w motywie jasnym kolor z nazwy (${palette})`);
}

// Role definiuje tylko roles.css i nikt ich nie zmienia w JS.
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
for (const file of fs.readdirSync('src', { recursive: true }).filter((f) => /\.(jsx?|mjs)$/.test(f))) {
  const src = fs.readFileSync(path.join('src', file), 'utf8');
  assert.doesNotMatch(src, /setProperty\(\s*['"]--wr-/, `src/${file} nie zmienia ról w JS`);
  assert.doesNotMatch(src, /var\(--wxa?-/, `src/${file}: kolory z palety tylko przez role w arkuszach`);
}

// Wejście: role ładowane statycznie zaraz po palecie.
const main = fs.readFileSync('src/main.jsx', 'utf8');
const tokensImport = main.indexOf("import './styles/tokens.css'");
const rolesImport = main.indexOf("import './styles/roles.css'");
const firstDynamic = main.indexOf('import(');
assert.ok(tokensImport > 0 && rolesImport > tokensImport && (firstDynamic === -1 || rolesImport < firstDynamic), 'role ładowane w src/main.jsx po palecie');

// --- Arkusze: wszystkie kolory z palety przez role, rodzaj roli = właściwość ---
const usedRoles = new Set();
let uses = 0;
let filesWithRoles = 0;
for (const file of cssFiles) {
  if (file === TOKENS_FILE || file === ROLES_FILE || file === ALPHA_FILE) continue;
  const css = fs.readFileSync(file, 'utf8');
  if (file !== ROLES_FILE) assert.doesNotMatch(css, /--wr-[a-z0-9-]+\s*:/, `${file} nie definiuje ról`);
  if (ROLE_EXEMPT_FILES.includes(file)) {
    assert.doesNotMatch(css, /var\(--wr-/, `${file}: własne role (--pqr-*), bez warstwy --wr-*`);
    assert.match(css, /prefers-color-scheme: dark/, `${file}: ma własny motyw ciemny`);
    continue;
  }
  assert.doesNotMatch(css, /var\(--wxa?-/, `${file}: kolor z palety bez roli`);
  const list = roleUses(css);
  if (!list.length) continue;
  filesWithRoles += 1;
  assert.deepEqual(misplacedTokenUses(resolveRoles(css, roles)), [], `${file}: role tylko w wartościach deklaracji`);
  for (const u of list) {
    assert.ok(u.role in roles, `${file}:${u.line}: nieznana rola ${u.role}`);
    assert.ok(u.property, `${file}:${u.line}: ${u.role} poza wartością deklaracji`);
    const kind = u.role.slice(ROLE_PREFIX.length).split('-')[0];
    assert.equal(kind, roleKindFor(u.property), `${file}:${u.line}: ${u.role} we właściwości „${u.property}” — zły rodzaj roli`);
    usedRoles.add(u.role);
    uses += 1;
  }
}
// 14.83: role w kodzie JS (scripts/js-colors.mjs; rodzaj roli sprawdza smoke-js-colors-v1483).
let jsUses = 0;
for (const file of fs.readdirSync('src', { recursive: true }).filter((f) => /\.(jsx?|mjs)$/.test(f))) {
  for (const m of fs.readFileSync(path.join('src', file), 'utf8').matchAll(/var\((--wr-[a-z0-9-]+)\)/g)) {
    assert.ok(m[1] in roles, `src/${file}: nieznana rola ${m[1]}`);
    usedRoles.add(m[1]);
    jsUses += 1;
  }
}
assert.deepEqual(Object.keys(roles).filter((r) => !usedRoles.has(r)), [], 'brak nieużywanych ról');
assert.ok(uses > 3500 && filesWithRoles >= 28, `role w ${uses} miejscach, ${filesWithRoles} arkuszach`);

const byKind = {};
for (const r of Object.keys(roles)) { const k = r.slice(ROLE_PREFIX.length).split('-')[0]; byKind[k] = (byKind[k] || 0) + 1; }
const alphaRoles = Object.values(roles).filter((p) => p.startsWith('--wxa-')).length;
console.log(`PASS WAWIS 14.81/14.82 — ${Object.keys(roles).length} ról kolorów (w tym ${alphaRoles} półprzezroczystych) (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}) w ${uses} miejscach w ${filesWithRoles} arkuszach i ${jsUses} w kodzie JS; w motywie jasnym rola = kolor palety ze swojej nazwy.`);
