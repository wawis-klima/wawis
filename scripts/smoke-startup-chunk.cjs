const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const viteSource = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8');
const pushHookSource = fs.readFileSync(path.join(root, 'src', 'hooks', 'usePushNotificationsState.js'), 'utf8');
const runReleaseSource = fs.readFileSync(path.join(root, 'scripts', 'run-release.cjs'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(viteSource, /manualChunks/);
assert.match(viteSource, /vendor-react/);
assert.match(viteSource, /vendor-supabase/);
assert.match(pushHookSource, /import\("\.\.\/modules\/push-subscriptions\.js"\)/);
assert.doesNotMatch(pushHookSource, /import \{[^}]*getPushStatus[^}]*\} from "\.\.\/modules\/push-subscriptions\.js"/);
assert.equal(packageJson.scripts['verify:bundle'], 'node scripts/verify-bundle-budget.cjs', 'Brak skryptu verify:bundle');
assert.match(runReleaseSource, /npm run verify:bundle/);

console.log('Startup chunk smoke OK');
process.exit(0);
