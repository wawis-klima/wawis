const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const extraArgs = process.argv.slice(2);
const playwrightCli = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');
const configPath = path.join(root, 'playwright.config.js');

if (!fs.existsSync(playwrightCli)) {
  console.error('Brak Playwright w node_modules. Uruchom: npm install && npx playwright install chromium');
  process.exit(1);
}

const result = spawnSync(playwrightCli, [
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

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
