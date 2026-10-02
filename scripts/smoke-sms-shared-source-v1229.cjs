const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const mobileApp = read('src/mobile791/App.jsx');
const mobileDevicesPanel = read('src/mobile791/components/devices/DevicesPanel.jsx');
assert.match(mobileApp, /from "\.\.\/modules\/sms\.js"/);
assert.match(mobileApp, /import\("\.\.\/components\/sms\/SmsPanel\.jsx"\)/);
assert.doesNotMatch(mobileApp, /from "\.\/modules\/sms\.js"/);
assert.doesNotMatch(mobileApp, /import\("\.\/components\/sms\/SmsPanel\.jsx"\)/);
assert.match(mobileDevicesPanel, /from '\.\.\/\.\.\/\.\.\/components\/sms\/SmsHistoryCard\.jsx'/);

const legacyMobileComponents = path.join(root, 'src/mobile791/components/sms');
if (fs.existsSync(legacyMobileComponents)) {
  assert.deepEqual(fs.readdirSync(legacyMobileComponents), [], 'Katalog mobile nie może zawierać kopii komponentów SMS.');
}

for (const relativePath of [
  'src/mobile791/modules/sms.js',
  'src/mobile791/modules/sms-fetch.js',
  'src/mobile791/modules/sms-send.js',
  'src/mobile791/modules/sms-unsent.js',
  'sms-send.js',
]) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} nie może duplikować wspólnego kodu SMS.`);
}

for (const relativePath of [
  'src/components/sms/SmsPanel.jsx',
  'src/modules/sms.js',
  'src/modules/sms-fetch.js',
  'src/modules/sms-send.js',
  'src/modules/sms-unsent.js',
]) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), true, `Brakuje wspólnego źródła SMS: ${relativePath}.`);
}

for (const relativePath of [
  'src/components/sms/SmsQueueTable.jsx',
  'src/components/sms/SmsUnsentCard.jsx',
  'src/components/sms/SmsSentThisMonthCard.jsx',
]) {
  const source = read(relativePath);
  const memoIndex = source.indexOf('const pages = useMemo(() => {');
  const earlyReturnIndex = source.indexOf('if (totalPages <= 1) return null;');
  assert.ok(memoIndex >= 0, `${relativePath}: brakuje useMemo paginacji.`);
  assert.ok(earlyReturnIndex > memoIndex, `${relativePath}: return null nie może poprzedzać hooka useMemo.`);
}

for (const relativePath of [
  'src/modules/devices-fetch.js',
  'src/mobile791/modules/devices-fetch.js',
]) {
  const source = read(relativePath);
  assert.match(source, /code === 'PGRST202'/);
  assert.match(source, /code === '42883'/);
  assert.match(source, /code === '42P01'/);
  assert.doesNotMatch(source, /message\.includes\('function public'\)/);
  assert.doesNotMatch(source, /message\.includes\('column'\)/);
}

console.log('SMS desktop/mobile shared source v12.29 smoke OK');
