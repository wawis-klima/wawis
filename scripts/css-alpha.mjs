// WAWIS 14.67+ — wspólne kolory półprzezroczyste rgba(…) jako zmienne CSS --wxa-* (decyzja właściciela 21.11.2026).
//
// 14.67: każdy rgba(r,g,b,a) w wartościach deklaracji przekonwertowanych plików (poza box-shadow — cienie mają własną
//        paletę, scripts/css-shadows.mjs) zastępujemy zmienną o DOKŁADNIE tej samej wartości (src/styles/alpha.css).
//        Pierwotny tekst każdego koloru zapisany pozycja po pozycji: scripts/css-alpha-baseline.json.
// 14.68: łączenie kolorów o ledwo widocznej różnicy: kolor wynikowy na białym i na ciemnym tle różni się od
//        pierwotnego o mniej niż ALPHA_LIMITS.de2000 (ΔE2000), a krycie o najwyżej ALPHA_LIMITS.dalpha.
//        Kolory stanów przycisków (najechany / wciśnięty / aktywny) i kolory użyte dosłownie w testach — bez łączenia.
//
// Użycie: node scripts/css-alpha.mjs convert | plan | apply | report
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY_FILE, readStyleSource, scanDeclarationValues } from './css-tokens.mjs';
import { deltaE2000 } from './css-color-merge.mjs';
import { baseSelector, selectorAt } from './css-shadows.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ALPHA_FILE = 'src/styles/alpha.css';
export const ALPHA_BASELINE_FILE = 'scripts/css-alpha-baseline.json';
export const ALPHA_MERGES_FILE = 'scripts/css-alpha-merges.json';
export const ALPHA_VAR_RE = /var\((--wxa-[a-z0-9-]+)\)/g;
export const ALPHA_LIMITS = Object.freeze({ de2000: 2, dalpha: 0.03 });
// Tła, na których sprawdzamy kolor wynikowy: białe karty i najciemniejszy granat aplikacji.
export const ALPHA_BACKDROPS = Object.freeze(['#ffffff', '#0f172a']);
const RGBA_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+%?)\s*)?\)/gi;

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const n = (v) => String(Number(v)).replace(/^0\./, '.');

export function parseRgba(text) {
  RGBA_RE.lastIndex = 0;
  const m = RGBA_RE.exec(text);
  RGBA_RE.lastIndex = 0;
  if (!m || m[0].length !== text.trim().length) throw new Error(`Kolor rgba? ${text}`);
  const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]));
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
}
export function normalizeRgba(text) {
  const { r, g, b, a } = parseRgba(text);
  return `rgba(${r},${g},${b},${n(a)})`;
}
export function alphaNameFor(value) {
  const { r, g, b, a } = parseRgba(value);
  const hex = [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `--wxa-${hex}-${String(Math.round(a * 1000)).padStart(3, '0')}`;
}
const hex = ([r, g, b]) => `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
function over(value, backdrop) {
  const { r, g, b, a } = parseRgba(value);
  const bg = [1, 3, 5].map((i) => parseInt(backdrop.slice(i, i + 2), 16));
  return hex([r, g, b].map((c, i) => c * a + bg[i] * (1 - a)));
}
// Największa różnica koloru wynikowego (ΔE2000) na tłach ALPHA_BACKDROPS i różnica krycia.
export function alphaDistance(orig, next) {
  const A = parseRgba(orig); const B = parseRgba(next);
  // Całkiem przezroczysty (koniec cieniowania) zostaje przezroczysty — nie łączymy go z widocznym.
  if ((A.a === 0) !== (B.a === 0)) return { de2000: Infinity, dalpha: Math.abs(A.a - B.a) };
  return {
    de2000: Math.max(...ALPHA_BACKDROPS.map((bg) => deltaE2000(over(orig, bg), over(next, bg)))),
    dalpha: Math.round(Math.abs(A.a - B.a) * 1e6) / 1e6,
  };
}
export const alphaWithinLimits = (d) => d.de2000 < ALPHA_LIMITS.de2000 && d.dalpha <= ALPHA_LIMITS.dalpha + 1e-9;

function propertyBefore(css, start) {
  let p = start - 2;
  while (p >= 0 && !/[;{}]/.test(css[p])) p -= 1;
  return css.slice(p + 1, start - 1).trim().toLowerCase();
}
const inSkips = (i, skips) => skips.some(([a, b]) => i >= a && i < b);

// Kolory rgba(…) zapisane wprost w wartościach (poza box-shadow, komentarzami, napisami, url()).
export function literalAlphaUses(css) {
  const out = [];
  for (const v of scanDeclarationValues(css)) {
    if (propertyBefore(css, v.start) === 'box-shadow') continue;
    const text = css.slice(v.start, v.end);
    for (const m of text.matchAll(RGBA_RE)) {
      const at = v.start + m.index;
      if (!inSkips(at, v.skips)) out.push({ start: at, end: at + m[0].length, raw: m[0] });
    }
  }
  return out;
}
// var(--wxa-…) tylko w wartościach deklaracji innych niż box-shadow.
export function misplacedAlphaUses(css) {
  const ok = new Set();
  for (const v of scanDeclarationValues(css)) {
    if (propertyBefore(css, v.start) === 'box-shadow') continue;
    const text = css.slice(v.start, v.end);
    for (const m of text.matchAll(ALPHA_VAR_RE)) if (!inSkips(v.start + m.index, v.skips)) ok.add(v.start + m.index);
  }
  return [...css.matchAll(ALPHA_VAR_RE)].filter((m) => !ok.has(m.index)).map((m) => ({ at: m.index, token: m[1], line: css.slice(0, m.index).split('\n').length }));
}
export function readAlpha(cssText) {
  const block = cssText.match(/:root\s*\{([\s\S]*?)\}/);
  const out = {};
  if (block) for (const m of block[1].matchAll(/(--wxa-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
export function resolveAlpha(css, alpha) {
  return css.replace(ALPHA_VAR_RE, (w, name) => { if (!(name in alpha)) throw new Error(`Nieznany kolor ${name}`); return alpha[name]; });
}
export function restoreAlpha(css, raws = []) {
  let i = 0;
  return css.replace(ALPHA_VAR_RE, () => { if (i >= raws.length) throw new Error('Więcej kolorów rgba niż w zapisie pierwotnym'); return raws[i++]; });
}

const STATE_RE = /:(hover|active|focus|focus-visible|focus-within|checked|disabled)\b|\.(active|isActive|selected|isSelected|is-active)\b/;
// Wartości użyte w stanach przycisków (i w ich stanie zwykłym) oraz kolory rgba zapisane dosłownie w testach.
export function alphaPins(files, valueAt) {
  const pins = new Set();
  for (const file of files) {
    const css = read(file);
    const rows = [...css.matchAll(ALPHA_VAR_RE)].map((m, i) => ({ sel: selectorAt(css, m.index), v: valueAt(file, i, m[1]) }));
    const bases = new Set(rows.filter((r) => STATE_RE.test(r.sel)).flatMap((r) => r.sel.split(',').map(baseSelector)));
    for (const r of rows) if (STATE_RE.test(r.sel) || r.sel.split(',').some((p) => bases.has(baseSelector(p)))) pins.add(r.v);
  }
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules|archive/.test(rel)) walk(rel); continue; }
      if (!/\.(c?m?js|json)$/.test(e.name) || /css-(token|color|palette|shadow|alpha)/.test(e.name)) continue;
      for (const m of read(rel).matchAll(RGBA_RE)) { try { pins.add(normalizeRgba(m[0])); } catch { /* pomiń */ } }
    }
  };
  ['scripts', 'tests'].forEach(walk);
  return pins;
}

function writeAlpha(alpha) {
  const lines = Object.entries(alpha).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `  ${k}: ${v};`);
  const header = `/* WAWIS — wspólne kolory półprzezroczyste (14.67+). Generowane przez scripts/css-alpha.mjs — nie edytuj ręcznie.
   14.67: każda zmienna ma dokładnie wartość koloru, który zastąpiła. Od 14.68 kolory o niewidocznej różnicy są
   połączone (scripts/css-alpha-merges.json, granica ALPHA_LIMITS w scripts/css-alpha.mjs).
   Ładowane statycznie przez src/main.jsx. */\n`;
  fs.writeFileSync(path.join(ROOT, ALPHA_FILE), `${header}:root {\n${lines.join('\n')}\n}\n`);
}
const registryFiles = () => Object.keys(JSON.parse(read(REGISTRY_FILE)).files);

function convert() {
  if (fs.existsSync(path.join(ROOT, ALPHA_BASELINE_FILE))) throw new Error('Kolory rgba już przekonwertowane');
  const alpha = {};
  const baseline = { version: JSON.parse(read('app-version.json')).version, files: {} };
  let total = 0;
  for (const file of registryFiles()) {
    const css = read(file);
    const uses = literalAlphaUses(css);
    if (!uses.length) continue;
    let out = ''; let last = 0;
    for (const u of uses) {
      const value = normalizeRgba(u.raw);
      const name = alphaNameFor(value);
      if (alpha[name] && alpha[name] !== value) throw new Error(`Kolizja nazwy ${name}`);
      alpha[name] = value;
      out += css.slice(last, u.start) + `var(${name})`;
      last = u.end;
    }
    out += css.slice(last);
    if (restoreAlpha(out, uses.map((u) => u.raw)) !== css) throw new Error(`${file}: odtworzenie ≠ oryginał`);
    fs.writeFileSync(path.join(ROOT, file), out);
    baseline.files[file] = uses.map((u) => u.raw);
    total += uses.length;
  }
  writeAlpha(alpha);
  fs.writeFileSync(path.join(ROOT, ALPHA_BASELINE_FILE), `${JSON.stringify(baseline, null, 1)}\n`);
  console.log(`Kolory półprzezroczyste: ${total} miejsc → ${Object.keys(alpha).length} zmiennych`);
}

function state() {
  const alpha = readAlpha(read(ALPHA_FILE));
  const baseline = JSON.parse(read(ALPHA_BASELINE_FILE)).files;
  const usage = new Map(); const groups = new Map();
  for (const [file, raws] of Object.entries(baseline)) {
    const names = [...readStyleSource(file).matchAll(ALPHA_VAR_RE)].map((m) => m[1]);
    if (names.length !== raws.length) throw new Error(`${file}: liczba kolorów rgba ≠ zapis pierwotny`);
    names.forEach((nm, i) => {
      const v = alpha[nm];
      usage.set(v, (usage.get(v) || 0) + 1);
      if (!groups.has(v)) groups.set(v, new Set());
      groups.get(v).add(normalizeRgba(raws[i]));
    });
  }
  return { alpha, baseline, usage, groups };
}

function plan() {
  const { alpha, baseline, usage, groups } = state();
  const pins = alphaPins(Object.keys(baseline), (f, i, nm) => alpha[nm]);
  const order = [...groups.keys()].sort((a, b) => (pins.has(b) - pins.has(a)) || usage.get(b) - usage.get(a) || a.localeCompare(b));
  const centers = []; const target = new Map();
  for (const v of order) {
    let best = null;
    if (!pins.has(v)) {
      for (const c of centers) {
        const ds = [...groups.get(v)].map((o) => alphaDistance(o, c));
        if (!ds.every(alphaWithinLimits)) continue;
        const score = Math.max(...ds.map((d) => d.de2000));
        if (!best || score < best.score) best = { c, score };
      }
    }
    if (best) target.set(v, best.c); else { centers.push(v); target.set(v, v); }
  }
  return { target, centers, groups, pins };
}

function apply() {
  // 14.82: arkusze używają ról (--wr-*, src/styles/roles.css) — łączenie zapisałoby zmienne rgba wprost i zniszczyło role.
  throw new Error('Od 14.82 łączenie kolorów półprzezroczystych w arkuszach z rolami jest wyłączone');
  const { alpha, baseline } = state();
  const { target, centers } = plan();
  const merges = { note: 'Kolor pierwotny (14.67, postać kanoniczna) → kolor po łączeniu.', limits: ALPHA_LIMITS, backdrops: ALPHA_BACKDROPS, steps: [], map: {} };
  const next = {}; let changed = 0;
  for (const [file, raws] of Object.entries(baseline)) {
    let i = 0;
    const out = read(file).replace(ALPHA_VAR_RE, (w, nm) => {
      const to = target.get(alpha[nm]);
      const orig = normalizeRgba(raws[i]); i += 1;
      next[alphaNameFor(to)] = to;
      if (to !== orig) {
        const d = alphaDistance(orig, to);
        merges.map[orig] = { to, de2000: Math.floor(d.de2000 * 1000) / 1000, dalpha: d.dalpha };
        changed += 1;
      }
      return `var(${alphaNameFor(to)})`;
    });
    fs.writeFileSync(path.join(ROOT, file), out);
  }
  merges.steps.push({ version: JSON.parse(read('app-version.json')).version, colors_before: Object.keys(alpha).length, colors_after: centers.length, changed_uses: changed });
  merges.map = Object.fromEntries(Object.entries(merges.map).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(ROOT, ALPHA_MERGES_FILE), `${JSON.stringify(merges, null, 2)}\n`);
  writeAlpha(next);
  console.log(`Kolory półprzezroczyste: ${Object.keys(alpha).length} → ${Object.keys(next).length}, zmienionych miejsc: ${changed}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === 'convert') convert();
  else if (cmd === 'plan') { const p = plan(); console.log(`Kolory półprzezroczyste: ${p.groups.size} → ${p.centers.length} (bez łączenia: ${p.pins.size})`); }
  else if (cmd === 'apply') apply();
  else if (cmd === 'report') {
    const { alpha, baseline } = state();
    const rows = [];
    for (const [file, raws] of Object.entries(baseline)) {
      const css = readStyleSource(file);
      [...css.matchAll(ALPHA_VAR_RE)].forEach((m, i) => {
        const orig = normalizeRgba(raws[i]); const now = alpha[m[1]];
        if (orig !== now) rows.push({ file, selector: selectorAt(css, m.index), from: orig, to: now });
      });
    }
    console.log(JSON.stringify(rows));
  } else { console.error('Użycie: convert | plan | apply | report'); process.exit(2); }
}
