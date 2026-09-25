const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const form = read('src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx');
const jobsForm = read('src', 'mobile791', 'modules', 'jobs-form.js');
const wizard = read('src', 'mobile791', 'components', 'devices', 'MobileDeviceWizard.jsx');
const details = read('src', 'mobile791', 'components', 'JobDetailsPanel.jsx');
const detailCss = read('src', 'mobile791', 'v1103-completed-note-compact.css');

const deviceSectionIndex = form.indexOf('<div className="jobDevicesSection">');
assert.ok(deviceSectionIndex > 0, 'Mobilny formularz stracił sekcję urządzeń całkowicie.');
const preceding = form.slice(Math.max(0, deviceSectionIndex - 100), deviceSectionIndex);
assert.match(
  preceding,
  /\{editingJobId\s*&&\s*\(isAdmin\s*\|\|\s*serialOnlyMode\)\s*\?\s*\(\s*$/,
  'Sekcja urządzeń w mobile ma być widoczna tylko administratorowi lub w osobnym trybie Tabliczki, nie w zwykłej edycji klienta pracownika.',
);

assert.match(form, /editingJobId \? "Edytuj montaż" : \(isAdmin \? "Nowy montaż \/ zlecenie" : "Dodaj nowego klienta"\)/, 'Brak rozróżnienia trybu edycji, nowego montażu administratora i nowego klienta pracownika.');
assert.ok(form.includes('Komentarz administratora'), 'Nowy mobilny formularz musi zachować komentarz administratora.');
assert.match(
  form,
  /\{\(editingJobId \|\| !isAdmin\) \? \(\s*<>\s*<h4>Instalatorzy \(opcjonalnie\)<\/h4>/,
  'W 10.60 wybór instalatorów musi być dostępny przy edycji oraz podczas tworzenia montażu przez pracownika.',
);
assert.ok(form.includes('Zapisz zlecenie'), 'Nowy mobilny formularz musi zachować zapis zlecenia.');

assert.match(form, /if \(serialOnlyMode\) \{[\s\S]*?<MobileDeviceWizard/, 'Osobny kreator urządzeń/tabliczek po utworzeniu montażu musi pozostać dostępny.');
assert.ok(wizard.includes('Tabliczka'), 'Mobilny kreator urządzeń/tabliczek został przypadkowo usunięty.');
assert.ok(details.includes('workerCreatedAtInfoItem'), 'Wiersz Data utworzenia nie ma osobnej klasy do bezpiecznego układu.');
assert.match(detailCss, /\.workerCreatedAtInfoItem\s*\{[\s\S]*grid-template-columns:\s*132px\s+minmax\(0,\s*1fr\)/, 'Data utworzenia nadal nie ma wystarczającej szerokości etykiety.');
assert.match(detailCss, /\.workerCreatedAtInfoValue\s*\{[\s\S]*justify-content:\s*flex-end/, 'Wartość Data utworzenia nie jest odsunięta od etykiety.');
assert.ok(jobsForm.includes('device_model: deviceFields.device_model || null'), 'Nowe zlecenie musi dać się zapisać bez modelu urządzenia.');
assert.ok(jobsForm.includes('device_serial_number: deviceFields.device_serial_number || null'), 'Nowe zlecenie musi dać się zapisać bez numeru seryjnego urządzenia.');

console.log('Mobile new-job 10.60 smoke OK: create without devices; worker installer selection and post-create device/nameplate flow preserved');
