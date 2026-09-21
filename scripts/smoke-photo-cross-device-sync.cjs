const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const desktopApp = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const mobileApp = fs.readFileSync(path.join(root, 'src', 'mobile791', 'App.jsx'), 'utf8');
const desktopActions = fs.readFileSync(path.join(root, 'src', 'hooks', 'useSelectedJobActions.js'), 'utf8');
const mobileActions = fs.readFileSync(path.join(root, 'src', 'mobile791', 'hooks', 'useSelectedJobActions.js'), 'utf8');
const mobileAppShell = fs.readFileSync(path.join(root, 'src', 'mobile791', 'App.jsx'), 'utf8');

assert.match(desktopApp, /useRealtimeRefresh\(\{[\s\S]*reloadJobDetails,[\s\S]*\}\);/, 'Desktop should pass reloadJobDetails into realtime refresh');
assert.match(mobileApp, /useRealtimeRefresh\(\{[\s\S]*reloadJobDetails,[\s\S]*\}\);/, 'Mobile should pass reloadJobDetails into realtime refresh');

for (const [label, source] of [['desktop actions', desktopActions], ['mobile actions', mobileActions]]) {
  assert.match(source, /const deleted = await deleteJobPhoto\(/, `${label}: delete should capture result`);
  assert.match(source, /await reloadJobDetails\?\.\(photo\.job_id, \{ force: true, background: true \}\)/, `${label}: delete should force background details sync`);
}

assert.doesNotMatch(mobileActions, /\[1200, 5000, 12000, 20000\]\.forEach/, 'Mobile upload must not run the old four-step details retry chain');
assert.match(mobileActions, /photoDetailsSyncTimersRef/, 'Mobile upload should debounce one fallback details reload per job');
assert.match(mobileActions, /}, 1200\);/, 'Mobile upload should keep only one short 1.2s fallback reload');
assert.match(mobileAppShell, /Date\.now\(\) - createdAt < 60 \* 1000/, 'Mobile should preserve uploaded blob previews only briefly, not for many minutes');
assert.doesNotMatch(mobileAppShell, /10 \* 60 \* 1000/, 'Old 10 minute uploaded-photo preservation must not return');

console.log('Photo cross-device sync smoke OK');
process.exit(0);
