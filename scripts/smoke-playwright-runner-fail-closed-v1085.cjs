const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { childExitCode, playwrightCliPath } = require('./playwright-runner-utils.cjs');

const root = path.resolve(__dirname, '..');
const cli = playwrightCliPath(root).replaceAll('\\', '/');
assert.match(cli, /node_modules\/@playwright\/test\/cli\.js$/);
assert(!/playwright\.cmd$/i.test(cli), 'Runner must not spawn playwright.cmd directly on Windows.');

assert.equal(childExitCode({ status: 0, signal: null, error: null }), 0);
assert.equal(childExitCode({ status: 1, signal: null, error: null }), 1);
assert.equal(childExitCode({ status: 17, signal: null, error: null }), 17);
assert.equal(childExitCode({ status: null, signal: 'SIGTERM', error: null }), 1);
assert.equal(childExitCode({ status: null, signal: 'SIGKILL', error: null }), 1);
assert.equal(childExitCode({ status: null, signal: null, error: new Error('spawn failed') }), 1);
assert.equal(childExitCode({ status: null, signal: null, error: null }), 1);

for (const file of ['scripts/run-playwright-mobile.cjs', 'scripts/run-playwright-desktop.cjs']) {
  const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  assert.match(source, /spawnSync\(process\.execPath/);
  assert.match(source, /childExitCode\(result\)/);
  assert.match(source, /result\.signal/);
  assert.doesNotMatch(source, /status\s*\?\?\s*0/);
  assert.doesNotMatch(source, /playwright\.cmd/);
}

console.log('GO: 10.85 Playwright runners are cross-platform and fail closed on signals/spawn errors.');
