// WAWIS 14.51 — wspólna paleta kolorów (zmienne CSS) bez zmiany wyglądu (decyzja właściciela 20.11.2026).
//
// Zasada: kolor zapisany w pliku CSS (#64748b) zastępujemy zmienną o DOKŁADNIE tej samej wartości
// (var(--wx-slate-500), zdefiniowaną w src/styles/tokens.css jako #64748b). Przeglądarka liczy ten sam kolor,
// więc wygląd jest identyczny. Bliskie, ale różne kolory (#d8e0ec / #dbe3ef) zostają osobnymi zmiennymi —
// ich ewentualne połączenie to osobna decyzja właściciela, bo zmieniłoby piksele.
//
// Dowód „nic się nie zmieniło” (sprawdzany w CI przez smoke-css-tokens-v1451.mjs):
//   1. każde var(--wx-…) stoi wyłącznie w wartości deklaracji (nigdy w selektorze, @media, komentarzu ani url());
//   2. po podstawieniu wartości zmiennych plik jest znak w znak taki sam jak oryginał (skrót SHA-256 oryginału
//      zapisany w scripts/css-token-registry.json w chwili konwersji; kolory porównywane w postaci kanonicznej);
//   3. paleta jest zdefiniowana tylko w :root w tokens.css, ładowanym statycznie przez src/main.jsx.
//
// Użycie: node scripts/css-tokens.mjs convert <plik.css> [...]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOKENS_FILE = 'src/styles/tokens.css';
export const REGISTRY_FILE = 'scripts/css-token-registry.json';
export const TOKEN_PREFIX = '--wx-';
// 14.61: łączenie bardzo podobnych odcieni (decyzja właściciela 21.11.2026) — zob. scripts/css-color-merge.mjs.
export const BASELINE_FILE = 'scripts/css-palette-baseline.json';
export const MERGES_FILE = 'scripts/css-color-merges.json';
export const MERGED_NOTE = 'Od 14.61 bardzo podobne odcienie są połączone (scripts/css-color-merges.json, różnica ΔE2000 względem pierwotnego koloru w granicy zapisanej w tym pliku).';

// Kolejność pierwotnych kolorów (po jednym na każde var(--wx-…) w pliku) — podstawa dowodu w smoke-css-tokens.
export function tokenSequence(css, tokens) {
  return [...css.matchAll(/var\((--wx-[a-z0-9-]+)\)/g)].map((m) => {
    if (!(m[1] in tokens)) throw new Error(`Nieznana zmienna ${m[1]}`);
    return tokens[m[1]];
  });
}

function appendBaseline(rel, css, tokens) {
  const file = path.join(ROOT, BASELINE_FILE);
  if (!fs.existsSync(file)) return;
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
  baseline.files[rel] = tokenSequence(css, tokens);
  baseline.files = Object.fromEntries(Object.entries(baseline.files).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, `${JSON.stringify(baseline)}\n`);
}

// Nazwy dla kolorów z typowej palety (Tailwind) — czytelniejsze niż sam kod. Pozostałe: --wx-c-<kod>.
const NAMED = Object.freeze({
  '#ffffff': 'white', '#000000': 'black',
  '#f8fafc': 'slate-50', '#f1f5f9': 'slate-100', '#e2e8f0': 'slate-200', '#cbd5e1': 'slate-300', '#94a3b8': 'slate-400',
  '#64748b': 'slate-500', '#475569': 'slate-600', '#334155': 'slate-700', '#1e293b': 'slate-800', '#0f172a': 'slate-900',
  '#eff6ff': 'blue-50', '#dbeafe': 'blue-100', '#bfdbfe': 'blue-200', '#93c5fd': 'blue-300', '#60a5fa': 'blue-400',
  '#3b82f6': 'blue-500', '#2563eb': 'blue-600', '#1d4ed8': 'blue-700', '#1e40af': 'blue-800', '#1e3a8a': 'blue-900',
  '#f0fdf4': 'green-50', '#dcfce7': 'green-100', '#bbf7d0': 'green-200', '#86efac': 'green-300', '#22c55e': 'green-500',
  '#16a34a': 'green-600', '#15803d': 'green-700', '#166534': 'green-800', '#14532d': 'green-900',
  '#fef2f2': 'red-50', '#fee2e2': 'red-100', '#fecaca': 'red-200', '#fca5a5': 'red-300', '#ef4444': 'red-500',
  '#dc2626': 'red-600', '#b91c1c': 'red-700', '#991b1b': 'red-800', '#7f1d1d': 'red-900',
  '#fffbeb': 'amber-50', '#fef3c7': 'amber-100', '#fde68a': 'amber-200', '#fcd34d': 'amber-300', '#f59e0b': 'amber-500',
  '#d97706': 'amber-600', '#b45309': 'amber-700', '#92400e': 'amber-800', '#78350f': 'amber-900',
  '#fff7ed': 'orange-50', '#ffedd5': 'orange-100', '#fed7aa': 'orange-200', '#f97316': 'orange-500', '#ea580c': 'orange-600',
  '#c2410c': 'orange-700', '#9a3412': 'orange-800',
});

// #abc → #aabbcc, #abcd → #aabbccdd, małe litery. Ten sam kolor = ta sama postać kanoniczna.
export function canonicalHex(hex) {
  let h = String(hex).toLowerCase().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

export function tokenNameFor(hex) {
  const canonical = canonicalHex(hex);
  return `${TOKEN_PREFIX}${NAMED[canonical] || `c-${canonical.slice(1)}`}`;
}

// Przegląd pliku CSS znak po znaku. Zwraca zakresy „wartości deklaracji” (po `właściwość:` do `;`/`}`),
// pomijając komentarze, napisy i zawartość url(...). Selektor z dwukropkiem (a:hover{) nie jest wartością —
// rozpoznajemy go po tym, że kończy się `{`.
export function scanDeclarationValues(css) {
  const values = []; // { start, end, skips: [[a,b], ...] } — skips: komentarze/napisy/url wewnątrz wartości
  let i = 0;
  let segmentStart = 0;
  let depth = 0;
  let value = null;
  const n = css.length;
  const endSegment = (at) => { segmentStart = at + 1; };
  while (i < n) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      const stop = close === -1 ? n : close + 2;
      if (value) value.skips.push([i, stop]);
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && css[j] !== ch) { if (css[j] === '\\') j += 1; j += 1; }
      if (value) value.skips.push([i, j + 1]);
      i = j + 1;
      continue;
    }
    if (value && /url\(/i.test(css.slice(i, i + 4))) {
      let j = i + 4;
      let level = 1;
      while (j < n && level > 0) {
        if (css[j] === '(') level += 1;
        else if (css[j] === ')') level -= 1;
        else if (css[j] === '"' || css[j] === "'") { const q = css[j]; j += 1; while (j < n && css[j] !== q) { if (css[j] === '\\') j += 1; j += 1; } }
        j += 1;
      }
      value.skips.push([i, j]);
      i = j;
      continue;
    }
    if (ch === '{') {
      value = null; // to był selektor z dwukropkiem (np. a:hover) albo prelude @-reguły
      depth += 1;
      endSegment(i);
    } else if (ch === '}') {
      if (value) { value.end = i; values.push(value); value = null; }
      depth = Math.max(0, depth - 1);
      endSegment(i);
    } else if (ch === ';') {
      if (value) { value.end = i; values.push(value); value = null; }
      endSegment(i);
    } else if (ch === ':' && !value && depth > 0) {
      const property = css.slice(segmentStart, i);
      if (/^\s*-{0,2}[a-zA-Z][a-zA-Z0-9-]*\s*$/.test(property)) value = { start: i + 1, end: n, skips: [] };
    }
    i += 1;
  }
  return values;
}

const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;
const VAR_RE = new RegExp(`var\\((${TOKEN_PREFIX}[a-z0-9-]+)\\)`, 'g');

function inSkips(index, skips) { return skips.some(([a, b]) => index >= a && index < b); }

// Zamiana kolorów w wartościach deklaracji na var(--wx-…). Zwraca nowy tekst i użyte kolory.
export function tokenizeCss(css) {
  const used = new Map();
  const replacements = [];
  for (const value of scanDeclarationValues(css)) {
    const text = css.slice(value.start, value.end);
    for (const match of text.matchAll(HEX_RE)) {
      const at = value.start + match.index;
      if (inSkips(at, value.skips)) continue;
      const canonical = canonicalHex(match[0]);
      const name = tokenNameFor(canonical);
      used.set(name, canonical);
      replacements.push([at, at + match[0].length, `var(${name})`]);
    }
  }
  let out = css;
  for (const [a, b, text] of replacements.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + text + out.slice(b);
  return { css: out, used, count: replacements.length };
}

// Paleta z tokens.css: { '--wx-slate-500': '#64748b', … } — tylko z bloku :root.
export function readTokens(tokensCss) {
  const rootBlock = tokensCss.match(/:root\s*\{([\s\S]*?)\}/);
  const tokens = {};
  if (!rootBlock) return tokens;
  for (const m of rootBlock[1].matchAll(new RegExp(`(${TOKEN_PREFIX}[a-z0-9-]+)\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, 'g'))) {
    tokens[m[1]] = canonicalHex(m[2]);
  }
  return tokens;
}

// Postać do porównania: wszystkie kolory hex w kanonicznej postaci (poza tym tekst bez zmian).
export function normalizeForCompare(css) {
  return css.replace(HEX_RE, (hex) => canonicalHex(hex));
}

export function resolveTokens(css, tokens) {
  return css.replace(VAR_RE, (whole, name) => {
    if (!(name in tokens)) throw new Error(`Nieznana zmienna ${name}`);
    return tokens[name];
  });
}

export function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }

// --- 14.81: role kolorów (krok 1 do motywu ciemnego, decyzja właściciela 22.11.2026) ---
// Arkusze nie odwołują się już wprost do palety, tylko do roli: var(--wr-<rodzaj>-<kolor>), np. var(--wr-bg-white)
// (biały jako tło) i var(--wr-text-white) (biały jako tekst). Rola jest zdefiniowana w src/styles/roles.css jako
// var(--wx-<kolor>) — w motywie jasnym DOKŁADNIE ten sam kolor, więc wygląd się nie zmienia. Motyw ciemny nadpisze
// same role (np. tło białe → ciemne), a tekst biały na niebieskim przycisku zostanie biały.
// Rodzaj roli wynika z właściwości CSS, w której stoi kolor (roleKindFor) — sprawdzane w smoke-css-roles.
export const ROLES_FILE = 'src/styles/roles.css';
export const ROLE_PREFIX = '--wr-';
export const ROLE_KINDS = Object.freeze({
  bg: 'tło',
  text: 'tekst',
  line: 'ramka lub linia',
  icon: 'ikona, wypełnienie, pole wyboru',
  shadow: 'kolor cienia',
  accent: 'zmienna lokalna arkusza o mieszanym użyciu',
});
// Arkusze z własnymi rolami i własnym motywem ciemnym (prefers-color-scheme) — bez warstwy --wr-*.
export const ROLE_EXEMPT_FILES = Object.freeze(['src/public-qr/public-qr.css']);
const ROLE_VAR_RE = /var\((--wr-[a-z0-9-]+)\)/g;

export function roleKindFor(property) {
  const p = String(property).trim().toLowerCase();
  if (p.startsWith('--')) {
    if (/border|line/.test(p)) return 'line';
    if (/bg|surface|soft|background/.test(p)) return 'bg';
    if (/ink|muted|fg|text|color|title|heading|body/.test(p)) return 'text';
    return 'accent';
  }
  if (/^background(-color|-image)?$/.test(p)) return 'bg';
  if (/^(color|-webkit-text-fill-color|caret-color|text-decoration(-color)?|-webkit-text-stroke(-color)?)$/.test(p)) return 'text';
  if (/^(border|outline|column-rule)(-[a-z-]+)?$/.test(p)) return 'line';
  if (/^(fill|stroke|accent-color)$/.test(p)) return 'icon';
  if (/^(box-shadow|text-shadow|filter|drop-shadow)$/.test(p)) return 'shadow';
  return null;
}

export function roleNameFor(kind, paletteName) {
  if (!(kind in ROLE_KINDS)) throw new Error(`Nieznany rodzaj roli ${kind}`);
  if (!paletteName.startsWith(TOKEN_PREFIX)) throw new Error(`To nie jest zmienna palety: ${paletteName}`);
  return `${ROLE_PREFIX}${kind}-${paletteName.slice(TOKEN_PREFIX.length)}`;
}

// Nazwa właściwości przed wartością deklaracji zaczynającą się w `valueStart`.
export function propertyBefore(css, valueStart) {
  let p = valueStart - 2;
  while (p >= 0 && !/[;{}]/.test(css[p])) p -= 1;
  return css.slice(p + 1, valueStart - 1).trim();
}

// Role z pierwszego bloku :root w roles.css: { '--wr-bg-white': '--wx-white', … }.
export function readRoles(rolesCss) {
  const rootBlock = String(rolesCss || '').match(/:root\s*\{([\s\S]*?)\}/);
  const roles = {};
  if (!rootBlock) return roles;
  for (const m of rootBlock[1].matchAll(/(--wr-[a-z0-9-]+)\s*:\s*var\((--wx-[a-z0-9-]+)\)\s*;/g)) roles[m[1]] = m[2];
  return roles;
}

export function readRolesFile() {
  const file = path.join(ROOT, ROLES_FILE);
  return fs.existsSync(file) ? readRoles(fs.readFileSync(file, 'utf8')) : {};
}

// var(--wr-…) → var(--wx-…) — arkusz w postaci sprzed 14.81 (podstawa wszystkich dowodów równoważności).
export function resolveRoles(css, roles = readRolesFile()) {
  return css.replace(ROLE_VAR_RE, (whole, name) => {
    if (!(name in roles)) throw new Error(`Nieznana rola koloru ${name}`);
    return `var(${roles[name]})`;
  });
}

// Treść arkusza z rolami zamienionymi na zmienne palety.
export function readStyleSource(rel, roles = readRolesFile()) {
  return resolveRoles(fs.readFileSync(path.join(ROOT, rel), 'utf8'), roles);
}

// Każde użycie roli z właściwością, w której stoi (do kontroli rodzaju).
export function roleUses(css) {
  const out = [];
  const values = scanDeclarationValues(css);
  for (const match of css.matchAll(ROLE_VAR_RE)) {
    const at = match.index;
    const value = values.find((v) => at >= v.start && at < v.end && !inSkips(at, v.skips));
    out.push({ at, role: match[1], property: value ? propertyBefore(css, value.start) : null, line: css.slice(0, at).split('\n').length });
  }
  return out;
}

// Zamiana var(--wx-…) w wartościach deklaracji na role według właściwości. Zwraca nowy tekst i użyte role.
export function assignRoles(css, rel = '') {
  const used = new Map();
  const replacements = [];
  for (const value of scanDeclarationValues(css)) {
    const text = css.slice(value.start, value.end);
    const property = propertyBefore(css, value.start);
    for (const match of text.matchAll(VAR_RE)) {
      const at = value.start + match.index;
      if (inSkips(at, value.skips)) continue;
      const kind = roleKindFor(property);
      if (!kind) throw new Error(`${rel}: nie wiem, jaką rolę ma kolor we właściwości „${property}” (linia ${css.slice(0, at).split('\n').length})`);
      const role = roleNameFor(kind, match[1]);
      used.set(role, match[1]);
      replacements.push([at, at + match[0].length, `var(${role})`]);
    }
  }
  let out = css;
  for (const [a, b, text] of replacements.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + text + out.slice(b);
  return { css: out, used, count: replacements.length };
}

export function writeRoles(roles) {
  const byKind = new Map(Object.keys(ROLE_KINDS).map((k) => [k, []]));
  for (const [role, palette] of Object.entries(roles)) byKind.get(role.slice(ROLE_PREFIX.length).split('-')[0]).push([role, palette]);
  const sections = [];
  for (const [kind, rows] of byKind) {
    if (!rows.length) continue;
    rows.sort(([a], [b]) => a.localeCompare(b));
    sections.push(`  /* ${ROLE_KINDS[kind]} */\n${rows.map(([role, palette]) => `  ${role}: var(${palette});`).join('\n')}`);
  }
  const header = `/* WAWIS — role kolorów (14.81+). Generowane przez scripts/css-tokens.mjs roles — nie edytuj ręcznie bloku :root.
   Rola = rodzaj użycia + kolor palety: --wr-bg-white to biały jako tło, --wr-text-white to biały jako tekst.
   W motywie jasnym każda rola ma dokładnie kolor palety ze swojej nazwy, więc wygląd jest taki sam jak przed 14.81.
   Motyw ciemny (w przyszłości) nadpisze role w osobnym bloku, bez zmian w arkuszach ekranów.
   Ładowane statycznie przez src/main.jsx zaraz po palecie (tokens.css). */\n`;
  fs.writeFileSync(path.join(ROOT, ROLES_FILE), `${header}:root {\n${sections.join('\n')}\n}\n`);
}

function convertRoles(files) {
  const roles = readRolesFile();
  for (const file of files) {
    const rel = path.relative(ROOT, path.resolve(file)).split(path.sep).join('/');
    if (ROLE_EXEMPT_FILES.includes(rel)) throw new Error(`${rel} ma własne role i motyw ciemny — bez zmian`);
    const original = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (ROLE_VAR_RE.test(original)) { ROLE_VAR_RE.lastIndex = 0; throw new Error(`${rel} ma już role`); }
    const { css, used, count } = assignRoles(original, rel);
    for (const [role, palette] of used) {
      if (roles[role] && roles[role] !== palette) throw new Error(`Kolizja roli ${role}`);
      roles[role] = palette;
    }
    if (resolveRoles(css, roles) !== original) throw new Error(`${rel}: po podstawieniu ról plik różni się od oryginału`);
    if (/var\(--wx-/.test(css)) throw new Error(`${rel}: zostało odwołanie do palety poza wartością deklaracji`);
    fs.writeFileSync(path.join(ROOT, rel), css);
    console.log(`${rel}: ${count} kolorów → role (${used.size} różnych)`);
  }
  writeRoles(roles);
}

// Każde var(--wx-…) musi stać w wartości deklaracji (nie w selektorze, @media, komentarzu, napisie ani url()).
export function misplacedTokenUses(css) {
  const values = scanDeclarationValues(css);
  const bad = [];
  for (const match of css.matchAll(VAR_RE)) {
    const at = match.index;
    const ok = values.some((v) => at >= v.start && at < v.end && !inSkips(at, v.skips));
    if (!ok) bad.push({ at, token: match[1], line: css.slice(0, at).split('\n').length });
  }
  return bad;
}

export function writeTokens(tokens, note = 'Każda zmienna ma dokładnie wartość koloru, który zastąpiła w plikach CSS, więc wygląd się nie zmienia.') {
  const lines = Object.entries(tokens)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, hex]) => `  ${name}: ${hex};`);
  const header = `/* WAWIS — wspólna paleta kolorów (14.51+). Generowane przez scripts/css-tokens.mjs — nie edytuj ręcznie.
   ${note}
   Ładowane statycznie przez src/main.jsx (telefon, komputer, strona naklejki QR). */\n`;
  fs.writeFileSync(path.join(ROOT, TOKENS_FILE), `${header}:root {\n${lines.join('\n')}\n}\n`);
}

function convert(files) {
  const tokensPath = path.join(ROOT, TOKENS_FILE);
  const tokens = fs.existsSync(tokensPath) ? readTokens(fs.readFileSync(tokensPath, 'utf8')) : {};
  const registryPath = path.join(ROOT, REGISTRY_FILE);
  const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, 'utf8')) : { files: {} };
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'app-version.json'), 'utf8')).version;
  for (const file of files) {
    const rel = path.relative(ROOT, path.resolve(file)).split(path.sep).join('/');
    if (registry.files[rel]) throw new Error(`${rel} jest już przekonwertowany`);
    const original = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const { css, used, count } = tokenizeCss(original);
    for (const [name, hex] of used) {
      if (tokens[name] && tokens[name] !== hex) throw new Error(`Kolizja nazwy ${name}: ${tokens[name]} ≠ ${hex}`);
      tokens[name] = hex;
    }
    const bad = misplacedTokenUses(css);
    if (bad.length) throw new Error(`${rel}: zmienna poza wartością deklaracji (linie ${bad.map((b) => b.line).join(', ')})`);
    if (normalizeForCompare(resolveTokens(css, tokens)) !== normalizeForCompare(original)) throw new Error(`${rel}: po podstawieniu plik różni się od oryginału`);
    fs.writeFileSync(path.join(ROOT, rel), css);
    appendBaseline(rel, css, tokens);
    registry.files[rel] = {
      version,
      replaced: count,
      original_sha256: sha256(normalizeForCompare(original)),
    };
    console.log(`${rel}: ${count} kolorów → zmienne (${used.size} różnych)`);
  }
  writeTokens(tokens, fs.existsSync(path.join(ROOT, MERGES_FILE)) ? MERGED_NOTE : undefined);
  registry.files = Object.fromEntries(Object.entries(registry.files).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...files] = process.argv.slice(2);
  if (!['convert', 'roles'].includes(command) || !files.length) {
    console.error('Użycie: node scripts/css-tokens.mjs convert|roles <plik.css> [...]');
    process.exit(2);
  }
  if (command === 'roles') convertRoles(files);
  else convert(files);
}
