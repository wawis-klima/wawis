// WAWIS 14.84 — motyw ciemny „Grafit z czerwienią” (decyzja właściciela 22.11.2026, propozycja nr 8).
//
// Motyw jasny = role z src/styles/roles.css (bez zmian). Motyw ciemny nadpisuje te same role w
// src/styles/theme-dark.css, wyłącznie pod :root[data-theme="dark"], więc bez przełącznika nic się nie zmienia.
// Ciemny kolor każdej roli liczony jest z jasnego koloru i rodzaju roli (tło / tekst / ramka / ikona / cień):
//   • tła: biel → grafit karty, prawie biel → ciemniejszy grafit (tło strony), szarości → podniesione powierzchnie,
//     delikatne zabarwienia (np. jasnoniebieskie) → ciemne zabarwienie tego samego odcienia, pełne kolory zostają;
//   • tekst: ciemny tekst → jasny, szary → jasnoszary, kolorowy → jaśniejsza wersja tego samego odcienia;
//     każdy tekst czytelny (kontrast ≥ 4,5:1) na karcie, tle strony i podniesionej powierzchni;
//   • ramki: jasne → ciemnoszare, zabarwione → przygaszone tego samego odcienia.
// Akcent czerwony (propozycja „Grafit z czerwienią”): przycisk „+”, przełącznik motywu, aktywna karta, inicjały.
//
// Użycie: node scripts/css-dark-theme.mjs write   (generuje src/styles/theme-dark.css)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES_FILE, TOKENS_FILE, readRoles, readTokens } from './css-tokens.mjs';
import { ALPHA_FILE, readAlpha } from './css-alpha.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DARK_FILE = 'src/styles/theme-dark.css';
export const DARK = Object.freeze({
  page: '#0c0c0d', card: '#18181a', raised: '#232326', raised2: '#2c2c30', text: '#f4f4f5',
  accent: '#dc2626', accentSoft: '#2a1718', accentLine: '#7f2a2a', accentText: '#fca5a5',
});

// --- kolory ---
export const hexToRgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
export const rgbToHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
export const mix = (a, b, t) => { const A = hexToRgb(a); const B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); };
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const chroma = (s, l) => s * (1 - Math.abs(2 * l - 1));
export function parseRgba(text) {
  const m = String(text).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  return m ? { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null;
}
const rgba = (rgb, a) => `rgba(${rgb.map((v) => Math.round(v)).join(',')},${Number(a.toFixed(3))})`;

// Rozjaśnia (lub przyciemnia) kolor tekstu, aż będzie czytelny na wszystkich podanych tłach.
function readableOn(color, backgrounds, min = 4.6) {
  let [h, s, l] = rgbToHsl(hexToRgb(color));
  let c = color;
  for (let i = 0; i < 60 && backgrounds.some((bg) => contrast(c, bg) < min); i += 1) {
    l = Math.min(0.98, l + 0.01);
    c = hslToHex(h, s, l);
  }
  return c;
}

// Ciemny kolor dla roli rodzaju `kind` o jasnym kolorze `value` (#rrggbb albo rgba(…)).
export function darkFor(kind, value) {
  const alpha = parseRgba(value);
  if (alpha) {
    const [, , l] = rgbToHsl(alpha.rgb);
    const [h, s] = rgbToHsl(alpha.rgb);
    if (chroma(s, l) >= 0.25) return value; // kolorowe obwódki zaznaczenia (np. niebieska poświata) — bez zmian
    if (l > 0.6) {
      // półprzezroczysta biel: nakładka nagłówka / szkło → grafit karty; jako ramka → delikatna jasna linia
      return kind === 'line' ? rgba([255, 255, 255], Math.min(0.16, alpha.a * 0.2)) : rgba(hexToRgb(DARK.card), alpha.a);
    }
    // ciemna półprzezroczystość: zaciemnienie pod oknem zostaje ciemne; delikatne cienie / ramki → jasne na ciemnym
    if (kind === 'bg' && alpha.a >= 0.3) return rgba([0, 0, 0], Math.min(0.85, alpha.a + 0.15));
    return rgba([255, 255, 255], Math.min(0.14, alpha.a * 1.2));
  }
  const [h, s, l] = rgbToHsl(hexToRgb(value));
  const c = chroma(s, l);
  // Zabarwiony = wyraźny odcień (np. jasnoniebieski, jasnozielony); niebieskawe szarości WAWIS (#dbe6f2) to neutralne.
  const tinted = (c >= 0.12 && s >= 0.35) || (s >= 0.7 && l <= 0.975);
  // Granat WAWIS (#10203a, #143761, #203252…) to kolor zwykłego tekstu, nie akcent.
  const navyText = l < 0.3 && h >= 200 && h <= 235;
  if (kind === 'bg') {
    if (!tinted && l >= 0.965) return mix(DARK.card, '#101012', Math.min(1, (1 - l) / 0.035));
    if (!tinted && l >= 0.6) return mix(DARK.raised, '#3f3f46', Math.min(1, (0.965 - l) / 0.365));
    if (tinted && l > 0.72) return hslToHex(h, Math.min(s, 0.5), 0.15 + (l > 0.93 ? 0 : 0.03));
    if (l < 0.3 && (navyText || s < 0.35)) return mix(DARK.raised2, hslToHex(h, s, 0.25), 0.25);
    if (!tinted) return mix('#3f3f46', '#71717a', Math.min(1, (l - 0.3) / 0.3));
    return value; // pełny kolor (przyciski, plakietki) — bez zmian
  }
  if (kind === 'text' || kind === 'icon' || kind === 'accent') {
    const surfaces = [DARK.card, DARK.page, DARK.raised];
    if (navyText || (l < 0.3 && !tinted)) return readableOn(hslToHex(h, Math.min(s, 0.03), Math.min(0.96, 0.96 - l * 0.3)), surfaces);
    if (l > 0.85 && !tinted) return value; // biały tekst na kolorowych przyciskach
    if (!tinted) return readableOn(hslToHex(h, Math.min(s, 0.03), l < 0.62 ? 0.62 + (0.62 - l) * 0.5 : 0.58), surfaces);
    const tintBg = hslToHex(h, Math.min(s, 0.5), 0.15);
    return readableOn(hslToHex(h, Math.min(1, s), Math.max(l, 0.72)), [...surfaces, tintBg]);
  }
  if (kind === 'line') {
    if (l < 0.3 && (navyText || !tinted)) return '#5a5a63';
    if (!tinted && l >= 0.75) return mix('#2a2a2e', '#4a4a52', Math.min(1, (0.97 - l) / 0.22));
    if (tinted && l >= 0.7) return hslToHex(h, Math.min(s, 0.45), 0.3);
    if (!tinted) return '#5a5a63';
    return value;
  }
  if (kind === 'shadow') {
    if (!tinted && l > 0.85) return DARK.card; // jasna obwódka w cieniu = kolor karty
    if (tinted && l > 0.7) return hslToHex(h, Math.min(s, 0.45), 0.3);
    if (!tinted) return '#000000';
    return value;
  }
  return value;
}

export function lightRoleColors() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const tokens = readTokens(read(TOKENS_FILE));
  const alpha = readAlpha(read(ALPHA_FILE));
  const roles = readRoles(read(ROLES_FILE));
  return Object.fromEntries(Object.entries(roles).map(([role, palette]) => [role, palette.startsWith('--wxa-') ? alpha[palette] : tokens[palette]]));
}

export const roleKind = (role) => role.slice('--wr-'.length).split('-')[0];

export function darkRoleColors() {
  return Object.fromEntries(Object.entries(lightRoleColors()).map(([role, value]) => [role, darkFor(roleKind(role), value)]));
}

// Akcent „Grafit z czerwienią” i miejsca z kolorem zapisanym wprost (poza rolami) — tylko w motywie ciemnym.
export const DARK_OVERRIDES = Object.freeze([
  ['.mobileActionBtn.primary.wawisOneLineAction', `background:${DARK.accent} !important;border-color:${DARK.accent} !important;color:#ffffff !important`],
  ['.wawisThemeToggle', `background:${DARK.accentSoft} !important;border-color:${DARK.accentLine} !important;color:${DARK.accentText} !important`],
  ['.wawisUserInitialsBadge', `background:${DARK.accentSoft} !important;border-color:${DARK.accentLine} !important;color:${DARK.accentText} !important`],
  ['.mobileJobCard.activeMobileJobCard', `background:${DARK.accentSoft} !important;border-color:${DARK.accentLine} !important`],
  // Jasne pełne tło z ciemnym napisem (żółta plakietka próby szczelności) — napis zostaje ciemny.
  ['.protocolTestBadge', 'color:#111827 !important'],
  // v1103-completed-note-compact.css: jedyny kolor zapisany wprost w arkuszu (#10203a) — tekst notatki zakończonego montażu.
  ['.mobileInlineJobDetails .adminNoteToggle', `color:${DARK.text} !important`],
]);

export function renderDarkCss() {
  const dark = darkRoleColors();
  const lines = Object.entries(dark).sort(([a], [b]) => a.localeCompare(b)).map(([role, v]) => `  ${role}: ${v};`);
  const overrides = DARK_OVERRIDES.map(([sel, decl]) => `${sel.split(',').map((s) => `html[data-theme="dark"] ${s.trim()}`).join(',\n')} {\n  ${decl.split(';').join(';\n  ')};\n}`);
  return `/* WAWIS 14.84 — motyw ciemny „Grafit z czerwienią”. Generowane przez scripts/css-dark-theme.mjs — nie edytuj ręcznie.
   Działa tylko z atrybutem data-theme="dark" na <html> (przełącznik w nagłówku telefonu). Motyw jasny bez zmian. */
:root[data-theme="dark"] {
  color-scheme: dark;
${lines.join('\n')}
}
${overrides.join('\n')}
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'write') { console.error('Użycie: node scripts/css-dark-theme.mjs write'); process.exit(2); }
  fs.writeFileSync(path.join(ROOT, DARK_FILE), renderDarkCss());
  console.log(`${DARK_FILE}: ${Object.keys(darkRoleColors()).length} ról`);
}
