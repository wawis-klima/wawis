const fs = require('fs');
function need(text, needle, label){ if(!text.includes(needle)) throw new Error(`Brak: ${label}`); }
function forbid(text, needle, label){ if(text.includes(needle)) throw new Error(`Nadal występuje: ${label}`); }
const modal = fs.readFileSync('src/mobile791/components/modals/JobFormModal.jsx','utf8');
const css = fs.readFileSync('src/mobile791/styles.css','utf8');
forbid(modal, 'adminNoteVoiceFieldRow', 'stary układ komentarz + mikrofon');
forbid(modal, 'VoiceNoteButton', 'mikrofon komentarza mobile');
forbid(modal, 'VoiceFieldButton', 'mikrofony przy polach mobile');
need(modal, 'adminNoteTextareaCompact', 'kompaktowe pole komentarza administratora');
need(modal, '{jobForm.admin_note ? (', 'czyszczenie komentarza tylko gdy jest treść');
need(modal, '{jobForm.installation_date ? (', 'czyszczenie daty tylko gdy jest data');
need(modal, 'className="installationDateInputShell"', 'shell daty');
need(modal, 'className="installationDateNativeInput"', 'osobny natywny input daty');
forbid(modal, 'className="input installationDateInput" type="date"', 'stary ogólny input daty');
need(css, '/* Wawis 9.22 — twardy układ formularza mobile, bez zależności od media-query */', 'blok CSS 9.22');
need(modal, '<ClientVoiceInput', 'jeden główny przycisk głosowy pozostaje');
need(css, '.formModal .installationDateInputShell{', 'ochrona szerokości daty');
need(css, '.formModal .installationDateNativeInput{', 'kontrola natywnego inputu');
console.log('PASS smoke-mobile-new-job-layout-v922');
