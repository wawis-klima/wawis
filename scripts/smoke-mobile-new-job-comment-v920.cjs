const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const modal = read('src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx');
const voice = read('src', 'components', 'voice', 'ClientVoiceInput.jsx');
const css = read('src', 'mobile791', 'styles.css');

assert.ok(modal.includes('VoiceNoteButton'), 'Komentarz administratora nie używa kontrolowanej sesji nagrywania.');
assert.ok(modal.includes('adminNoteTextareaCompact'), 'Brak kompaktowego pola komentarza administratora.');
assert.match(modal, /<textarea[\s\S]*?rows=\{2\}[\s\S]*?adminNoteTextareaCompact/, 'Komentarz administratora powinien mieć kompaktowe 2 wiersze.');
assert.match(modal, /<VoiceNoteButton label="Komentarz administratora"[\s\S]*?appendVoiceNoteText\(prev\.admin_note, value\)/, 'Mobilny mikrofon komentarza ma dopisywać do istniejącego tekstu.');

assert.ok(voice.includes('Nagrywanie komentarza'), 'Brak okna informującego o rozpoczęciu nagrywania komentarza.');
assert.ok(voice.includes('Zakończ nagrywanie'), 'Brak jawnego przycisku zakończenia nagrywania.');
assert.ok(voice.includes('voiceNoteOverlay'), 'Brak modalnego okna sesji nagrywania komentarza.');
assert.ok(voice.includes('continuous: true'), 'Sesja komentarza powinna nasłuchiwać ciągle z możliwością ręcznego zakończenia.');

assert.ok(css.includes('grid-template-columns:minmax(0,1fr) 44px!important;'), 'Mikrofon komentarza nie ma osobnej kolumny po prawej stronie.');
assert.ok(css.includes('min-height:68px!important'), 'Pole komentarza nadal jest zbyt wysokie na mobile.');

const installerCount = (modal.match(/Instalatorzy \(opcjonalnie\)/g) || []).length;
assert.equal(installerCount, 1, 'Sekcja instalatorów powinna występować dokładnie raz w mobilnym formularzu.');
assert.match(
  modal,
  /\{editingJobId \? \(\s*<>\s*<h4>Instalatorzy \(opcjonalnie\)<\/h4>[\s\S]*?<\/div>\s*<\/>\s*\) : null\}/,
  'Instalatorzy mają być widoczni wyłącznie przy edycji istniejącego zlecenia.',
);

assert.ok(voice.includes('export function appendVoiceNoteText'), 'Brak helpera dopisywania kolejnych nagrań.');

console.log('PASS smoke-mobile-new-job-comment-v926');
