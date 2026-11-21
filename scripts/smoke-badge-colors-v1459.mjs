// WAWIS 14.59 — kolory plakietek osób (inicjały).
// Sprawdza w obu kopiach jobHelpers (komputer i telefon), że:
//  - Piotr Wasik ma niebieski, a nie zielony jak Kacper Wydmański,
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
const EXPECTED = { ...BEFORE, 'Piotr Wasik': 'badgeBlue' };

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
    if (fn(variant) !== 'badgeBlue') { failures += 1; console.error(`NIE: ${file} wariant "${variant}" → ${fn(variant)}`); }
  }
  if (fn('') !== 'badgeBlue' || fn(null) !== 'badgeBlue') { failures += 1; console.error(`NIE: ${file} pusta nazwa`); }
  const used = Object.keys(EXPECTED).map(fn);
  if (new Set(used).size !== used.length) { failures += 1; console.error(`NIE: ${file} powtórzony kolor w zespole: ${used.join(', ')}`); }
}
const [a, b] = FILES.map((f) => readFileSync(f, 'utf8').match(/const BADGE_COLOR_OVERRIDES[\s\S]*?\n\};\n\nexport function getBadgeColorClass[\s\S]*?\n\}/)[0]);
if (a !== b) { failures += 1; console.error('NIE: kopie komputer/telefon różnią się'); }

if (failures) { console.error(`smoke-badge-colors-v1459: ${failures} błędów`); process.exit(1); }
console.log('smoke-badge-colors-v1459: OK — Piotr niebieski, reszta bez zmian, brak powtórzeń');
