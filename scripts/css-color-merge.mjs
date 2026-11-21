// WAWIS 14.61+ — łączenie bardzo podobnych odcieni w palecie (decyzja właściciela 21.11.2026:
// „pierwszy i drugi próg”). Różnicę mierzymy ΔE2000 (CIE, standard druku i grafiki):
//   < 1 — niewidoczna gołym okiem; < 2 — widoczna tylko przy porównaniu obok siebie.
// Zasada bezpieczeństwa: każdy kolor porównujemy z jego PIERWOTNYM odcieniem z 14.60
// (scripts/css-palette-baseline.json), więc kolejne etapy nie sumują różnic.
// Kolory użyte dosłownie w testach i kolory z nazwą (white, slate-500, …) mają pierwszeństwo jako „środki”.
//
// Użycie:
//   node scripts/css-color-merge.mjs baseline            — zapis pierwotnych kolorów (raz, przed pierwszym łączeniem)
//   node scripts/css-color-merge.mjs plan <próg>         — podgląd: ile kolorów odpadnie
//   node scripts/css-color-merge.mjs apply <próg>        — łączenie: pliki CSS, tokens.css, css-color-merges.json
//   node scripts/css-color-merge.mjs report              — lista zmienionych miejsc (plik → selektor → kolor)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASELINE_FILE, MERGED_NOTE, MERGES_FILE, REGISTRY_FILE, TOKENS_FILE, canonicalHex, readTokens, tokenNameFor,
  tokenSequence, writeTokens,
} from './css-tokens.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

// --- ΔE2000 ---
function toLab(hex) {
  const h = canonicalHex(hex).slice(1, 7);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
export function deltaE2000(hexA, hexB) {
  const [L1, a1, b1] = toLab(hexA);
  const [L2, a2, b2] = toLab(hexB);
  const C1 = Math.hypot(a1, b1); const C2 = Math.hypot(a2, b2); const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G); const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1); const C2p = Math.hypot(a2p, b2);
  const h1 = (deg(Math.atan2(b1, a1p)) + 360) % 360; const h2 = (deg(Math.atan2(b2, a2p)) + 360) % 360;
  const dL = L2 - L1; const dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) dh = Math.abs(h2 - h1) <= 180 ? h2 - h1 : (h2 > h1 ? h2 - h1 - 360 : h2 - h1 + 360);
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2; const Cbp = (C1p + C2p) / 2;
  let hb = h1 + h2;
  if (C1p * C2p !== 0) hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2);
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp; const SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(rad(60 * Math.exp(-(((hb - 275) / 25) ** 2))));
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// Kolor z kanałem przezroczystości (#rrggbbaa) łączymy tylko z kolorem o tej samej przezroczystości.
const alphaOf = (hex) => (canonicalHex(hex).length === 9 ? canonicalHex(hex).slice(7) : 'ff');

// Kolory zapisane dosłownie w testach (hex i rgb()) — zostają bez zmian, żeby testy nadal sprawdzały to samo.
export function pinnedColors() {
  const pins = new Set();
  const dirs = ['scripts', 'tests'];
  const skip = /css-token|css-color-merge|css-palette/;
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules|archive/.test(rel)) walk(rel); continue; }
      if (!/\.(c?m?js|json)$/.test(e.name) || skip.test(e.name)) continue;
      const src = read(rel);
      for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) pins.add(canonicalHex(m[0]));
      for (const m of src.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*[,)]/g)) {
        pins.add(`#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`);
      }
    }
  };
  dirs.forEach(walk);
  return pins;
}

function currentState() {
  const tokens = readTokens(read(TOKENS_FILE));
  const registry = readJson(REGISTRY_FILE).files;
  const baseline = readJson(BASELINE_FILE).files;
  const usage = new Map();
  const groups = new Map(); // obecny kolor → zbiór pierwotnych kolorów, które dziś go używają
  for (const file of Object.keys(registry)) {
    const now = tokenSequence(read(file), tokens);
    const orig = baseline[file];
    if (!orig || orig.length !== now.length) throw new Error(`${file}: brak lub niezgodny zapis pierwotnych kolorów`);
    now.forEach((hex, i) => {
      usage.set(hex, (usage.get(hex) || 0) + 1);
      if (!groups.has(hex)) groups.set(hex, new Set());
      groups.get(hex).add(orig[i]);
    });
  }
  return { tokens, registry, baseline, usage, groups };
}

function plan(threshold) {
  const { usage, groups } = currentState();
  const pins = pinnedColors();
  const named = (hex) => !tokenNameFor(hex).startsWith('--wx-c-');
  const order = [...groups.keys()].sort((a, b) => (pins.has(b) - pins.has(a)) || (named(b) - named(a))
    || (usage.get(b) - usage.get(a)) || a.localeCompare(b));
  const centers = [];
  const target = new Map();
  for (const hex of order) {
    let best = null;
    if (!pins.has(hex)) {
      for (const c of centers) {
        if (alphaOf(c) !== alphaOf(hex)) continue;
        const worst = Math.max(...[...groups.get(hex)].map((o) => deltaE2000(o, c)));
        if (worst < threshold && (!best || worst < best.worst)) best = { c, worst };
      }
    }
    if (best) target.set(hex, best.c);
    else { centers.push(hex); target.set(hex, hex); }
  }
  // Środek, do którego coś dołączyło, sam nie może już przejść dalej — mapowanie jest jednokrokowe.
  return { target, centers, usage, groups, pins };
}

function apply(threshold, version) {
  const state = currentState();
  const { target, centers } = plan(threshold);
  const { tokens, registry, baseline } = state;
  const mergesPath = path.join(ROOT, MERGES_FILE);
  const merges = fs.existsSync(mergesPath) ? readJson(MERGES_FILE) : {
    note: 'Pierwotny kolor (14.60) → kolor po łączeniu. de2000 = różnica względem pierwotnego koloru.',
    baseline_version: '14.60', limit_de2000: 0, steps: [], map: {},
  };
  let changedUses = 0;
  const newTokens = {};
  for (const file of Object.keys(registry)) {
    const css = read(file);
    let i = 0;
    const out = css.replace(/var\((--wx-[a-z0-9-]+)\)/g, (whole, name) => {
      const now = tokens[name];
      const next = target.get(now);
      const orig = baseline[file][i];
      i += 1;
      newTokens[tokenNameFor(next)] = next;
      if (next !== now) changedUses += 1;
      if (next !== orig) merges.map[orig] = { to: next, de2000: Math.floor(deltaE2000(orig, next) * 1000) / 1000 };
      else delete merges.map[orig];
      return `var(${tokenNameFor(next)})`;
    });
    fs.writeFileSync(path.join(ROOT, file), out);
  }
  merges.limit_de2000 = Math.max(merges.limit_de2000, threshold);
  merges.steps.push({ version, threshold_de2000: threshold, colors_before: Object.keys(tokens).length, colors_after: centers.length, changed_uses: changedUses });
  merges.map = Object.fromEntries(Object.entries(merges.map).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(mergesPath, `${JSON.stringify(merges, null, 2)}\n`);
  writeTokens(newTokens, MERGED_NOTE);
  console.log(`ΔE2000 < ${threshold}: ${Object.keys(tokens).length} → ${Object.keys(newTokens).length} kolorów, zmienionych miejsc: ${changedUses}`);
}

function baselineCmd() {
  const tokens = readTokens(read(TOKENS_FILE));
  const registry = readJson(REGISTRY_FILE).files;
  if (fs.existsSync(path.join(ROOT, BASELINE_FILE))) throw new Error('Zapis pierwotnych kolorów już istnieje');
  const files = {};
  for (const file of Object.keys(registry)) files[file] = tokenSequence(read(file), tokens);
  fs.writeFileSync(path.join(ROOT, BASELINE_FILE), `${JSON.stringify({ version: '14.60', files })}\n`);
  console.log(`Zapisano pierwotne kolory: ${Object.keys(files).length} plików`);
}

// Lista zmienionych miejsc: plik → selektor → pierwotny kolor → nowy.
export function changedPlaces() {
  const tokens = readTokens(read(TOKENS_FILE));
  const registry = readJson(REGISTRY_FILE).files;
  const baseline = readJson(BASELINE_FILE).files;
  const out = [];
  for (const file of Object.keys(registry)) {
    const css = read(file);
    let i = 0;
    for (const m of css.matchAll(/var\((--wx-[a-z0-9-]+)\)/g)) {
      const orig = baseline[file][i]; i += 1;
      const now = tokens[m[1]];
      if (orig === now) continue;
      const before = css.slice(0, m.index);
      const open = before.lastIndexOf('{');
      const selStart = Math.max(before.lastIndexOf('}', open), before.lastIndexOf(';', open)) + 1;
      const selector = before.slice(selStart, open).replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
      const prop = before.slice(Math.max(before.lastIndexOf(';'), open) + 1).split(':')[0].trim();
      out.push({ file, selector, prop, from: orig, to: now, de2000: deltaE2000(orig, now) });
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2);
  const version = readJson('app-version.json').version;
  if (cmd === 'baseline') baselineCmd();
  else if (cmd === 'plan') { const p = plan(Number(arg)); console.log(`ΔE2000 < ${arg}: ${p.groups.size} → ${p.centers.length} kolorów (zablokowanych przez testy: ${[...p.pins].filter((h) => p.groups.has(h)).length})`); }
  else if (cmd === 'apply') apply(Number(arg), version);
  else if (cmd === 'report') {
    const rows = changedPlaces();
    console.log(JSON.stringify(rows));
  } else { console.error('Użycie: baseline | plan <próg> | apply <próg> | report'); process.exit(2); }
}
