const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/generate-service-sms-queue/index.ts'), 'utf8');

assert.match(source, /const DEVICE_PAGE_SIZE = 1000/);
assert.match(source, /const JOB_ID_BATCH_SIZE = 100/);
assert.match(source, /const devices = await fetchAllServiceReminderDevices\(adminClient\)/);
assert.match(source, /async function fetchAllServiceReminderDevices/);
assert.match(source, /\.not\("installation_date", "is", null\)[\s\S]*?\.order\("id", \{ ascending: true \}\)[\s\S]*?\.range\(from, from \+ DEVICE_PAGE_SIZE - 1\)/);
assert.match(source, /if \(page\.length < DEVICE_PAGE_SIZE\) break/);
assert.match(source, /const linkedJobs = await fetchJobsByIds\(adminClient, linkedJobIds\)/);
assert.match(source, /for \(let from = 0; from < jobIds\.length; from \+= JOB_ID_BATCH_SIZE\)/);
assert.match(source, /jobIds\.slice\(from, from \+ JOB_ID_BATCH_SIZE\)/);
assert.match(source, /\.in\("id", batch\)/);

console.log('SMS generator device pagination v12.29 smoke OK');
