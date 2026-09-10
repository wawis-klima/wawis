const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const form = read('src', 'mobile791', 'components', 'modals', 'JobFormModal.jsx');
const jobsForm = read('src', 'mobile791', 'modules', 'jobs-form.js');
const wizard = read('src', 'mobile791', 'components', 'devices', 'MobileDeviceWizard.jsx');

const deviceSectionIndex = form.indexOf('<div className="jobDevicesSection">');
assert.ok(deviceSectionIndex > 0, 'Mobilny formularz stracił sekcję urządzeń całkowicie.');
const preceding = form.slice(Math.max(0, deviceSectionIndex - 100), deviceSectionIndex);
assert.match(
  preceding,
  /\{editingJobId\s*\?\s*\(\s*$/,
  'Sekcja urządzeń w mobile musi być widoczna dopiero przy edycji istniejącego montażu, a nie przy tworzeniu nowego.',
);

assert.match(form, /editingJobId \? "Edytuj montaż" : \(isAdmin \? "Nowy montaż \/ zlecenie" : "Dodaj nowego klienta"\)/, 'Brak rozróżnienia trybu edycji, nowego montażu administratora i nowego klienta pracownika.');
assert.ok(form.includes('Komentarz administratora'), 'Nowy mobilny formularz musi zachować komentarz administratora.');
assert.match(form, /\{editingJobId \? \(\s*<>\s*<h4>Instalatorzy \(opcjonalnie\)<\/h4>/, 'Wybór instalatorów ma być dostępny dopiero przy edycji istniejącego montażu.');
assert.ok(form.includes('Zapisz zlecenie'), 'Nowy mobilny formularz musi zachować zapis zlecenia.');

assert.match(form, /if \(serialOnlyMode\) \{[\s\S]*?<MobileDeviceWizard/, 'Osobny kreator urządzeń/tabliczek po utworzeniu montażu musi pozostać dostępny.');
assert.ok(wizard.includes('Tabliczka'), 'Mobilny kreator urządzeń/tabliczek został przypadkowo usunięty.');
assert.ok(jobsForm.includes('device_model: deviceFields.device_model || null'), 'Nowe zlecenie musi dać się zapisać bez modelu urządzenia.');
assert.ok(jobsForm.includes('device_serial_number: deviceFields.device_serial_number || null'), 'Nowe zlecenie musi dać się zapisać bez numeru seryjnego urządzenia.');

console.log('Mobile new-job 9.16 smoke OK: create without devices; post-create device/nameplate flow preserved');
