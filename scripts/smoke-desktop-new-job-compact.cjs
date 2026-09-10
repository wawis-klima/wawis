const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const desktopJobForm = fs.readFileSync(path.join(root, 'src/components/modals/JobFormModal.jsx'), 'utf8');
const mobileJobForm = fs.readFileSync(path.join(root, 'src/mobile791/components/modals/JobFormModal.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const jobsForm = fs.readFileSync(path.join(root, 'src/modules/jobs-form.js'), 'utf8');

const deviceSectionIndex = desktopJobForm.indexOf('<div className="jobDevicesSection">');
assert.ok(deviceSectionIndex > 0, 'Desktop JobFormModal stracił sekcję urządzeń całkowicie.');
const preceding = desktopJobForm.slice(Math.max(0, deviceSectionIndex - 80), deviceSectionIndex);
assert.match(preceding, /\{editingJobId\s*\?\s*\(\s*$/, 'Sekcja urządzeń nie jest ograniczona wyłącznie do edycji istniejącego montażu.');
assert.ok(desktopJobForm.includes('editingJobId ? "Edytuj montaż" : "Nowy montaż / zlecenie"'), 'Brak rozróżnienia trybu nowego i edycji.');
assert.ok(desktopJobForm.includes('Komentarz administratora'), 'Nowy formularz stracił komentarz administratora.');
assert.ok(desktopJobForm.includes('Instalatorzy (opcjonalnie)'), 'Nowy formularz stracił przydział instalatorów.');
assert.ok(desktopJobForm.includes('Zapisz zlecenie'), 'Nowy formularz stracił zapis zlecenia.');

assert.ok(mobileJobForm.includes('<div className="jobDevicesSection">'), 'Mobile stracił sekcję urządzeń mimo desktopowego zakresu zmiany.');
assert.ok(jobsForm.includes('device_model: deviceFields.device_model || null'), 'Zapis nowego zlecenia nie obsługuje pustego modelu urządzenia.');
assert.ok(jobsForm.includes('device_serial_number: deviceFields.device_serial_number || null'), 'Zapis nowego zlecenia nie obsługuje pustego numeru seryjnego.');

const compactBlock = styles.slice(styles.indexOf('v9.08 desktop: compact sidebar'));
assert.ok(compactBlock.includes('font-size: 17px !important'), 'Sidebar 9.08 nie ma zmniejszonej czcionki 17 px.');
assert.ok(compactBlock.includes('min-height: 52px !important'), 'Sidebar 9.08 nie ma zmniejszonej wysokości pozycji 52 px.');
assert.ok(compactBlock.includes('width: 28px !important') && compactBlock.includes('height: 28px !important'), 'Sidebar 9.08 nie ma kompaktowych ikon.');
assert.ok(compactBlock.includes('@media (min-width: 901px)'), 'Zmiana sidebara nie jest ograniczona do desktopu.');

console.log('Desktop new-job simplification + compact sidebar smoke OK');
