// WAWIS 14.84 — motyw ciemny „Grafit z czerwienią” (decyzja właściciela 22.11.2026) i przełącznik w nagłówku telefonu.
// Sprawdza: plik motywu = wynik generatora; każda rola ma ciemny kolor; reguły tylko pod data-theme="dark"
// (motyw jasny bez zmian); czytelność tekstu; przełącznik zapisuje wybór na telefonie bez przeładowania.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  DARK, DARK_FILE, DARK_OVERRIDES, contrast, darkFor, darkRoleColors, lightRoleColors, parseRgba, renderDarkCss, roleKind,
} from './css-dark-theme.mjs';
import {
  THEME_BAR_COLORS, THEME_STORAGE_KEY, applyTheme, currentTheme, normalizeTheme, readStoredTheme, saveTheme, toggleTheme,
} from '../src/modules/theme.js';

// --- Plik motywu: wygenerowany, kompletny, tylko pod data-theme="dark" ---
const css = fs.readFileSync(DARK_FILE, 'utf8');
assert.equal(css, renderDarkCss(), `${DARK_FILE} = wynik scripts/css-dark-theme.mjs write`);
const light = lightRoleColors();
const dark = darkRoleColors();
assert.deepEqual(Object.keys(dark).sort(), Object.keys(light).sort(), 'każda rola ma kolor w motywie ciemnym');
const block = css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
assert.ok(block, 'blok :root[data-theme="dark"]');
const declared = Object.fromEntries([...block[1].matchAll(/(--wr-[a-z0-9-]+): ([^;]+);/g)].map((m) => [m[1], m[2]]));
assert.deepEqual(declared, dark, 'blok motywu ciemnego = kolory z generatora');
assert.match(block[1], /color-scheme: dark;/, 'natywne pola (data, lista) w ciemnym wyglądzie');
for (const v of Object.values(dark)) assert.ok(/^#[0-9a-f]{6}$/.test(v) || parseRgba(v), `poprawny kolor ${v}`);
const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
for (const sel of selectors) assert.match(sel, /^(:root\[data-theme="dark"\]|html\[data-theme="dark"\] )/, `reguła tylko w motywie ciemnym: ${sel}`);
assert.ok(DARK_OVERRIDES.some(([sel]) => sel.includes('mobileActionBtn.primary')), 'akcent czerwony: przycisk „+”');

// --- Kolory ---
assert.equal(darkFor('bg', '#ffffff'), DARK.card, 'biel tła → grafit karty');
assert.ok(contrast(darkFor('text', '#10203a'), DARK.card) >= 12, 'granatowy tekst → jasny tekst');
assert.equal(darkFor('text', '#ffffff'), '#ffffff', 'biały napis na kolorowym przycisku zostaje biały');
assert.equal(darkFor('bg', '#2563eb'), '#2563eb', 'pełny niebieski przycisk zostaje');
assert.match(darkFor('bg', 'rgba(15,23,42,.56)'), /^rgba\(0,0,0,/, 'zaciemnienie pod oknem zostaje ciemne');
assert.equal(contrast('#ffffff', DARK.accent) >= 4.5, true, 'biały na czerwonym akcencie czytelny');
for (const [role, value] of Object.entries(dark)) {
  const kind = roleKind(role);
  if (!['text', 'icon'].includes(kind) || !value.startsWith('#') || value === '#ffffff') continue;
  if (light[role].toLowerCase() === value) continue; // jasny tekst na kolorowym tle — bez zmian
  for (const bg of [DARK.card, DARK.page, DARK.raised]) {
    assert.ok(contrast(value, bg) >= 4.5, `${role} ${value} na ${bg}: ${contrast(value, bg).toFixed(2)} < 4,5`);
  }
}

// --- Pary w jednej regule (tło + tekst): w ciemnym nie gorzej niż 4,5 (albo niż w jasnym) ---
const cssFiles = fs.readdirSync('src', { recursive: true }).filter((f) => f.endsWith('.css')).map((f) => `src/${f}`);
const overridden = new Set(DARK_OVERRIDES.flatMap(([sel]) => sel.split(',').map((x) => x.trim())));
let pairs = 0;
for (const file of cssFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    let bg = null; let fg = null;
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':'); if (i < 0) continue;
      const prop = d.slice(0, i).trim().toLowerCase();
      const roles = [...d.slice(i + 1).matchAll(/var\((--wr-[a-z0-9-]+)\)/g)].map((x) => x[1]);
      if (/^background(-color)?$/.test(prop) && roles.length === 1) bg = roles[0];
      if (prop === 'color') fg = roles[0] || fg;
    }
    if (!bg || !fg || !dark[bg]?.startsWith('#') || !dark[fg]?.startsWith('#') || !light[bg].startsWith('#')) continue;
    pairs += 1;
    const cl = contrast(light[fg], light[bg]); const cd = contrast(dark[fg], dark[bg]);
    if (cd >= 4.5 || cd >= cl - 0.3) continue;
    assert.ok(overridden.has(sel), `${file}: „${sel}” — ${fg} na ${bg} w motywie ciemnym ${cd.toFixed(2)} (jasny ${cl.toFixed(2)})`);
  }
}
assert.ok(pairs > 100, `sprawdzone pary tło + tekst: ${pairs}`);

// --- Przełącznik: pamięć telefonu, atrybut <html>, kolor paska ---
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const fakeDoc = () => {
  const attrs = new Map(); const meta = { content: '#2563eb', setAttribute(k, v) { this[k] = v; } };
  return { documentElement: { getAttribute: (k) => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) },
    querySelector: (q) => (q === 'meta[name="theme-color"]' ? meta : null), meta };
};
assert.equal(normalizeTheme('dark'), 'dark');
assert.equal(normalizeTheme('cokolwiek'), 'light');
assert.equal(readStoredTheme({ getItem() { throw new Error('zablokowane'); } }), 'light', 'brak pamięci = jasny, bez wyjątku');
assert.equal(saveTheme('dark', { setItem() { throw new Error('pełno'); } }), false, 'błąd zapisu bez wyjątku');
const store = memory(); const doc = fakeDoc();
assert.equal(currentTheme(doc), 'light');
assert.equal(toggleTheme(store, doc), 'dark');
assert.equal(currentTheme(doc), 'dark');
assert.equal(store.m.get(THEME_STORAGE_KEY), 'dark', 'wybór zapisany na telefonie');
assert.equal(doc.meta.content, THEME_BAR_COLORS.dark, 'kolor paska = ciemny');
assert.equal(readStoredTheme(store), 'dark');
assert.equal(toggleTheme(store, doc), 'light');
assert.equal(doc.documentElement.getAttribute('data-theme'), null, 'jasny = bez atrybutu (wygląd jak przed 14.84)');
assert.equal(doc.meta.content, THEME_BAR_COLORS.light);
assert.equal(applyTheme('dark', null), 'dark', 'bez dokumentu bez wyjątku');

// --- Podłączenie w aplikacji ---
const main = fs.readFileSync('src/main.jsx', 'utf8');
const rolesAt = main.indexOf("import './styles/roles.css'"); const darkAt = main.indexOf("import './styles/theme-dark.css'");
assert.ok(rolesAt > 0 && darkAt > rolesAt && darkAt < main.indexOf('import('), 'theme-dark.css statycznie, po rolach');
assert.match(main, /if \(useMobile791\) \{[\s\S]{0,200}applyTheme\(readStoredTheme\(storage\)\)/, 'zapamiętany motyw tylko na telefonie, przed ekranami');
const layout = fs.readFileSync('src/mobile791/components/jobs/MobileJobsLayout.jsx', 'utf8');
assert.match(layout, /wawisThemeToggle[\s\S]{0,300}onClick=\{handleToggleTheme\}[\s\S]{0,300}aria-pressed=\{theme === "dark"\}/, 'przełącznik w nagłówku');
assert.match(layout, /setTheme\(toggleTheme\(storage\)\)/);
assert.doesNotMatch(layout, /location\.reload/, 'bez przeładowania');
for (const f of ['src/App.jsx', 'src/components/jobs/MobileJobsLayout.jsx']) {
  assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /toggleTheme|applyTheme/, `${f}: komputer bez motywu ciemnego`);
}

console.log(`PASS WAWIS 14.84 — motyw ciemny: ${Object.keys(dark).length} ról, ${DARK_OVERRIDES.length} akcentów; ${pairs} par tło + tekst sprawdzonych; przełącznik zapisuje wybór na telefonie.`);
