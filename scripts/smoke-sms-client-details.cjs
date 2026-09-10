const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const queueTable = fs.readFileSync(path.join(root, 'src', 'components', 'sms', 'SmsQueueTable.jsx'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src', 'components', 'sms', 'SmsPanel.jsx'), 'utf8');
const card = fs.readFileSync(path.join(root, 'src', 'components', 'sms', 'SmsClientDetailsCard.jsx'), 'utf8');
const deviceCard = fs.readFileSync(path.join(root, 'src', 'components', 'sms', 'SmsDeviceDetailsCard.jsx'), 'utf8');
const smsModule = fs.readFileSync(path.join(root, 'src', 'modules', 'sms.js'), 'utf8');

assert(!/Status<\/th>/.test(queueTable), 'Tabela SMS nadal renderuje kolumnę Status.');
assert(/smsClientLink/.test(queueTable), 'Tabela SMS nie renderuje klikalnego klienta.');
assert(/onSelectClient/.test(queueTable), 'Tabela SMS nie obsługuje wyboru klienta.');
assert(/SmsClientDetailsCard/.test(panel), 'Panel SMS nie renderuje karty danych klienta.');
assert(/SmsDeviceDetailsCard/.test(panel), 'Panel SMS nie renderuje karty danych urządzenia.');
assert(/selectedClient/.test(panel), 'Panel SMS nie trzyma stanu wybranego klienta.');
assert(/Dane klienta/.test(card), 'Karta klienta nie zawiera nagłówka danych klienta.');
assert(/Dane urządzenia/.test(deviceCard), 'Karta urządzenia nie zawiera nagłówka danych urządzenia.');
assert(/Telefon SMS/.test(card) && /Model urządzenia/.test(card) && /Numer seryjny/.test(card), 'Karta klienta nie pokazuje podstawowych danych.');
assert(/contractor_street:/.test(smsModule), 'Moduł SMS nie przekazuje contractor_street do podglądu klienta.');
assert(/street:\s*device\.contractor_street \|\| linkedJob\?\.street \|\| ''/.test(smsModule), 'Moduł SMS nie ustawia poprawnego priorytetu ulicy dla urządzenia.');
assert(/email:/.test(smsModule) && /city:/.test(smsModule) && /street:/.test(smsModule), 'Moduł SMS nie przekazuje pełniejszych danych klienta do podglądu.');

console.log('SMS client details smoke OK');
process.exit(0);
