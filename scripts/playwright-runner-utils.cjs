const fs = require('node:fs');
const path = require('node:path');

function playwrightCliPath(root) {
  return path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
}

function assertPlaywrightCli(root) {
  const cli = playwrightCliPath(root);
  if (!fs.existsSync(cli)) {
    const error = new Error('Brak Playwright CLI w node_modules. Uruchom: npm install && npx playwright install chromium');
    error.code = 'WAWIS_PLAYWRIGHT_CLI_MISSING';
    throw error;
  }
  return cli;
}

function childExitCode(result = {}) {
  if (result.error) return 1;
  if (result.signal) return 1;
  if (result.status !== 0) return Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
  return 0;
}

module.exports = {
  assertPlaywrightCli,
  childExitCode,
  playwrightCliPath,
};
