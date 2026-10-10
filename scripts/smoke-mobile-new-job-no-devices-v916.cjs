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

assert.doesNotMatch(form, /<div className="jobDevicesSection">/, 'Edycja danych klienta na telefonie nie może zawierać kreatora urządzeń.');
assert.doesNotMatch(form, /Instalatorzy \\(opcjonalnie\\)/, 'Mobilna edycja administratora nie może zawierać listy instalatorów.');
assert.match(form, /editingJobId \? "Edytuj montaż" : \(isAdmin \? "Nowy montaż \/ zlecenie" : "Dodaj nowego klienta"\)/, 'Brak rozróżnienia trybu edycji, nowego montażu administratora i nowego klienta pracownika.');
assert.ok(form.includes('Komentarz administratora'), 'Nowy mobilny formularz musi zachować komentarz administratora.');
assert.ok(form.includes('Zapisz zlecenie'), 'Nowy mobilny formularz musi zachować zapis zlecenia.');

assert.match(form, /if \(serialOnlyMode\) \{[\s\S]*?<MobileDeviceWizard/, 'Osobny kreator urządzeń/tabliczek po utworzeniu montażu musi pozostać dostępny.');
assert.ok(wizard.includes('Tabliczka'), 'Mobilny kreator urządzeń/tabliczek został przypadkowo usunięty.');
assert.ok(details.includes('workerCreatedAtInfoItem'), 'Wiersz Data utworzenia nie ma osobnej klasy do bezpiecznego układu.');
assert.match(detailCss, /\.workerCreatedAtInfoItem\s*\{[\s\S]*grid-template-columns:\s*132px\s+minmax\(0,\s*1fr\)/, 'Data utworzenia nadal nie ma wystarczającej szerokości etykiety.');
assert.match(detailCss, /\.workerCreatedAtInfoValue\s*\{[\s\S]*justify-content:\s*flex-end/, 'Wartość Data utworzenia nie jest odsunięta od etykiety.');
assert.ok(jobsForm.includes('device_model: deviceFields.device_model || null'), 'Nowe zlecenie musi dać się zapisać bez modelu urządzenia.');
assert.ok(jobsForm.includes('device_serial_number: deviceFields.device_serial_number || null'), 'Nowe zlecenie musi dać się zapisać bez numeru seryjnego urządzenia.');

console.log('Mobile new-job smoke OK: editing form without device and installer sections; separate nameplate wizard remains');
