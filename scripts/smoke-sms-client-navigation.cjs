const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'src', 'components', 'sms', 'SmsPanel.jsx'), 'utf8');
const card = fs.readFileSync(path.join(root, 'src', 'components', 'sms', 'SmsClientDetailsCard.jsx'), 'utf8');
const contractors = fs.readFileSync(path.join(root, 'src', 'components', 'contractors', 'ContractorsPanel.jsx'), 'utf8');
const smsModule = fs.readFileSync(path.join(root, 'src', 'modules', 'sms.js'), 'utf8');

assert(/handleOpenJobFromSms/.test(app), 'App nie obsługuje przejścia z SMS do montażu.');
assert(/handleOpenContractorFromSms/.test(app), 'App nie obsługuje przejścia z SMS do kontrahenta.');
assert(/requestedContractorId/.test(app), 'App nie przekazuje żądanego kontrahenta do modułu kontrahentów.');
assert(/onOpenJob/.test(panel) && /onOpenContractor/.test(panel), 'SmsPanel nie przekazuje akcji przejścia do karty klienta.');
assert(/Przejdź do montażu/.test(card), 'Karta klienta nie ma przycisku "Przejdź do montażu".');
assert(/Przejdź do kontrahenta/.test(card), 'Karta klienta nie ma przycisku "Przejdź do kontrahenta".');
assert(/contractor_id/.test(smsModule), 'Moduł SMS nie przenosi contractor_id do danych klienta.');
assert(/requestedContractorId/.test(contractors) && /setSelectedId/.test(contractors), 'ContractorsPanel nie potrafi otworzyć wskazanego kontrahenta z modułu SMS.');

console.log('SMS client navigation smoke OK');
process.exit(0);
