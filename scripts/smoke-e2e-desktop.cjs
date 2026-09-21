const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

const packageJson = JSON.parse(read('package.json'));
const playwrightConfig = read('playwright.config.js');
const runner = read('scripts', 'run-playwright-desktop.cjs');
const viteServer = read('scripts', 'playwright-vite-server.cjs');
const spec = read('tests', 'e2e', 'desktop-app.spec.js');

assert.equal(packageJson.scripts['test:e2e:desktop'], 'node scripts/run-playwright-desktop.cjs e2e');
assert.match(runner, /@playwright\/test|playwright/);
assert.match(viteServer, /VITE_SUPABASE_MODE/);
assert.match(playwrightConfig, /viewport/);
assert(exists('src/lib/mockSupabaseClient.js'), 'Brak desktopowego mock Supabase');
assert(exists('tests/e2e/mock-helpers.js'), 'Brak wspólnych helperów E2E');
assert.match(spec, /test\.describe|test\s*\(/, 'Brak desktopowych scenariuszy Playwright');
assert.match(spec, /ADMIN/);
assert.match(spec, /WORKER/);

console.log('Desktop E2E wiring smoke OK — runner, mock i scenariusze istnieją bez sprawdzania tekstów UI');
