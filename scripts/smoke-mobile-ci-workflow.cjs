const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { collectReleaseFiles } = require('./release-zip.cjs');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'mobile-release-checks.yml');
const packagePath = path.join(root, 'package.json');
const runnerPath = path.join(root, 'scripts', 'run-release.cjs');

assert(fs.existsSync(workflowPath), 'Brak .github/workflows/mobile-release-checks.yml');

const workflow = fs.readFileSync(workflowPath, 'utf8');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const runner = fs.readFileSync(runnerPath, 'utf8');

function includesAll(source, fragments, label) {
  for (const fragment of fragments) {
    assert(source.includes(fragment), `${label} nie zawiera: ${fragment}`);
  }
}

includesAll(workflow, [
  'name: Mobile release checks',
  'push:',
  'pull_request:',
  'workflow_dispatch:',
  'actions/checkout@v4',
  'actions/setup-node@v4',
  'node-version: 20',
  'registry-url: https://registry.npmjs.org/',
  'NPM_CONFIG_REGISTRY: https://registry.npmjs.org/',
  'npm_config_registry: https://registry.npmjs.org/',
  'npm ci --include=optional --registry=https://registry.npmjs.org/',
  'npx playwright install --with-deps chromium',
  'npm run release:mobile -- --skip-version-bump',
  'actions/upload-artifact@v4',
  'releases/klima-app-v${{ steps.app-version.outputs.version }}.zip',
  'path: RELEASE-RESULT.md',
  'playwright-report',
  'test-results',
  'if: always()',
  'if: failure()',
  'GITHUB_STEP_SUMMARY',
  'ZIELONY',
  'CZERWONY',
  'Nie publikuj tej wersji.',
], 'Workflow mobile CI');

assert.strictEqual(
  pkg.scripts['test:smoke:mobile-ci'],
  'node scripts/smoke-mobile-ci-workflow.cjs',
  'Brak skryptu test:smoke:mobile-ci w package.json'
);
assert(
  runner.includes("'npm run test:smoke:mobile-ci'"),
  'Mobilny release runner nie uruchamia test:smoke:mobile-ci'
);

const releaseFiles = collectReleaseFiles(root, root);
assert(
  releaseFiles.includes('.github/workflows/mobile-release-checks.yml'),
  'Workflow mobile CI nie trafi do paczki ZIP'
);
assert(
  releaseFiles.includes('scripts/smoke-mobile-ci-workflow.cjs'),
  'Test workflow mobile CI nie trafi do paczki ZIP'
);

console.log('Smoke OK: mobile GitHub Actions installs from public npm, runs release:mobile and publishes green/red artifacts');
process.exit(0);
