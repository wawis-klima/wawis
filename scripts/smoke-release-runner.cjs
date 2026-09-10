const assert = require('assert');
const {
  FULL_SMOKE_COMMANDS,
  MOBILE_SMOKE_COMMANDS,
  DESKTOP_SMOKE_COMMANDS,
  VERIFY_COMMANDS,
  BUILD_COMMANDS,
  FINAL_COMMANDS,
  SANDBOX_BUILD_SKIP_REASON,
  getVariant,
  getReleasePlan,
} = require('./run-release.cjs');

function commandsOnly(plan) {
  return plan.map((step) => step.command);
}

function count(commands, expectedCommand) {
  return commands.filter((command) => command === expectedCommand).length;
}

function assertTwice(commands, expectedCommand) {
  assert.strictEqual(
    count(commands, expectedCommand),
    2,
    `Command should be planned exactly twice: ${expectedCommand}`
  );
}

function assertCommonSmokeList(name, commands) {
  assert(commands.length > 0, `${name} smoke list is empty`);
  assert(commands.includes('npm run test:smoke:release-runner'), `${name} omits release-runner smoke`);
  assert(commands.includes('npm run test:smoke:windows-npm-runner'), `${name} omits Windows npm runner smoke`);
  assert(commands.includes('npm run test:smoke:npm-registry'), `${name} omits npm registry smoke`);
  assert(commands.includes('npm run test:smoke:assignment-push'), `${name} omits assignment push smoke`);
  assert(commands.includes('npm run test:smoke:release-zip'), `${name} omits release-zip smoke`);
  assert(commands.includes('npm run test:smoke:release-zip-clean'), `${name} omits release-zip-clean smoke`);
  assert(commands.includes('npm run test:smoke:job-multi-indoor'), `${name} omits multi indoor units smoke`);
  assert(commands.includes('npm run test:smoke:job-device-spaces'), `${name} omits job device spaces smoke`);
  assert(commands.includes('npm run test:smoke:startup-chunk'), `${name} omits startup chunk smoke`);
  assert(commands.includes('npm run test:smoke:supabase-grants'), `${name} omits Supabase GRANT smoke`);
  assert(!commands.some((command) => (
    command === 'npm run release'
    || command === 'npm run release:mobile'
    || command === 'npm run release:desktop'
  )), `${name} must not call release recursively`);
}

function assertMobilePhotoSmokes(name, commands) {
  for (const command of [
    'npm run test:smoke:realtime-lite',
    'npm run test:smoke:private-photos',
    'npm run test:smoke:mobile-private-photos',
    'npm run test:smoke:mobile-photo-compression',
    'npm run test:smoke:mobile-photo-upload-rls',
    'npm run test:smoke:mobile-photo-visibility-sync',
    'npm run test:smoke:photo-cross-device-sync',
    'npm run test:smoke:mobile-photo-sync-indicator',
    'npm run test:smoke:e2e-mobile',
    'npm run test:smoke:mobile-serial-scanner',
    'npm run test:e2e:mobile',
  ]) {
    assert(commands.includes(command), `${name} omits mobile photo smoke: ${command}`);
  }
}

assertCommonSmokeList('full', FULL_SMOKE_COMMANDS);
assertCommonSmokeList('mobile', MOBILE_SMOKE_COMMANDS);
assertCommonSmokeList('desktop', DESKTOP_SMOKE_COMMANDS);
for (const [label, commands] of [['full', FULL_SMOKE_COMMANDS], ['mobile', MOBILE_SMOKE_COMMANDS], ['desktop', DESKTOP_SMOKE_COMMANDS]]) {
  assert(commands.includes('npm run test:smoke:comment-delete-resilience'), `${label} omits comment delete resilience smoke`);
}
assert(FULL_SMOKE_COMMANDS.includes('npm run test:smoke:desktop-only'), 'full omits desktop-only smoke');
assert(FULL_SMOKE_COMMANDS.includes('npm run test:smoke:e2e-desktop'), 'full omits desktop E2E wiring smoke');
assert(DESKTOP_SMOKE_COMMANDS.includes('npm run test:smoke:desktop-only'), 'desktop omits desktop-only smoke');
assert(DESKTOP_SMOKE_COMMANDS.includes('npm run test:smoke:e2e-desktop'), 'desktop omits desktop E2E wiring smoke');
assert(FULL_SMOKE_COMMANDS.includes('npm run test:smoke:desktop-protocol'), 'full omits desktop saved protocol smoke');
assert(DESKTOP_SMOKE_COMMANDS.includes('npm run test:smoke:desktop-protocol'), 'desktop omits desktop saved protocol smoke');
assert(!MOBILE_SMOKE_COMMANDS.includes('npm run test:smoke:desktop-protocol'), 'mobile should not run desktop saved protocol smoke');
for (const command of [
  'npm run test:smoke:destructive-rls',
  'npm run test:smoke:center360',
  'npm run test:smoke:center360-personalization',
  'npm run test:smoke:center360-installer-width',
  'npm run test:smoke:dashboard-metrics',
  'npm run test:smoke:desktop-nameplate-white-screen',
  'npm run test:smoke:desktop-nameplate-ai-barcode',
  'npm run test:smoke:no-services-module',
  'npm run test:smoke:remove-resend-email',
  'npm run test:e2e:desktop',
]) {
  assert(FULL_SMOKE_COMMANDS.includes(command), `full omits important desktop check: ${command}`);
  assert(DESKTOP_SMOKE_COMMANDS.includes(command), `desktop omits important desktop check: ${command}`);
}
assertMobilePhotoSmokes('full', FULL_SMOKE_COMMANDS);
assertMobilePhotoSmokes('mobile', MOBILE_SMOKE_COMMANDS);
assert(FULL_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-ci'), 'full omits mobile CI workflow smoke');
assert(FULL_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-style-bootstrap'), 'full omits mobile CSS bootstrap smoke');
assert(MOBILE_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-ci'), 'mobile omits mobile CI workflow smoke');
assert(MOBILE_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-style-bootstrap'), 'mobile omits mobile CSS bootstrap smoke');
assert(FULL_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-default-installation-date'), 'full omits mobile default installation date smoke');
assert(MOBILE_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-default-installation-date'), 'mobile omits mobile default installation date smoke');
assert(FULL_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-protocol-layout'), 'full omits mobile protocol layout smoke');
assert(MOBILE_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-protocol-layout'), 'mobile omits mobile protocol layout smoke');
assert(FULL_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-protocol-save'), 'full omits mobile protocol save timeout smoke');
assert(MOBILE_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-protocol-save'), 'mobile omits mobile protocol save timeout smoke');
assert(FULL_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-protocol-email'), 'full omits firm protocol email smoke');
assert(MOBILE_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-protocol-email'), 'mobile omits firm protocol email smoke');
assert(!DESKTOP_SMOKE_COMMANDS.includes('npm run test:smoke:mobile-ci'), 'desktop should not run mobile CI workflow smoke');

assert.deepStrictEqual(VERIFY_COMMANDS, ['npm run verify:release'], 'Verify commands changed unexpectedly');
assert.deepStrictEqual(BUILD_COMMANDS, ['npm run build', 'npm run verify:bundle', 'npm run test:smoke:dist-mobile-css'], 'Build commands changed unexpectedly');
assert.deepStrictEqual(
  FINAL_COMMANDS,
  ['npm run zip:release', 'node scripts/verify-release.cjs --require-zip'],
  'Final release commands changed unexpectedly'
);

const fullPlan = commandsOnly(getReleasePlan('full'));
const mobilePlan = commandsOnly(getReleasePlan('mobile'));
const desktopPlan = commandsOnly(getReleasePlan('desktop'));
const desktopSandboxRawPlan = getReleasePlan('desktop-sandbox');
const desktopSandboxPlan = commandsOnly(desktopSandboxRawPlan);
const desktopNoBumpPlan = commandsOnly(getReleasePlan('desktop', { skipVersionBump: true }));

assert.strictEqual(fullPlan[0], 'npm run version:bump', 'Full release must start with version bump');
assert.strictEqual(mobilePlan[0], 'npm run version:bump', 'Mobile release must start with version bump');
assert.strictEqual(desktopPlan[0], 'npm run version:bump', 'Desktop release must start with version bump');
assert.strictEqual(desktopSandboxPlan[0], 'npm run version:bump', 'Desktop sandbox release must start with version bump');
assert.strictEqual(getVariant(['desktop-sandbox']), 'desktop-sandbox', 'getVariant must support desktop-sandbox');
assert.strictEqual(getVariant(['mobile']), 'mobile', 'getVariant must support mobile');
assert(!desktopNoBumpPlan.includes('npm run version:bump'), 'Skip-version-bump plan must not run version:bump');

for (const command of FULL_SMOKE_COMMANDS) {
  assertTwice(fullPlan, command);
}

for (const command of MOBILE_SMOKE_COMMANDS) {
  assertTwice(mobilePlan, command);
}

for (const command of DESKTOP_SMOKE_COMMANDS) {
  assertTwice(desktopPlan, command);
  assertTwice(desktopSandboxPlan, command);
}

assertTwice(fullPlan, 'npm run verify:release');
assertTwice(fullPlan, 'npm run build');
assertTwice(fullPlan, 'npm run verify:bundle');
assertTwice(fullPlan, 'npm run test:smoke:dist-mobile-css');
assertTwice(mobilePlan, 'npm run verify:release');
assertTwice(mobilePlan, 'npm run build');
assertTwice(mobilePlan, 'npm run verify:bundle');
assertTwice(mobilePlan, 'npm run test:smoke:dist-mobile-css');
assertTwice(desktopPlan, 'npm run verify:release');
assertTwice(desktopPlan, 'npm run build');
assertTwice(desktopPlan, 'npm run verify:bundle');
assertTwice(desktopPlan, 'npm run test:smoke:dist-mobile-css');
assertTwice(desktopSandboxPlan, 'npm run verify:release');
assertTwice(desktopSandboxPlan, 'npm run build');
assertTwice(desktopSandboxPlan, 'npm run verify:bundle');
assertTwice(desktopSandboxPlan, 'npm run test:smoke:dist-mobile-css');
for (const step of desktopSandboxRawPlan.filter((item) => item.label === 'Build')) {
  assert.strictEqual(step.status, 'skipped', 'Desktop sandbox build steps must be marked as skipped');
  assert.strictEqual(step.reason, SANDBOX_BUILD_SKIP_REASON, 'Desktop sandbox skipped build steps must explain sandbox policy');
}

assert.strictEqual(count(fullPlan, 'npm run zip:release'), 1, 'Full release should create ZIP once');
assert.strictEqual(count(mobilePlan, 'npm run zip:release'), 1, 'Mobile release should create ZIP once');
assert.strictEqual(count(desktopPlan, 'npm run zip:release'), 1, 'Desktop release should create ZIP once');
assert.strictEqual(count(desktopSandboxPlan, 'npm run zip:release'), 1, 'Desktop sandbox release should create ZIP once');
assert.strictEqual(count(fullPlan, 'node scripts/verify-release.cjs --require-zip'), 1, 'Full release should verify ZIP once');
assert.strictEqual(count(mobilePlan, 'node scripts/verify-release.cjs --require-zip'), 1, 'Mobile release should verify ZIP once');
assert.strictEqual(count(desktopPlan, 'node scripts/verify-release.cjs --require-zip'), 1, 'Desktop release should verify ZIP once');
assert.strictEqual(count(desktopSandboxPlan, 'node scripts/verify-release.cjs --require-zip'), 1, 'Desktop sandbox release should verify ZIP once');

assert(fullPlan.indexOf('npm run build') < fullPlan.indexOf('npm run zip:release'), 'Full release must build before ZIP');
assert(mobilePlan.indexOf('npm run build') < mobilePlan.indexOf('npm run zip:release'), 'Mobile release must build before ZIP');
assert(desktopPlan.indexOf('npm run build') < desktopPlan.indexOf('npm run zip:release'), 'Desktop release must build before ZIP');
assert(desktopSandboxPlan.indexOf('npm run build') < desktopSandboxPlan.indexOf('npm run zip:release'), 'Desktop sandbox must document skipped build before ZIP');
assert.strictEqual(
  count(mobilePlan, 'node scripts/write-release-result.cjs --pending --variant mobile'),
  1,
  'Mobile release should initialize RELEASE-RESULT.md once'
);

console.log('Smoke OK: release runner command plan is complete and build-safe');

process.exit(0);
