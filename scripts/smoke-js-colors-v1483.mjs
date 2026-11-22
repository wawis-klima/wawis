// WAWIS 14.83 — kolory z kodu JS telefonu przez role kolorów (krok 3 do motywu ciemnego): wygląd bez zmian.
// Dowód: w każdym pliku z JS_COLOR_FILES po wstawieniu w miejsce kolejnych var(--wr-…) zapisanych pierwotnych kolorów
// plik = oryginał (SHA-256 z chwili konwersji), a każda rola daje w motywie jasnym dokładnie ten pierwotny kolor.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { JS_COLOR_BASELINE_FILE, JS_COLOR_FILES, colorSites, paletteRefFor } from './js-colors.mjs';
import { ROLE_PREFIX, TOKENS_FILE, canonicalHex, readRolesFile, readTokens, roleKindFor, sha256 } from './css-tokens.mjs';
import { ALPHA_FILE, normalizeRgba, readAlpha } from './css-alpha.mjs';

// --- Narzędzie na próbkach ---
const cssSample = 'const X = `.a{background:#fff;color:#10203a;border:1px solid rgba(37,99,235,.28);box-shadow:0 1px 2px rgba(0,0,0,.1)}`;';
assert.deepEqual(colorSites(cssSample, 'css').map((s) => [s.property, s.raw]),
  [['background', '#fff'], ['color', '#10203a'], ['border', 'rgba(37,99,235,.28)']], 'cień bez roli, reszta z właściwością');
const styleSample = 'const P = { background: "#fff", borderColor: \'#d8e0ec\', boxShadow: "0 2px 4px rgba(0,0,0,.2)", type: "button" };';
assert.deepEqual(colorSites(styleSample, 'style').map((s) => [s.property, s.raw]),
  [['background', '#fff'], ['border-color', '#d8e0ec']], 'styl inline: camelCase → właściwość CSS, cień pominięty');
assert.equal(paletteRefFor('#FFF').name, '--wx-white');
assert.equal(paletteRefFor('rgba(15, 23, 42, .56)').name, paletteRefFor('rgba(15,23,42,.56)').name, 'rgba w postaci kanonicznej');

const tokens = readTokens(fs.readFileSync(TOKENS_FILE, 'utf8'));
const alpha = readAlpha(fs.readFileSync(ALPHA_FILE, 'utf8'));
const roles = readRolesFile();
const baseline = JSON.parse(fs.readFileSync(JS_COLOR_BASELINE_FILE, 'utf8')).files;
assert.deepEqual(Object.keys(baseline).sort(), Object.keys(JS_COLOR_FILES).sort(), 'zapis = lista plików');

const roleValue = (role) => {
  const palette = roles[role];
  assert.ok(palette, `nieznana rola ${role}`);
  return palette.startsWith('--wxa-') ? alpha[palette] : tokens[palette];
};

const unchanged = {};
function checkFile(file, mode, current) {
  const { colors, original_sha256: sha, mode: savedMode } = baseline[file];
  assert.equal(savedMode, mode, `${file}: tryb`);
  const uses = [...current.matchAll(/var\((--wr-[a-z0-9-]+)\)/g)];
  assert.equal(uses.length, colors.length, `${file}: liczba ról = liczba pierwotnych kolorów`);
  let k = 0;
  const reconstructed = current.replace(/var\((--wr-[a-z0-9-]+)\)/g, () => colors[k++]);
  // 14.85: SHA-256 dowodził w 14.83, że konwersja zmieniła tylko kolory. Później te pliki wolno zwyczajnie
  // edytować (np. przyciski okna edycji) — kolory nadal sprawdzamy miejsce po miejscu (niżej), a zgodność
  // z oryginałem tylko zgłaszamy.
  unchanged[file] = sha256(reconstructed) === sha;
  uses.forEach((m, i) => {
    const raw = colors[i];
    const expected = raw.startsWith('#') ? canonicalHex(raw) : normalizeRgba(raw);
    assert.equal(roleValue(m[1]), expected, `${file}: ${m[1]} ≠ pierwotny kolor ${raw}`);
  });
  // Rodzaj roli = właściwość, w której stoi (liczone na oryginale: te same miejsca, ta sama kolejność).
  const sites = colorSites(reconstructed, mode);
  assert.equal(sites.length, uses.length, `${file}: miejsca z kolorem w oryginale = role`);
  sites.forEach((site, i) => {
    const kind = uses[i][1].slice(ROLE_PREFIX.length).split('-')[0];
    assert.equal(kind, roleKindFor(site.property), `${file}: ${uses[i][1]} we właściwości „${site.property}”`);
  });
  assert.equal(colorSites(current, mode).length, 0, `${file}: wszystkie kolory (poza cieniami) przez role`);
  return uses.length;
}

let total = 0;
for (const [file, mode] of Object.entries(JS_COLOR_FILES)) total += checkFile(file, mode, fs.readFileSync(file, 'utf8'));

// Kontrole negatywne: inna rola (inny kolor), rola innego rodzaju i zmieniony tekst poza kolorami muszą zostać wykryte.
{
  const file = 'src/mobile791/components/modals/ConfirmActionModal.jsx';
  const mode = JS_COLOR_FILES[file];
  const current = fs.readFileSync(file, 'utf8');
  assert.throws(() => checkFile(file, mode, current.replace('var(--wr-bg-white)', 'var(--wr-bg-slate-50)')), /pierwotny kolor/);
  assert.throws(() => checkFile(file, mode, current.replace('background: "var(--wr-bg-white)"', 'background: "var(--wr-text-white)"')), /właściwości/);
  assert.throws(() => checkFile(file, mode, current.replace('var(--wr-bg-white)', '#ffffff')), /liczba ról|przez role/);
}

const edited = Object.keys(unchanged).filter((f) => !unchanged[f]);
console.log(`PASS WAWIS 14.83 — ${total} kolorów z kodu JS w ${Object.keys(JS_COLOR_FILES).length} plikach przez role; role = pierwotne kolory${edited.length ? `; edytowane od 14.83 (kolory bez zmian): ${edited.join(', ')}` : '; pliki po odtworzeniu = oryginał'}.`);
