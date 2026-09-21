const fs = require('node:fs');
const path = require('node:path');
const { classifyMicroUi } = require('./micro-ui-policy.cjs');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function readJson(file) {
  return JSON.parse(read(file));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceVersion(source) {
  return String(source.match(/APP_VERSION\s*=\s*['"]([0-9]+\.[0-9]{2})['"]/)?.[1] || '').trim();
}

function readmeCurrent(source) {
  return String(source.match(/## Aktualna wersja\s*-\s*([0-9]+\.[0-9]{2})/m)?.[1] || '').trim();
}

function readmeLastFix(source) {
  return String(source.match(/## Ostatnia poprawka\s*- wersja\s*`?([0-9]+\.[0-9]{2})`?\s*[—-]\s*(.+)/m)?.[1] || '').trim();
}

function readmeLastFixBody(source) {
  return String(source.match(/## Ostatnia poprawka\s*- wersja\s*`?[0-9]+\.[0-9]{2}`?\s*[—-]\s*(.+)/m)?.[1] || '').trim();
}

function changelogSection(source, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(source.match(new RegExp(`^## ${escaped}\\r?\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'm'))?.[1] || '').trim();
}

function normalizeFiles(files) {
  return [...new Set((files || []).map((file) => String(file).replace(/\\/g, '/')))].sort();
}

function parseArgs(args = process.argv.slice(2)) {
  const index = args.indexOf('--base-ref');
  return {
    baseRef: index >= 0 ? String(args[index + 1] || '') : (process.env.WAWIS_MICRO_UI_BASE_REF || 'HEAD^1'),
  };
}

function main() {
  const { baseRef } = parseArgs();
  const appVersion = String(readJson('app-version.json').version || '').trim();
  const publicVersion = String(readJson('public/app-version.json').version || '').trim();
  const packageVersion = String(readJson('package.json').version || '').trim();
  const srcVersion = sourceVersion(read('src/version.js'));
  const mobileVersion = sourceVersion(read('src/mobile791/version.js'));
  const gate = readJson('RELEASE-GATE.json');
  const readme = read('README.md');
  const changelog = read('CHANGELOG.md');

  assert(appVersion && appVersion === publicVersion, 'NO-GO: niespójny public/app-version.json');
  assert(appVersion === packageVersion, 'NO-GO: niespójny package.json');
  assert(appVersion === srcVersion, 'NO-GO: niespójny src/version.js');
  assert(appVersion === mobileVersion, 'NO-GO: niespójny mobile version.js');
  assert(String(gate.version || '') === appVersion, 'NO-GO: RELEASE-GATE ma inną wersję');
  assert(gate.release_mode === 'micro-ui', 'NO-GO: wydanie nie jest oznaczone jako micro-ui');
  assert(['mobile', 'desktop', 'full'].includes(gate.scope), 'NO-GO: nieprawidłowy scope micro-ui');
  assert(String(gate.release_branch || '') === `release/v${appVersion}`, 'NO-GO: zła gałąź release micro-ui');

  assert(readmeCurrent(readme) === appVersion, 'NO-GO: README ma inną aktualną wersję');
  assert(readmeLastFix(readme) === appVersion, 'NO-GO: README Ostatnia poprawka ma inną wersję');
  assert(readmeLastFixBody(readme) && !/uzupełnij opis/i.test(readmeLastFixBody(readme)), 'NO-GO: README ma placeholder');
  const section = changelogSection(changelog, appVersion);
  assert(section && !/uzupełnij opis/i.test(section), 'NO-GO: CHANGELOG ma placeholder');

  assert(gate.archive?.blocking === false, 'NO-GO: archiwum GitHub nie może blokować micro-ui');
  assert(gate.drive_backup?.file_name === `klima-app-v${appVersion}.zip`, 'NO-GO: zła nazwa przyszłego ZIP-a');

  assert(gate.main_protection?.ready_for_main === true, 'NO-GO: micro-ui nie jest gotowe do main');
  assert(String(gate.main_protection?.source_branch || '') === `release/v${appVersion}`, 'NO-GO: zła gałąź źródłowa');
  assert(gate.main_protection?.required_check === 'WAWIS PR checks / targeted-checks', 'NO-GO: micro-ui nie wymaga właściwego PR checka');

  assert(gate.micro_ui?.policy_version === 1, 'NO-GO: brak wersji polityki micro-ui');
  assert(gate.micro_ui?.css_only === true, 'NO-GO: micro-ui nie jest oznaczone jako CSS-only');
  assert(gate.micro_ui?.archive_deferred === true, 'NO-GO: archiwum micro-ui nie jest odroczone');

  const actual = classifyMicroUi({ baseRef });
  assert(actual.micro_ui === true, `NO-GO: diff wdrożenia nie jest MICRO UI (${actual.reason})`);
  assert(actual.scope === gate.scope, `NO-GO: scope diffu ${actual.scope} != gate ${gate.scope}`);
  const expectedFiles = normalizeFiles(gate.micro_ui?.effective_files);
  const actualFiles = normalizeFiles(actual.effective_files);
  assert(expectedFiles.length > 0, 'NO-GO: brak listy CSS w gate');
  assert(JSON.stringify(expectedFiles) === JSON.stringify(actualFiles), `NO-GO: pliki micro-ui w gate różnią się od diffu: ${actualFiles.join(', ')}`);

  console.log(`WAWIS MICRO UI DEPLOY GATE: GO — ${appVersion} (${gate.scope})`);
  console.log(`CSS: ${actualFiles.join(', ')}`);
  console.log('ZIP/Drive: deferred — nie blokuje produkcji');
}

try {
  main();
} catch (error) {
  console.error(`WAWIS MICRO UI DEPLOY GATE: NO-GO — ${error.message}`);
  process.exit(1);
}
