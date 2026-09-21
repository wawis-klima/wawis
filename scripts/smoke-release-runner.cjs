const assert = require('node:assert/strict');
const {
  buildPlan,
  parseOptions,
  releaseLabel,
  resolveRelease,
} = require('./run-release.cjs');

function commands(plan) {
  return plan.map((step) => step.command);
}

function count(list, value) {
  return list.filter((item) => item === value).length;
}

const fullOptions = parseOptions(['full', '--bump-version', '--package']);
const fullRelease = resolveRelease(fullOptions);
const fullPlan = buildPlan(fullOptions, fullRelease);
const fullCommands = commands(fullPlan);

assert.equal(fullOptions.variant, 'full');
assert.equal(fullOptions.bumpVersion, true);
assert.equal(fullOptions.packageArtifact, true);
assert.equal(fullRelease.scope, 'full');
assert.deepEqual(fullRelease.e2e, ['desktop', 'mobile']);
assert.equal(releaseLabel(fullRelease), 'full');
assert.equal(fullCommands[0], 'npm run version:bump');
assert.equal(count(fullCommands, 'npm run test:e2e:desktop'), 1);
assert.equal(count(fullCommands, 'npm run test:e2e:mobile'), 1);
assert.equal(count(fullCommands, 'npm run build'), 1);
assert.equal(count(fullCommands, 'npm run verify:bundle'), 1);
assert.equal(count(fullCommands, 'npm run test:smoke:dist-mobile-css'), 1);
assert.equal(count(fullCommands, 'npm run verify:release'), 1);
assert.equal(count(fullCommands, 'npm run zip:release'), 1);
assert.equal(count(fullCommands, 'node scripts/verify-release.cjs --require-zip'), 1);
assert(fullCommands.indexOf('npm run build') < fullCommands.indexOf('npm run zip:release'));

const mobileOptions = parseOptions(['mobile']);
const mobileRelease = resolveRelease(mobileOptions);
const mobileCommands = commands(buildPlan(mobileOptions, mobileRelease));
assert.deepEqual(mobileRelease.e2e, ['mobile']);
assert.equal(count(mobileCommands, 'npm run test:e2e:mobile'), 1);
assert.equal(count(mobileCommands, 'npm run test:e2e:desktop'), 0);
assert.equal(count(mobileCommands, 'npm run build'), 1);
assert.equal(count(mobileCommands, 'npm run test:smoke:dist-mobile-css'), 1);

const desktopOptions = parseOptions(['desktop']);
const desktopRelease = resolveRelease(desktopOptions);
const desktopCommands = commands(buildPlan(desktopOptions, desktopRelease));
assert.deepEqual(desktopRelease.e2e, ['desktop']);
assert.equal(count(desktopCommands, 'npm run test:e2e:desktop'), 1);
assert.equal(count(desktopCommands, 'npm run test:e2e:mobile'), 0);
assert.equal(count(desktopCommands, 'npm run build'), 1);
assert.equal(count(desktopCommands, 'npm run test:smoke:dist-mobile-css'), 0);

const sandboxOptions = parseOptions(['desktop-sandbox']);
const sandboxPlan = buildPlan(sandboxOptions, resolveRelease(sandboxOptions));
const skippedBuilds = sandboxPlan.filter((step) => step.label === 'Build');
assert(skippedBuilds.length >= 2);
assert(skippedBuilds.every((step) => step.status === 'skipped'));
assert(commands(sandboxPlan).includes('node scripts/verify-release.cjs --allow-no-build'));

console.log('GO: 10.85 release runner smoke matches the current single-pass release contract without side effects.');
