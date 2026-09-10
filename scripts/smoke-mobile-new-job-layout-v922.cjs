const fs = require('fs');
function need(text, needle, label){ if(!text.includes(needle)) throw new Error(`Brak: ${label}`); }
function forbid(text, needle, label){ if(text.includes(needle)) throw new Error(`Nadal występuje: ${label}`); }
const modal = fs.readFileSync('src/mobile791/components/modals/JobFormModal.jsx','utf8');
const css = fs.readFileSync('src/mobile791/styles.css','utf8');
need(modal, 'className="voiceFieldRow adminNoteVoiceFieldRow"', 'komentarz używa działającego voiceFieldRow');
need(modal, "gridTemplateColumns: 'minmax(0, 1fr) 44px'", 'twarde dwie kolumny komentarza');
need(modal, '{jobForm.admin_note ? (', 'czyszczenie komentarza tylko gdy jest treść');
need(modal, '{jobForm.installation_date ? (', 'czyszczenie daty tylko gdy jest data');
need(modal, 'className="installationDateInputShell"', 'shell daty');
need(modal, 'className="installationDateNativeInput"', 'osobny natywny input daty');
forbid(modal, 'className="input installationDateInput" type="date"', 'stary ogólny input daty');
need(modal, '<VoiceNoteButton label="Komentarz administratora"', 'mikrofon komentarza');
need(css, '/* Wawis 9.22 — twardy układ formularza mobile, bez zależności od media-query */', 'blok CSS 9.22');
need(css, '.formModal .adminNoteVoiceFieldRow{', 'finalny grid komentarza');
need(css, 'grid-template-columns:minmax(0,1fr) 44px!important;', 'stała kolumna mikrofonu');
need(css, '.formModal .installationDateInputShell{', 'ochrona szerokości daty');
need(css, '.formModal .installationDateNativeInput{', 'kontrola natywnego inputu');
console.log('PASS smoke-mobile-new-job-layout-v922');
