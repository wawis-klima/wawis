const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const modal = read('src', 'components', 'modals', 'JobFormModal.jsx');
const voice = read('src', 'components', 'voice', 'ClientVoiceInput.jsx');
const css = read('src', 'styles.css');
const mobileModal = read('src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx');

assert.match(modal, /import ClientVoiceInput, \{ VoiceFieldButton, VoiceNoteButton, appendVoiceNoteText \}/, 'Desktop nie importuje helpera dopisywania komentarza głosowego.');
assert.ok(modal.includes('desktopAdminNoteVoiceRow'), 'Brak osobnego wiersza komentarz + mikrofon na desktopie.');
assert.match(modal, /<textarea[\s\S]*?desktopAdminNoteTextarea[\s\S]*?<VoiceNoteButton[\s\S]*?label="Komentarz administratora"/, 'Komentarz administratora nie ma mikrofonu po prawej stronie.');
assert.match(modal, /onValue=\{\(value\) => setJobForm\(\(prev\) => \(\{ \.{3}prev, admin_note: appendVoiceNoteText\(prev\.admin_note, value\) \}\)\)\}/, 'Desktopowe dyktowanie ma dopisywać do istniejącego admin_note.');
assert.ok(voice.includes('Nagrywanie komentarza'), 'Brak okna nagrywania komentarza.');
assert.ok(voice.includes('Zakończ nagrywanie'), 'Brak ręcznego zakończenia nagrywania.');
assert.ok(voice.includes('Na komputerze użyj Chrome lub Edge'), 'Brak czytelnego komunikatu dla nieobsługiwanej przeglądarki desktopowej.');
assert.ok(css.includes('@media (min-width: 901px)'), 'CSS komentarza nie jest ograniczony do desktopu.');
assert.ok(css.includes('.desktopAdminNoteVoiceRow{grid-template-columns:minmax(0,1fr) 44px;align-items:start;}'), 'Mikrofon desktopowego komentarza nie ma prawej kolumny.');
assert.ok(mobileModal.includes('adminNoteVoiceFieldRow'), 'Mobilny, działający układ komentarza został naruszony.');

assert.ok(voice.includes('export function appendVoiceNoteText'), 'Brak współdzielonego helpera dopisywania komentarza.');
assert.ok(voice.includes('`${existing}\\n${addition}`'), 'Kolejne nagranie powinno być dopisane w nowej linii.');

console.log('PASS smoke-desktop-admin-note-voice-v926');
