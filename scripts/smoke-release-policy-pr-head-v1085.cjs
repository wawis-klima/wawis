const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wawis-release-policy-v1085-'));

function copy(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function run(headRef) {
  return spawnSync(process.execPath, ['scripts/release-policy-gate.cjs'], {
    cwd: tempRoot,
    env: { ...process.env, WAWIS_PR_HEAD_REF: headRef },
    encoding: 'utf8',
  });
}

try {
  for (const file of [
    'scripts/release-policy-gate.cjs',
    'app-version.json',
    'public/app-version.json',
    'package.json',
    'src/version.js',
    'src/mobile791/version.js',
    'RELEASE-GATE.json',
    'README.md',
    'CHANGELOG.md',
    'WAWIS-RULES.md',
    'RELEASE-CHECKLIST.md',
    'vercel.json',
  ]) copy(file);

  const gatePath = path.join(tempRoot, 'RELEASE-GATE.json');
  const goodGate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
  const appVersion = JSON.parse(fs.readFileSync(path.join(tempRoot, 'app-version.json'), 'utf8')).version;
  const expectedBranch = `release/v${appVersion}`;

  const staleGate = {
    ...goodGate,
    version: '10.84',
    release_branch: 'release/v10.84',
    main_protection: { ...goodGate.main_protection, source_branch: 'release/v10.84' },
  };
  fs.writeFileSync(gatePath, JSON.stringify(staleGate, null, 2) + '\n');
  const stale = run(expectedBranch);
  assert.notEqual(stale.status, 0, 'Stary RELEASE-GATE 10.84 musi blokować wydanie 10.85');
  assert.match(`${stale.stdout}\n${stale.stderr}`, /RELEASE-GATE\.json=10\.84/);

  fs.writeFileSync(gatePath, JSON.stringify(goodGate, null, 2) + '\n');
  const wrongBranch = run(`audit-fixes-${appVersion}`);
  assert.notEqual(wrongBranch.status, 0, 'PR z niewłaściwej gałęzi musi dostać NO-GO');
  assert.match(`${wrongBranch.stdout}\n${wrongBranch.stderr}`, /PR pochodzi z/);

  const correctBranch = run(expectedBranch);
  assert.equal(correctBranch.status, 0, `${correctBranch.stdout}\n${correctBranch.stderr}`);
  assert.match(correctBranch.stdout, new RegExp(`WAWIS RELEASE GATE: GO — ${appVersion}`));

  console.log(`Smoke OK: stale gate and wrong PR branch are blocked; ${expectedBranch} is accepted`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
