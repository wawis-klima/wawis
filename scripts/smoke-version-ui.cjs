const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appVersion = String(JSON.parse(fs.readFileSync(path.join(root, 'app-version.json'), 'utf8')).version || '').trim();
const packageVersion = String(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || '').trim();
const versionSource = fs.readFileSync(path.join(root, 'src', 'version.js'), 'utf8');
const authScreenSource = fs.readFileSync(path.join(root, 'src', 'components', 'AuthScreen.jsx'), 'utf8');
const mobileLayoutSource = fs.readFileSync(path.join(root, 'src', 'components', 'jobs', 'MobileJobsLayout.jsx'), 'utf8');
const desktopLayoutSource = fs.readFileSync(path.join(root, 'src', 'components', 'jobs', 'DesktopJobsLayout.jsx'), 'utf8');
const adminShellSource = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'AdminDesktopShell.jsx'), 'utf8');

const sourceVersionMatch = versionSource.match(/APP_VERSION\s*=\s*['"]([0-9]+\.[0-9]{2})['"]/);
const sourceVersion = String(sourceVersionMatch?.[1] || '').trim();

assert.ok(appVersion, 'Brak wersji w app-version.json');
assert.equal(packageVersion, appVersion, 'package.json ma inną wersję niż app-version.json');
assert.equal(sourceVersion, appVersion, 'src/version.js ma inną wersję niż app-version.json');

assert.match(authScreenSource, /import\s+\{\s*APP_VERSION\s*\}\s+from\s+["']\.\.\/version["'];/);
assert.match(authScreenSource, /Wersja\s*\{APP_VERSION\}/);
assert.doesNotMatch(authScreenSource, /Wersja\s+[0-9]+\.[0-9]{2}/);

assert.match(mobileLayoutSource, /import\s+\{\s*APP_VERSION\s*\}\s+from\s+["']\.\.\/\.\.\/version["'];/);
assert.match(mobileLayoutSource, /WERSJA\s*\{APP_VERSION\}/);
assert.doesNotMatch(mobileLayoutSource, /WERSJA\s+[0-9]+\.[0-9]{2}/);

assert.match(desktopLayoutSource, /import\s+\{\s*APP_VERSION\s*\}\s+from\s+["']\.\.\/\.\.\/version["'];/);
assert.match(desktopLayoutSource, /WERSJA\s*\{APP_VERSION\}/);
assert.doesNotMatch(desktopLayoutSource, /WERSJA\s+[0-9]+\.[0-9]{2}/);

assert.match(adminShellSource, /import\s+\{\s*APP_VERSION\s*\}\s+from\s+["']\.\.\/\.\.\/version["'];/);
assert.match(adminShellSource, /adminDesktopSidebarVersion/);
assert.match(adminShellSource, /Wersja\s*\{APP_VERSION\}/);
assert.doesNotMatch(adminShellSource, /Wersja\s+[0-9]+\.[0-9]{2}/);

console.log(`Version UI smoke OK (${appVersion})`);
process.exit(0);
