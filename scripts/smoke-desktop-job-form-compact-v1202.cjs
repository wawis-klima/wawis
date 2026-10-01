const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const desktop = read('src/components/modals/JobFormModal.jsx');
const mobile = read('src/mobile791/components/modals/JobFormModal.jsx');
const css = read('src/styles.css');

assert.doesNotMatch(desktop, /Instalatorzy \(opcjonalnie\)/, 'Desktop nie może pokazywać sekcji instalatorów w formularzu.');
assert.doesNotMatch(desktop, /className="viewerGrid"/, 'Desktop nie może renderować siatki instalatorów w formularzu.');
assert.match(desktop, /desktopJobFormCreate/, 'Desktopowy nowy formularz musi mieć klasę kompaktową.');
assert.match(css, /v12\.02 desktop: krótszy formularz nowego montażu bez wyboru instalatorów/, 'Brak desktopowego bloku kompaktowego v12.02.');
assert.match(css, /desktopJobFormCreate[\s\S]*min-height:40px !important/, 'Pola nowego formularza desktop mają być niższe.');
assert.match(css, /desktopAdminNoteTextarea[\s\S]*min-height:60px !important/, 'Komentarz administratora ma być niższy w nowym formularzu.');
assert.match(mobile, /Instalatorzy \(opcjonalnie\)/, 'Zmiana ma dotyczyć tylko desktopu; mobile pozostaje bez zmian.');

console.log('OK: v12.02 desktop bez instalatorów i z krótszym formularzem.');
