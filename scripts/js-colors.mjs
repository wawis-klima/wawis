// WAWIS 14.83 — kolory zapisane w kodzie JS (style w JS i style inline) → role kolorów (krok 3 do motywu ciemnego,
// decyzja właściciela 22.11.2026). Wygląd bez zmian: każdy kolor trafia do palety z DOKŁADNIE tą samą wartością
// (src/styles/tokens.css, src/styles/alpha.css), a w kodzie stoi var(--wr-<rodzaj>-<kolor>).
//
// Bez zmian (świadomie): kolory w cieniach (box-shadow — motyw ciemny nadpisze je osobno), kolory rysowania na płótnie
// (podpisy, zdjęcia, kody kreskowe — zawsze jasne tło i ciemny tusz), PDF protokołu, ekran awarii startu,
// okno „Łączenie z Fakturownią” oraz wykres w Centrum 360.
//
// Dowód (smoke-js-colors-v1483): po wstawieniu w miejsce każdego var(--wr-…) zapisanego pierwotnego tekstu koloru
// plik = oryginał (SHA-256), a każda rola daje w motywie jasnym dokładnie ten pierwotny kolor.
//
// Użycie: node scripts/js-colors.mjs convert
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOKENS_FILE, canonicalHex, readRolesFile, readTokens, roleKindFor, roleNameFor, scanDeclarationValues, sha256,
  tokenNameFor, writeRoles, writeTokens, MERGED_NOTE, propertyBefore,
} from './css-tokens.mjs';
import { ALPHA_FILE, alphaNameFor, normalizeRgba, readAlpha } from './css-alpha.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const JS_COLOR_BASELINE_FILE = 'scripts/js-color-baseline.json';
// mode css: plik z arkuszem w szablonie `…` (cały tekst szablonu to CSS); mode style: obiekty style={{ … }} / const x = { … }.
export const JS_COLOR_FILES = Object.freeze({
  'src/mobile791/components/mobile-device-table-v889.css.js': 'css',
  'src/mobile791/components/photo-sync-center.css.js': 'css',
  'src/mobile791/components/modals/ConfirmActionModal.jsx': 'style',
  'src/mobile791/components/devices/PendingDeviceDraftsBar.jsx': 'style',
  'src/mobile791/components/modals/JobFormModal.jsx': 'style',
});

const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])|rgba?\([^)]*\)/g;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Miejsca z kolorem: { start, end, raw, property } — tylko wartości, które mają rolę (bez cieni).
export function colorSites(source, mode) {
  const sites = [];
  if (mode === 'css') {
    const open = source.indexOf('`');
    const close = source.lastIndexOf('`');
    if (open < 0 || close <= open) throw new Error('brak szablonu z arkuszem');
    const css = source.slice(open + 1, close);
    for (const value of scanDeclarationValues(css)) {
      const property = propertyBefore(css, value.start).toLowerCase();
      if (/shadow/.test(property)) continue;
      const text = css.slice(value.start, value.end);
      for (const m of text.matchAll(COLOR_RE)) {
        const at = value.start + m.index;
        if (value.skips.some(([a, b]) => at >= a && at < b)) continue;
        sites.push({ start: open + 1 + at, end: open + 1 + at + m[0].length, raw: m[0], property });
      }
    }
  } else {
    // klucz: "wartość" | 'wartość' w obiekcie stylu (React), np. border: "1px solid #d8e0ec"
    for (const m of source.matchAll(/\b([a-zA-Z]+)\s*:\s*(["'])([^"'\n]*?)\2/g)) {
      const property = kebab(m[1]);
      if (/shadow/.test(property) || !roleKindFor(property)) continue;
      const valueStart = m.index + m[0].length - m[3].length - 1;
      for (const c of m[3].matchAll(COLOR_RE)) {
        sites.push({ start: valueStart + c.index, end: valueStart + c.index + c[0].length, raw: c[0], property });
      }
    }
  }
  return sites.sort((a, b) => a.start - b.start);
}

// Kolor pierwotny → zmienna palety o dokładnie tej wartości.
export function paletteRefFor(raw) {
  if (raw.startsWith('#')) return { name: tokenNameFor(raw), value: canonicalHex(raw), alpha: false };
  const value = normalizeRgba(raw);
  return { name: alphaNameFor(value), value, alpha: true };
}

function convert() {
  const tokens = readTokens(read(TOKENS_FILE));
  const alpha = readAlpha(read(ALPHA_FILE));
  const roles = readRolesFile();
  const baseline = { version: JSON.parse(read('app-version.json')).version, files: {} };
  for (const [rel, mode] of Object.entries(JS_COLOR_FILES)) {
    const original = read(rel);
    const sites = colorSites(original, mode);
    let out = original;
    for (const site of [...sites].reverse()) {
      const ref = paletteRefFor(site.raw);
      const table = ref.alpha ? alpha : tokens;
      if (table[ref.name] && table[ref.name] !== ref.value) throw new Error(`Kolizja nazwy ${ref.name}`);
      table[ref.name] = ref.value;
      const role = roleNameFor(roleKindFor(site.property), ref.name);
      if (roles[role] && roles[role] !== ref.name) throw new Error(`Kolizja roli ${role}`);
      roles[role] = ref.name;
      out = out.slice(0, site.start) + `var(${role})` + out.slice(site.end);
    }
    fs.writeFileSync(path.join(ROOT, rel), out);
    baseline.files[rel] = { mode, original_sha256: sha256(original), colors: sites.map((s) => s.raw) };
    console.log(`${rel}: ${sites.length} kolorów → role`);
  }
  writeTokens(tokens, MERGED_NOTE);
  writeAlphaFile(alpha);
  writeRoles(roles);
  fs.writeFileSync(path.join(ROOT, JS_COLOR_BASELINE_FILE), `${JSON.stringify(baseline, null, 2)}\n`);
}

// alpha.css: dopisanie nowych zmiennych z zachowaniem nagłówka i porządku alfabetycznego.
function writeAlphaFile(alpha) {
  const file = path.join(ROOT, ALPHA_FILE);
  const text = fs.readFileSync(file, 'utf8');
  const header = text.slice(0, text.indexOf(':root'));
  const lines = Object.entries(alpha).sort(([a], [b]) => a.localeCompare(b)).map(([n, v]) => `  ${n}: ${v};`);
  fs.writeFileSync(file, `${header}:root {\n${lines.join('\n')}\n}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'convert') { console.error('Użycie: node scripts/js-colors.mjs convert'); process.exit(2); }
  convert();
}
