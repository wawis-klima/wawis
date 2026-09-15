const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

for (const workflow of ['pr-checks.yml', 'release-checks.yml', 'release-policy-gate.yml', 'post-deploy-checks.yml']) {
  assert(exists('.github', 'workflows', workflow), `Brak workflow ${workflow}`);
}
assert(!exists('.github', 'workflows', 'mobile-release-checks.yml'), 'Stary osobny mobile workflow nadal istnieje');
assert(!exists('.github', 'workflows', 'desktop-release-checks.yml'), 'Stary osobny desktop workflow nadal istnieje');

const pr = read('.github', 'workflows', 'pr-checks.yml');
const release = read('.github', 'workflows', 'release-checks.yml');
const policy = read('.github', 'workflows', 'release-policy-gate.yml');
const postWorkflow = read('.github', 'workflows', 'post-deploy-checks.yml');
const runner = read('scripts', 'run-release.cjs');
const impact = read('scripts', 'release-impact.cjs');
const verifier = read('scripts', 'verify-release.cjs');
const groups = read('scripts', 'test-groups.cjs');
const deployGate = read('scripts', 'release-policy-gate.cjs');
const postCheck = read('scripts', 'post-deploy-check.mjs');
const versionBump = read('version-bump.cjs');
const vercel = JSON.parse(read('vercel.json'));

assert.match(pr, /pull_request/);
assert.match(pr, /run-pr-checks\.cjs/);
assert.match(pr, /cancel-in-progress:\s*true/);
assert.doesNotMatch(pr, /playwright install/);

assert.match(release, /workflow_dispatch/);
assert.match(release, /default:\s*auto/);
assert.match(release, /release-impact\.cjs/);
assert.match(release, /needs_playwright/);
assert.match(release, /run-release\.cjs/);
assert.match(release, /playwright install/);
assert.match(release, /release-policy-gate\.cjs/);

assert.match(policy, /workflow_dispatch/);
assert.doesNotMatch(policy, /push:/);

assert.doesNotMatch(runner, /pushTwice|pass\s*=\s*2|\/2 OK/);
assert.match(runner, /classifyRelease/);
assert.match(runner, /auto/);
assert.match(runner, /test:e2e:\$\{platform\}/);
assert.match(runner, /npm run build/);
assert.match(runner, /npm run verify:bundle/);
assert.match(runner, /npm run zip:release/);

assert.match(impact, /fast-ui/);
assert.match(impact, /targeted/);
assert.match(impact, /critical/);
assert.match(impact, /isPresentationOnly/);
assert.match(impact, /isCriticalPath/);

for (const name of ['jobs', 'photos', 'protocol', 'roles', 'push', 'fuel', 'nameplates', 'ui-fast-core', 'ui-fast-mobile', 'ui-fast-desktop']) {
  assert.match(groups, new RegExp(`${name}:\\s*\\[`), `Brak grupy regresji ${name}`);
}

assert(exists('scripts', 'smoke-release-impact-v1063.cjs'), 'Brak testu klasyfikatora release-impact');
assert.doesNotMatch(verifier, /smokeMobile|smokeDesktop|desktopNameplateOcrComponentPath|releaseChecklist\.includes/);
assert.match(verifier, /app-version\.json/);
assert.match(verifier, /RELEASE-GATE\.json/);
assert.match(verifier, /dist\/index\.html|index\.html/);
assert.match(verifier, /klima-app-v/);

assert.match(deployGate, /--deploy/);
assert.match(deployGate, /ready_for_main/);
assert.match(deployGate, /final_release_run_id/);
assert.match(deployGate, /--evidence/);
assert.match(deployGate, /service_worker_verified/);
assert.match(vercel.buildCommand || '', /release-policy-gate\.cjs --deploy/);
assert.equal(vercel.git?.deploymentEnabled?.['*'], false, 'Vercel powinien ignorować automatyczne deploye innych gałęzi');
assert.equal(vercel.git?.deploymentEnabled?.main, true, 'Vercel powinien automatycznie wdrażać wyłącznie main');

assert.match(postWorkflow, /post-deploy-check\.mjs/);
assert.match(postWorkflow, /release-policy-gate\.cjs --post --evidence/);
assert.match(postCheck, /app-version\.json/);
assert.match(postCheck, /push-sw\.js/);
assert.match(postCheck, /app_diagnostic_events/);
assert.match(postCheck, /post-deploy-evidence\.json/);

assert.match(versionBump, /SERVICE_WORKER_FILE/);
assert.match(versionBump, /updateServiceWorkerVersion/);
assert.match(versionBump, /wawis-app-shell-v/);
assert(exists('.github', 'CODEOWNERS'), 'Brak CODEOWNERS');
assert(exists('MAIN-PROTECTION.md'), 'Brak instrukcji ochrony main');

console.log('WAWIS release automation 10.63 smoke OK — automatic FAST/TARGETED/CRITICAL routing enabled');
