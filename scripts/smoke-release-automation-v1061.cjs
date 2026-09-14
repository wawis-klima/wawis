const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

assert(exists('.github', 'workflows', 'pr-checks.yml'), 'Brak szybkiego workflow PR');
assert(exists('.github', 'workflows', 'release-checks.yml'), 'Brak jednego finalnego workflow release');
assert(exists('.github', 'workflows', 'release-policy-gate.yml'), 'Brak ręcznego policy gate');
assert(!exists('.github', 'workflows', 'mobile-release-checks.yml'), 'Stary osobny mobile workflow nadal istnieje');
assert(!exists('.github', 'workflows', 'desktop-release-checks.yml'), 'Stary osobny desktop workflow nadal istnieje');

const pr = read('.github', 'workflows', 'pr-checks.yml');
const release = read('.github', 'workflows', 'release-checks.yml');
const policy = read('.github', 'workflows', 'release-policy-gate.yml');
const runner = read('scripts', 'run-release.cjs');
const verifier = read('scripts', 'verify-release.cjs');
const groups = read('scripts', 'test-groups.cjs');

assert.match(pr, /pull_request/);
assert.match(pr, /run-pr-checks\.cjs/);
assert.match(pr, /cancel-in-progress:\s*true/);
assert.doesNotMatch(pr, /playwright install/);

assert.match(release, /workflow_dispatch/);
assert.match(release, /run-release\.cjs/);
assert.match(release, /playwright install/);
assert.match(release, /release-policy-gate\.cjs/);

assert.match(policy, /workflow_dispatch/);
assert.doesNotMatch(policy, /push:/);

assert.doesNotMatch(runner, /pushTwice|pass\s*=\s*2|\/2 OK/);
assert.match(runner, /test:e2e:desktop/);
assert.match(runner, /test:e2e:mobile/);
assert.match(runner, /npm run build/);
assert.match(runner, /npm run verify:bundle/);
assert.match(runner, /npm run zip:release/);

for (const name of ['jobs', 'photos', 'protocol', 'roles', 'push', 'fuel', 'nameplates']) {
  assert.match(groups, new RegExp(`${name}:\\s*\\[`), `Brak grupy regresji ${name}`);
}

assert.doesNotMatch(verifier, /smokeMobile|smokeDesktop|desktopNameplateOcrComponentPath|releaseChecklist\.includes/);
assert.match(verifier, /app-version\.json/);
assert.match(verifier, /RELEASE-GATE\.json/);
assert.match(verifier, /dist\/index\.html|index\.html/);
assert.match(verifier, /klima-app-v/);

console.log('WAWIS release automation 10.61 smoke OK');
