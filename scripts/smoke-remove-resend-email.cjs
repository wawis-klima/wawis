const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const removedPath = path.join(root, 'api', 'send-assignment-email.js');

assert.equal(fs.existsSync(removedPath), false, 'Old Resend email API endpoint should be removed');

const filesToScan = [
  'package.json',
  'src/App.jsx',
  'src/components/dashboard/Centrum360Panel.jsx',
  'src/hooks/useRealtimeRefresh.js',
];

for (const relativePath of filesToScan) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.doesNotMatch(source, /RESEND_API_KEY|MAIL_FROM|send-assignment-email/, `${relativePath} should not depend on the old Resend endpoint`);
}

console.log('Remove Resend email smoke OK');
process.exit(0);
