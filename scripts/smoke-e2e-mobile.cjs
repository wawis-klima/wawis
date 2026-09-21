const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

const packageJson = JSON.parse(read('package.json'));
const playwrightConfig = read('playwright.config.js');
const runner = read('scripts', 'run-playwright-mobile.cjs');

assert.equal(packageJson.scripts['test:e2e:mobile'], 'node scripts/run-playwright-mobile.cjs');
assert.match(runner, /@mobile/);
assert.match(runner, /['"]--workers['"]\s*,\s*['"]1['"]/);
assert.match(runner, /VITE_SUPABASE_MODE/);
assert.match(playwrightConfig, /use-fake-device-for-media-stream/);
assert.match(playwrightConfig, /use-fake-ui-for-media-stream/);

const requiredSpecs = [
  'tests/e2e/mobile-photo-two-sessions.spec.js',
  'tests/e2e/mobile-resilience.spec.js',
  'tests/e2e/mobile-serial-scanner.spec.js',
  'tests/e2e/mobile-protocol-test.spec.js',
  'tests/e2e/release-visual-checks.spec.js',
];

for (const spec of requiredSpecs) {
  assert(exists(spec), `Brak mobilnego E2E: ${spec}`);
  const source = read(spec);
  assert.match(source, /@mobile/, `${spec}: brak oznaczenia @mobile`);
  assert.match(source, /test\s*\(/, `${spec}: brak scenariusza Playwright`);
}

assert(exists('tests/e2e/mock-helpers.js'), 'Brak wspólnych helperów E2E');
assert(exists('src/mobile791/lib/mockSupabaseClient.js'), 'Brak mobilnego mock Supabase');
assert.match(read('src/mobile791/lib/mockSupabaseClient.js'), /sessionStorage|localStorage/);

console.log('Mobile E2E wiring smoke OK — runner, mock i wymagane scenariusze istnieją bez sprawdzania tekstów UI');
