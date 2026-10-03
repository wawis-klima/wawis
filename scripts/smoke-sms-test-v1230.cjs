const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const sender = read('supabase/functions/send-service-sms/index.ts');
assert.match(sender, /mode\?:[^;]*"test"/);
assert.match(sender, /testPhone\?: string \| null/);
assert.match(sender, /body\.mode === "test"/);
assert.match(sender, /handleTestSend/);
assert.match(sender, /normalizeTestPhone/);
assert.match(sender, /deliveryCallback:\s*false/);
assert.match(sender, /TEST_SMS_MESSAGE/);
assert.doesNotMatch(sender, /testPhone\s*[:=]\s*['"]\d{9}['"]/);

const client = read('src/modules/sms-send.js');
assert.match(client, /export async function sendTestSms/);
assert.match(client, /mode:\s*'test'/);
assert.match(client, /testPhone/);

const panel = read('src/components/sms/SmsPanel.jsx');
assert.match(panel, /sendTestSms/);
assert.match(panel, /SMS testowy/);
assert.match(panel, /Wyślij testowy SMS/);
assert.match(panel, /inputMode="tel"/);
assert.doesNotMatch(panel, /testSmsPhone[^\n]*['"]\d{9}['"]/);

console.log('SMS test admin v12.30 smoke OK');
