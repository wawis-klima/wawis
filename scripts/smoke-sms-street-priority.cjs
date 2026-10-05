const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const devicesModule = fs.readFileSync(path.join(root, 'src', 'modules', 'devices-fetch.js'), 'utf8');
const smsModule = fs.readFileSync(path.join(root, 'src', 'modules', 'sms.js'), 'utf8');

assert(/contractor_street:\s*''/.test(devicesModule), 'Urządzenie nie ma pola contractor_street w pustym formularzu.');
assert(/contractor_street:\s*normalizeText\(device\.contractor_street\)/.test(devicesModule), 'Normalizacja urządzenia nie przenosi contractor_street.');
assert(/contractor_street:\s*job\.street \|\| ''/.test(devicesModule), 'Fallback urządzenia z montażu nie przenosi ulicy do contractor_street.');
assert(/contractor_street:\s*normalized\.contractor_street \|\| linkedJob\.contractor_street/.test(devicesModule), 'Merge urządzenia nie zachowuje zapisanej ulicy przed fallbackiem z powiązanego montażu.');
assert(/contractor_street:\s*device\.contractor_street \|\| linkedJob\?\.street \|\| ''/.test(smsModule), 'Moduł SMS nie przekazuje contractor_street z poprawnym priorytetem.');
assert(/street:\s*device\.contractor_street \|\| linkedJob\?\.street \|\| ''/.test(smsModule), 'Moduł SMS nie ustawia pola street z priorytetem contractor_street -> linkedJob.street.');

console.log('SMS street priority smoke OK');
process.exit(0);
