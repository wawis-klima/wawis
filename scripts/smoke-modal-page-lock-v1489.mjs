// WAWIS 14.89 (zgłoszenie właściciela 22.11.2026): pod każdym oknem na telefonie strona jest unieruchomiona
// (na iPhonie samo overflow:hidden nie blokuje przewijania palcem), a po zamknięciu wraca na to samo miejsce.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const modal = fs.readFileSync('src/mobile791/components/modals/AppModal.jsx', 'utf8');
assert.match(modal, /\n  lockPagePosition = true,\n/, 'domyślnie blokada pozycji strony');
assert.match(modal, /body\.style\.position = "fixed";/, 'body unieruchomione');
assert.match(modal, /root\.style\.overscrollBehavior = "none";/, 'bez przewijania „przez” okno');
assert.match(modal, /window\.scrollTo\(pageLockState\.scrollX, pageLockState\.scrollY\)/, 'pozycja przywracana po zamknięciu');
for (const file of fs.readdirSync('src/mobile791', { recursive: true }).filter((f) => f.endsWith('.jsx'))) {
  assert.doesNotMatch(fs.readFileSync(`src/mobile791/${file}`, 'utf8'), /lockPagePosition=\{false\}/, `${file}: bez wyłączania blokady`);
}
console.log('PASS WAWIS 14.89 — okna na telefonie blokują przewijanie strony pod spodem i przywracają jej pozycję.');
