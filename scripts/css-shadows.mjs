// WAWIS 14.64+ — wspólne cienie (box-shadow) jako zmienne CSS (decyzja właściciela 21.11.2026: „skończmy to”).
//
// 14.64: każdy cień zapisany wprost (np. `0 10px 24px rgba(15,35,69,.06)`) w przekonwertowanych plikach zastępujemy
//        zmienną --wxs-… o DOKŁADNIE tej samej wartości (src/styles/shadows.css) — wygląd bez zmian.
//        Pierwotny tekst każdego cienia jest zapisany pozycja po pozycji w scripts/css-shadow-baseline.json.
// 14.65: łączenie cieni różniących się kosmetycznie (kryterium SHADOW_LIMITS, liczone od cienia pierwotnego).
// Cienie z kolorem ze zmiennej, `none` i `currentColor` zostają bez zmian (nie są częścią tej palety).
//
// Użycie: node scripts/css-shadows.mjs convert | plan | apply | report
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { REGISTRY_FILE, scanDeclarationValues } from './css-tokens.mjs';
import { deltaE2000 } from './css-color-merge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHADOWS_FILE = 'src/styles/shadows.css';
export const SHADOW_BASELINE_FILE = 'scripts/css-shadow-baseline.json';
export const SHADOW_MERGES_FILE = 'scripts/css-shadow-merges.json';
export const SHADOW_VAR_RE = /var\((--wxs-[a-z0-9-]+)\)/g;
// Granica „kosmetycznej” różnicy względem cienia pierwotnego (14.65). Inny kształt cienia = brak łączenia.
export const SHADOW_LIMITS = Object.freeze({ dy: 2, dblur: 6, dalpha: 0.02, de2000: 3 });

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const num = (s) => {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Liczba? ${s}`);
  return String(n).replace(/^0\./, '.').replace(/^-0\./, '-.');
};

// Postać kanoniczna: te same piksele = ten sam tekst (spacje, 0.22 → .22, .10 → .1, rgb → rgba(…,1)).
export function normalizeShadow(value) {
  let v = String(value).trim().replace(/\s+/g, ' ').toLowerCase();
  v = v.replace(/rgba?\(\s*([^)]*)\)/g, (whole, inner) => {
    const parts = inner.split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) throw new Error(`Kolor? ${whole}`);
    const [r, g, b, a = '1'] = parts;
    const alpha = a.endsWith('%') ? Number(a.slice(0, -1)) / 100 : Number(a);
    return `rgba(${[r, g, b].map(num).join(',')},${num(alpha)})`;
  });
  v = v.replace(/(^|[\s(,])(-?\d*\.?\d+)(px)?(?=[\s,)]|$)/g, (whole, pre, n, unit) => `${pre}${num(n)}${unit || ''}`);
  v = v.replace(/(^|[\s,])-?\.?0+px(?=[\s,]|$)/g, '$10').replace(/(^|[\s,])\.?0(?=[\s,]|$)/g, '$10');
  return v.replace(/\s*,\s*(?![^(]*\))/g, ', ');
}

// Warstwy cienia: { inset, x, y, blur, spread, rgb:[r,g,b], a }.
export function parseShadow(value) {
  const layers = [];
  for (const raw of normalizeShadow(value).split(/,\s(?![^(]*\))/)) {
    const color = raw.match(/rgba\(([^)]*)\)/);
    if (!color) throw new Error(`Cień bez koloru rgba: ${value}`);
    const [r, g, b, a] = color[1].split(',').map(Number);
    const rest = raw.replace(color[0], ' ').trim().split(/\s+/);
    const inset = rest.includes('inset');
    const lengths = rest.filter((t) => t !== 'inset').map((t) => Number(t.replace(/px$/, '')));
    if (lengths.length < 2 || lengths.length > 4 || lengths.some((n) => !Number.isFinite(n))) throw new Error(`Cień? ${value}`);
    const [x, y, blur = 0, spread = 0] = lengths;
    layers.push({ inset, x, y, blur, spread, rgb: [r, g, b], a });
  }
  return layers;
}

const hex = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

// Czy cień `next` mieści się w granicy kosmetycznej względem pierwotnego `orig`? Zwraca największe różnice albo null.
export function shadowDistance(orig, next) {
  const A = parseShadow(orig);
  const B = parseShadow(next);
  if (A.length !== B.length) return null;
  const d = { dy: 0, dblur: 0, dalpha: 0, de2000: 0 };
  for (let i = 0; i < A.length; i += 1) {
    const a = A[i]; const b = B[i];
    if (a.inset !== b.inset || a.x !== b.x || a.spread !== b.spread) return null;
    if (Math.sign(a.y) !== Math.sign(b.y)) return null;
    d.dy = Math.max(d.dy, Math.abs(a.y - b.y));
    d.dblur = Math.max(d.dblur, Math.abs(a.blur - b.blur));
    d.dalpha = Math.max(d.dalpha, Math.abs(a.a - b.a));
    d.de2000 = Math.max(d.de2000, deltaE2000(hex(a.rgb), hex(b.rgb)));
  }
  d.dalpha = Math.round(d.dalpha * 1e6) / 1e6;
  return d;
}

export function withinLimits(d) {
  return !!d && d.dy <= SHADOW_LIMITS.dy && d.dblur <= SHADOW_LIMITS.dblur
    && d.dalpha <= SHADOW_LIMITS.dalpha + 1e-9 && d.de2000 < SHADOW_LIMITS.de2000;
}

export function shadowNameFor(value) {
  const L = parseShadow(value)[0];
  const tag = `${L.inset ? 'i' : ''}${L.y}-${L.blur}`.replace(/\./g, 'p').replace(/-(?=-)/g, '').replace(/^-/, 'm');
  const h = crypto.createHash('sha256').update(normalizeShadow(value)).digest('hex').slice(0, 4);
  return `--wxs-${tag.replace(/[^a-z0-9-]/g, 'm')}-${h}`;
}

function propertyBefore(css, start) {
  let p = start - 2;
  while (p >= 0 && !/[;{}]/.test(css[p])) p -= 1;
  return css.slice(p + 1, start - 1).trim().toLowerCase();
}

// Deklaracje box-shadow z cieniem zapisanym wprost (kolor rgba, bez zmiennych) — do konwersji.
export function literalShadowDeclarations(css) {
  const out = [];
  for (const v of scanDeclarationValues(css)) {
    if (propertyBefore(css, v.start) !== 'box-shadow') continue;
    const text = css.slice(v.start, v.end);
    const m = text.match(/^(\s*)([\s\S]*?)(\s*!\s*important)?(\s*)$/i);
    const core = m[2];
    if (!core || /var\(|currentcolor|^none$|inherit|initial|unset/i.test(core) || !/rgba?\(/i.test(core)) continue;
    out.push({ start: v.start + m[1].length, end: v.start + m[1].length + core.length, raw: core });
  }
  return out;
}

// Każde var(--wxs-…) musi być całą wartością deklaracji box-shadow (ewentualnie z !important).
export function misplacedShadowUses(css) {
  const ok = new Set();
  for (const v of scanDeclarationValues(css)) {
    if (propertyBefore(css, v.start) !== 'box-shadow') continue;
    const text = css.slice(v.start, v.end);
    const m = text.match(/^\s*var\((--wxs-[a-z0-9-]+)\)\s*(!\s*important)?\s*$/i);
    if (m) ok.add(v.start + text.indexOf('var('));
  }
  return [...css.matchAll(SHADOW_VAR_RE)].filter((m) => !ok.has(m.index)).map((m) => ({ at: m.index, token: m[1], line: css.slice(0, m.index).split('\n').length }));
}

export function readShadows(cssText) {
  const block = cssText.match(/:root\s*\{([\s\S]*?)\}/);
  const out = {};
  if (!block) return out;
  for (const m of block[1].matchAll(/(--wxs-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

export function resolveShadows(css, shadows) {
  return css.replace(SHADOW_VAR_RE, (whole, name) => {
    if (!(name in shadows)) throw new Error(`Nieznany cień ${name}`);
    return shadows[name];
  });
}

export function restoreShadows(css, rawList = []) {
  let i = 0;
  return css.replace(SHADOW_VAR_RE, () => {
    if (i >= rawList.length) throw new Error('Więcej cieni niż w zapisie pierwotnym');
    return rawList[i++];
  });
}

function writeShadows(shadows) {
  const lines = Object.entries(shadows).sort(([a], [b]) => a.localeCompare(b)).map(([n, v]) => `  ${n}: ${v};`);
  const header = `/* WAWIS — wspólne cienie (14.64+). Generowane przez scripts/css-shadows.mjs — nie edytuj ręcznie.
   14.64: każda zmienna ma dokładnie wartość cienia, który zastąpiła. Od 14.65 cienie różniące się kosmetycznie
   są połączone (scripts/css-shadow-merges.json, granica w scripts/css-shadows.mjs → SHADOW_LIMITS).
   Ładowane statycznie przez src/main.jsx. */\n`;
  fs.writeFileSync(path.join(ROOT, SHADOWS_FILE), `${header}:root {\n${lines.join('\n')}\n}\n`);
}

function registryFiles() { return Object.keys(JSON.parse(read(REGISTRY_FILE)).files); }

function convert() {
  if (fs.existsSync(path.join(ROOT, SHADOW_BASELINE_FILE))) throw new Error('Cienie już przekonwertowane');
  const shadows = {};
  const baseline = { version: JSON.parse(read('app-version.json')).version, files: {} };
  let total = 0;
  for (const file of registryFiles()) {
    const css = read(file);
    const decls = literalShadowDeclarations(css);
    if (!decls.length) continue;
    let out = '';
    let last = 0;
    for (const d of decls) {
      const value = normalizeShadow(d.raw);
      const name = shadowNameFor(value);
      if (shadows[name] && shadows[name] !== value) throw new Error(`Kolizja nazwy ${name}`);
      shadows[name] = value;
      out += css.slice(last, d.start) + `var(${name})`;
      last = d.end;
    }
    out += css.slice(last);
    if (restoreShadows(out, decls.map((d) => d.raw)) !== css) throw new Error(`${file}: odtworzenie ≠ oryginał`);
    fs.writeFileSync(path.join(ROOT, file), out);
    baseline.files[file] = decls.map((d) => d.raw);
    total += decls.length;
  }
  writeShadows(shadows);
  fs.writeFileSync(path.join(ROOT, SHADOW_BASELINE_FILE), `${JSON.stringify(baseline, null, 1)}\n`);
  console.log(`Cienie: ${total} miejsc → ${Object.keys(shadows).length} zmiennych`);
}

function state() {
  const shadows = readShadows(read(SHADOWS_FILE));
  const baseline = JSON.parse(read(SHADOW_BASELINE_FILE)).files;
  const usage = new Map();
  const groups = new Map();
  for (const [file, raws] of Object.entries(baseline)) {
    const names = [...read(file).matchAll(SHADOW_VAR_RE)].map((m) => m[1]);
    if (names.length !== raws.length) throw new Error(`${file}: liczba cieni ≠ zapis pierwotny`);
    names.forEach((n, i) => {
      const v = shadows[n];
      usage.set(v, (usage.get(v) || 0) + 1);
      if (!groups.has(v)) groups.set(v, new Set());
      groups.get(v).add(normalizeShadow(raws[i]));
    });
  }
  return { shadows, baseline, usage, groups };
}

function plan() {
  const { usage, groups } = state();
  const order = [...groups.keys()].sort((a, b) => usage.get(b) - usage.get(a) || a.localeCompare(b));
  const centers = [];
  const target = new Map();
  for (const v of order) {
    let best = null;
    for (const c of centers) {
      const ds = [...groups.get(v)].map((o) => shadowDistance(o, c));
      if (!ds.every(withinLimits)) continue;
      const score = Math.max(...ds.map((d) => d.dblur + d.dy * 2 + d.dalpha * 100));
      if (!best || score < best.score) best = { c, score };
    }
    if (best) target.set(v, best.c); else { centers.push(v); target.set(v, v); }
  }
  return { target, centers, usage, groups };
}

function apply() {
  const { shadows, baseline } = state();
  const { target, centers } = plan();
  const version = JSON.parse(read('app-version.json')).version;
  const merges = { note: 'Cień pierwotny (14.64, postać kanoniczna) → cień po łączeniu.', limits: SHADOW_LIMITS, steps: [], map: {} };
  const next = {};
  let changed = 0;
  for (const [file, raws] of Object.entries(baseline)) {
    let i = 0;
    const out = read(file).replace(SHADOW_VAR_RE, (whole, name) => {
      const now = shadows[name];
      const to = target.get(now);
      const orig = normalizeShadow(raws[i]); i += 1;
      const toName = shadowNameFor(to);
      next[toName] = to;
      if (to !== orig) { merges.map[orig] = { to, ...shadowDistance(orig, to) }; changed += 1; }
      return `var(${toName})`;
    });
    fs.writeFileSync(path.join(ROOT, file), out);
  }
  merges.steps.push({ version, shadows_before: Object.keys(shadows).length, shadows_after: centers.length, changed_uses: changed });
  merges.map = Object.fromEntries(Object.entries(merges.map).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(ROOT, SHADOW_MERGES_FILE), `${JSON.stringify(merges, null, 2)}\n`);
  writeShadows(next);
  console.log(`Cienie: ${Object.keys(shadows).length} → ${Object.keys(next).length}, zmienionych miejsc: ${changed}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === 'convert') convert();
  else if (cmd === 'plan') { const p = plan(); console.log(`Cienie: ${p.groups.size} → ${p.centers.length}`); }
  else if (cmd === 'apply') apply();
  else if (cmd === 'report') {
    const { shadows, baseline } = state();
    const rows = [];
    for (const [file, raws] of Object.entries(baseline)) {
      const css = read(file);
      [...css.matchAll(SHADOW_VAR_RE)].forEach((m, i) => {
        const orig = normalizeShadow(raws[i]); const now = shadows[m[1]];
        if (orig === now) return;
        const before = css.slice(0, m.index); const open = before.lastIndexOf('{');
        const sel = before.slice(Math.max(before.lastIndexOf('}', open), before.lastIndexOf(';', open)) + 1, open).trim().replace(/\s+/g, ' ');
        rows.push({ file, selector: sel, from: orig, to: now });
      });
    }
    console.log(JSON.stringify(rows));
  } else { console.error('Użycie: convert | plan | apply | report'); process.exit(2); }
}
