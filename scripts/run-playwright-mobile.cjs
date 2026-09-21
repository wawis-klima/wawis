const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertPlaywrightCli, childExitCode } = require('./playwright-runner-utils.cjs');

const root = path.resolve(__dirname, '..');
const extraArgs = process.argv.slice(2);
const configPath = path.join(root, 'playwright.config.js');

let playwrightCli;
try {
  playwrightCli = assertPlaywrightCli(root);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const result = spawnSync(process.execPath, [
  playwrightCli,
  'test',
  '--config',
  configPath,
  '--grep',
  '@mobile',
  '--workers',
  '1',
  ...extraArgs,
], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_MODE: 'mock',
  },
});

const exitCode = childExitCode(result);
if (result.error) console.error(result.error.message);
if (result.signal) console.error(`Playwright mobile przerwany sygnałem ${result.signal}.`);
process.exit(exitCode);
