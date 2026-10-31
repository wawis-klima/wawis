// WAWIS 13.99: version-bump dopisuje nowy wpis „Ostatnia poprawka” i NIE kasuje poprzedniego
// (wcześniej znikał opis 13.96 przy podbiciu do 13.97 oraz 13.97 przy podbiciu do 13.98).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const script = process.env.WAWIS_VERSION_BUMP_SCRIPT || path.join(__dirname, '..', 'version-bump.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wawis-bump-'));
const f = name => path.join(dir, name);
fs.mkdirSync(f('public')); fs.mkdirSync(f('src'));
fs.writeFileSync(f('app-version.json'), '{"version":"13.98"}\n');
fs.writeFileSync(f('public/app-version.json'), '{"version":"13.98"}\n');
fs.writeFileSync(f('package.json'), '{"name":"t","version":"13.98"}\n');
fs.writeFileSync(f('README.md'), '## Aktualna wersja\n- 13.98\n\n## Ostatnia poprawka\n- wersja `13.98` — opis 98.\n- wersja `13.97` — opis 97.\n');
fs.writeFileSync(f('CHANGELOG.md'), '## 13.98\n- a\n');
fs.writeFileSync(f('src/v.js'), "export const APP_VERSION = '13.98';\n");
fs.writeFileSync(f('src/m.js'), "export const APP_VERSION = '13.98';\n");
execFileSync(process.execPath, [script], { stdio: 'pipe', env: { ...process.env,
  APP_VERSION_FILE: f('app-version.json'), PUBLIC_APP_VERSION_FILE: f('public/app-version.json'),
  PACKAGE_JSON_FILE: f('package.json'), README_FILE: f('README.md'), CHANGELOG_FILE: f('CHANGELOG.md'),
  PACKAGE_LOCK_FILE: f('none-lock.json'), SRC_VERSION_FILE: f('src/v.js'), MOBILE_SRC_VERSION_FILE: f('src/m.js'),
  SERVICE_WORKER_FILE: f('none-sw.js') } });
const readme = fs.readFileSync(f('README.md'), 'utf8');
assert.match(readme, /## Aktualna wersja\n- 13\.99\n/);
assert.match(readme, /## Ostatnia poprawka\n- wersja `13\.99` — uzupełnij[^\n]*\n- wersja `13\.98` — opis 98\.\n- wersja `13\.97` — opis 97\./,
  'Nowy wpis nad poprzednimi; opis poprzedniej wersji zachowany.');
assert.equal(JSON.parse(fs.readFileSync(f('app-version.json'), 'utf8')).version, '13.99');
assert.match(fs.readFileSync(f('CHANGELOG.md'), 'utf8'), /^## 13\.99\n/);
fs.rmSync(dir, { recursive: true, force: true });
console.log('WAWIS 13.99 version-bump keeps previous README entries: PASS');
