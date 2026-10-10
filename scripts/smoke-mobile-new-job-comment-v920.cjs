const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const modal = read('src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx');
const voice = read('src', 'components', 'voice', 'ClientVoiceInput.jsx');
const css = read('src', 'mobile791', 'styles.css');

assert.ok(modal.includes('VoiceNoteButton') && !modal.includes('VoiceFieldButton'), '13.03: tylko komentarz administratora ma własny mikrofon.');
assert.ok(modal.includes('adminNoteTextareaCompact'), 'Brak kompaktowego pola komentarza administratora.');
assert.match(modal, /<textarea[\s\S]*?rows=\{2\}[\s\S]*?adminNoteTextareaCompact/, 'Komentarz administratora powinien mieć kompaktowe 2 wiersze.');
assert.ok(modal.includes('<ClientVoiceInput'), 'Główny przycisk Wprowadź głosowo musi pozostać.');

assert.ok(voice.includes('Nagrywanie komentarza'), 'Brak okna informującego o rozpoczęciu nagrywania komentarza.');
assert.ok(voice.includes('Zakończ nagrywanie'), 'Brak jawnego przycisku zakończenia nagrywania.');
assert.ok(voice.includes('voiceNoteOverlay'), 'Brak modalnego okna sesji nagrywania komentarza.');
assert.ok(voice.includes('continuous: true'), 'Sesja komentarza powinna nasłuchiwać ciągle z możliwością ręcznego zakończenia.');

assert.ok(css.includes('min-height:68px!important'), 'Pole komentarza nadal jest zbyt wysokie na mobile.');

assert.ok(!modal.includes('Instalatorzy (opcjonalnie)'), 'Formularz mobilny nie powinien wyświetlać listy instalatorów.');

assert.ok(voice.includes('export function appendVoiceNoteText'), 'Brak helpera dopisywania kolejnych nagrań.');

console.log('PASS smoke-mobile-new-job-comment-v926');
