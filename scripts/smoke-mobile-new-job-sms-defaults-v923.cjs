const fs = require('fs');
function read(path){ return fs.readFileSync(path,'utf8'); }
function need(text, needle, label){ if(!text.includes(needle)) throw new Error(`Brak: ${label}`); }
function forbid(text, needle, label){ if(text.includes(needle)) throw new Error(`Nadal występuje: ${label}`); }

for (const rel of [
  'src/components/modals/JobFormModal.jsx',
  'src/mobile791/components/modals/JobFormModal.jsx',
]) {
  const modal = read(rel);
  forbid(modal, 'Zgoda na SMS', `${rel}: przełącznik Zgoda na SMS`);
  forbid(modal, 'Aktywne przypomnienia', `${rel}: przełącznik Aktywne przypomnienia`);
  forbid(modal, 'updateField("sms_consent"', `${rel}: ręczna zmiana sms_consent`);
  forbid(modal, 'updateField("sms_reminder_enabled"', `${rel}: ręczna zmiana sms_reminder_enabled`);
}

for (const rel of [
  'src/modules/jobs-form.js',
  'src/mobile791/modules/jobs-form.js',
]) {
  const jobs = read(rel);
  const consentMatches = jobs.match(/sms_consent:\s*true,/g) || [];
  const reminderMatches = jobs.match(/sms_reminder_enabled:\s*true,/g) || [];
  if (consentMatches.length < 4) throw new Error(`${rel}: zapis nie wymusza sms_consent=true we wszystkich ścieżkach`);
  if (reminderMatches.length < 4) throw new Error(`${rel}: zapis nie wymusza sms_reminder_enabled=true we wszystkich ścieżkach`);
  forbid(jobs, 'sms_consent: !!resolvedForm.sms_consent', `${rel}: zapis zależny od formularza dla SMS`);
  forbid(jobs, 'sms_reminder_enabled: !!resolvedForm.sms_reminder_enabled', `${rel}: zapis zależny od formularza dla przypomnień`);
}

const voice = read('src/components/voice/ClientVoiceInput.jsx');
forbid(voice, 'Mów naturalnie, bez komend i bez podawania nazw pól', 'opis głosowy pod przyciskiem');
need(voice, 'Zakończ i sprawdź', 'działające pełne dyktowanie pozostaje');

console.log('PASS smoke-mobile-new-job-sms-defaults-v923');
