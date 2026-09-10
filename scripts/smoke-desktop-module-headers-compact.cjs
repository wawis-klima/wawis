const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const jobsPanel = read('src/components/JobsPanel.jsx');
const devicesPanel = read('src/components/devices/DevicesPanel.jsx');
const smsPanel = read('src/components/sms/SmsPanel.jsx');

const styles = read('src/styles.css');
assert(/\.desktopJobsModulePage \.smsDesktopHeaderCard\{[^}]*min-height:70px/.test(styles), 'Nagłówek Montaże na desktopie powinien mieć kompaktową wysokość 70px jak pasek Kalendarza.');
assert(/\.smsDesktopMockupPage > \.smsDesktopHeaderCard\{[\s\S]*?min-height:70px !important;/.test(styles), 'Nagłówek SMS na desktopie powinien mieć kompaktową wysokość 70px.');
assert(/\.smsSettingsOnlyPage > \.smsDesktopHeaderCard\{[\s\S]*?min-width:min\(300px, 100%\);/.test(styles), 'Nagłówek Szablony SMS powinien mieć zwężoną ramkę.');
assert(/\.calendarToolbarCompact\{min-height:70px\}/.test(styles), 'Pasek Kalendarza powinien pozostać punktem odniesienia 70px.');

assert(jobsPanel.includes('<h1>Montaże</h1>'), 'Brak nagłówka Montaże.');
assert(!jobsPanel.includes('Zarządzaj zleceniami montażu'), 'Desktopowy moduł Montaże nie powinien pokazywać opisu pod nagłówkiem.');

assert(devicesPanel.includes('<h1>Urządzenia</h1>'), 'Brak nagłówka Urządzenia.');
assert(!devicesPanel.includes('Osobny katalog urządzeń zsynchronizowany z montażami'), 'Desktopowy moduł Urządzenia nie powinien pokazywać opisu pod nagłówkiem.');

assert(smsPanel.includes('<h1>SMS – przypomnienia serwisowe</h1>'), 'Brak nagłówka SMS.');
assert(!smsPanel.includes('Zarządzaj przypomnieniami serwisowymi'), 'Desktopowy moduł SMS nie powinien pokazywać opisu pod nagłówkiem.');

assert(smsPanel.includes('<h1>{settingsOnlyTitle}</h1>'), 'Brak nagłówka widoku ustawień/szablonów SMS.');
assert(!smsPanel.includes('Edytuj treść wiadomości wysyłanej klientom'), 'Widok Szablony SMS nie powinien pokazywać opisu pod nagłówkiem.');
assert(!smsPanel.includes('settingsOnlyDescription'), 'Nie powinno zostać nieużywane pole settingsOnlyDescription.');

const desktopJobsLayout = read('src/components/jobs/DesktopJobsLayout.jsx');
assert(!desktopJobsLayout.includes('IconRefresh'), 'Desktopowe Montaże nie powinny mieć przycisku Odśwież w nagłówku.');
assert(!desktopJobsLayout.includes('IconLogout'), 'Desktopowe Montaże nie powinny mieć przycisku Wyloguj w nagłówku.');
assert(!desktopJobsLayout.includes('pushControlRow'), 'Desktopowe Montaże nie powinny pokazywać kontroli Push aktywne.');
assert(!desktopJobsLayout.includes('desktopUserBox'), 'Desktopowe Montaże nie powinny pokazywać nazwy zalogowanego użytkownika w nagłówku.');
assert(/\.desktopStatusInlineWrap\{[\s\S]*?width:fit-content !important;/.test(styles), 'Ramka statusów Montaże powinna mieć szerokość dopasowaną do ikon.');
console.log('OK: desktopowe nagłówki i toolbar Montaże są kompaktowe.');
