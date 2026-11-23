// WAWIS 14.59 — kolory plakietek osób (inicjały).
// Sprawdza w obu kopiach jobHelpers (komputer i telefon), że:
//  - Piotr Wasik ma czerwony (14.93; wcześniej niebieski, nie zielony jak Kacper Wydmański),
//  - Krystian Swat niebieski (14.93),
//  - pozostałe obecne osoby mają dokładnie te same kolory co przed 14.59,
//  - obecny zespół nie ma żadnej powtórzonej barwy.
import { readFileSync } from 'node:fs';

const FILES = ['src/utils/jobHelpers.jsx', 'src/mobile791/utils/jobHelpers.jsx'];

const BEFORE = {
  'Piotr Wasik': 'badgeGreen',
  'Kacper Wydmański': 'badgeGreen',
  'Krystian Swat': 'badgePink',
  'Michał Fiutak': 'badgeAmber',
  'Paweł Makieła': 'badgePurple',
};
// 14.93 (decyzja właściciela): Piotr czerwony, Krystian niebieski (różowy był za bliski czerwonemu).
const EXPECTED = { ...BEFORE, 'Piotr Wasik': 'badgeRed', 'Krystian Swat': 'badgeBlue' };

function loadFn(file) {
  const src = readFileSync(file, 'utf8');
  const overrides = src.match(/const BADGE_COLOR_OVERRIDES = \{[\s\S]*?\n\};/);
  const fn = src.match(/export function getBadgeColorClass\(personKey\) \{[\s\S]*?\n\}/);
  if (!overrides || !fn) throw new Error(`${file}: nie znaleziono getBadgeColorClass/BADGE_COLOR_OVERRIDES`);
  const body = `${overrides[0]}\n${fn[0].replace('export ', '')}\nreturn getBadgeColorClass;`;
  return new Function(body)();
}

let failures = 0;
for (const file of FILES) {
  const fn = loadFn(file);
  for (const [name, cls] of Object.entries(EXPECTED)) {
    const got = fn(name);
    if (got !== cls) { failures += 1; console.error(`NIE: ${file} ${name} → ${got}, oczekiwano ${cls}`); }
  }
  for (const variant of ['piotr wasik', '  Piotr  Wasik ', 'PIOTR WASIK']) {
    if (fn(variant) !== 'badgeRed') { failures += 1; console.error(`NIE: ${file} wariant "${variant}" → ${fn(variant)}`); }
  }
  if (fn('') !== 'badgeBlue' || fn(null) !== 'badgeBlue') { failures += 1; console.error(`NIE: ${file} pusta nazwa`); }
  const used = Object.keys(EXPECTED).map(fn);
  if (new Set(used).size !== used.length) { failures += 1; console.error(`NIE: ${file} powtórzony kolor w zespole: ${used.join(', ')}`); }
}
const [a, b] = FILES.map((f) => readFileSync(f, 'utf8').match(/const BADGE_COLOR_OVERRIDES[\s\S]*?\n\};\n\nexport function getBadgeColorClass[\s\S]*?\n\}/)[0]);
if (a !== b) { failures += 1; console.error('NIE: kopie komputer/telefon różnią się'); }

if (failures) { console.error(`smoke-badge-colors-v1459: ${failures} błędów`); process.exit(1); }
console.log('smoke-badge-colors-v1459: OK — Piotr czerwony, Krystian niebieski, reszta bez zmian, brak powtórzeń');

// 14.93: czerwony istnieje w CSS (oba motywy przez role) i kółko w górnym pasku dostaje kolor osoby.
const css = readFileSync('src/styles/person-badge-colors-v1493.css', 'utf8');
const layout = readFileSync('src/mobile791/components/jobs/MobileJobsLayout.jsx', 'utf8');
const main = readFileSync('src/main.jsx', 'utf8');
const checks = [
  [/^\.badgeRed\{background:var\(--wr-bg-red-100\)/m.test(css), 'klasa .badgeRed'],
  [['badgeBlue', 'badgeGreen', 'badgeAmber', 'badgePurple', 'badgePink', 'badgeSlate', 'badgeRed'].every((c) => css.includes(`.wawisUserInitialsBadge.${c}{`)), 'kółko w pasku: wszystkie kolory'],
  [/className=\{`wawisUserInitialsBadge \$\{getBadgeColorClass\(profile\.full_name\)\}`\}/.test(layout), 'kółko w pasku: kolor osoby'],
  [/import '\.\/styles\/person-badge-colors-v1493\.css'/.test(main), 'CSS w punkcie wejścia'],
];
for (const [ok, label] of checks) if (!ok) { console.error(`NIE: ${label}`); process.exit(1); }
console.log('smoke-badge-colors-v1459: OK — 14.93 czerwony + kółko w pasku w kolorze osoby');
