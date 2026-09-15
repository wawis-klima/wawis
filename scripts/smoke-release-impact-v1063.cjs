const assert = require('node:assert/strict');
const {
  classifyEffectiveFiles,
  detectPlatforms,
  isCriticalPath,
  isPresentationOnly,
  selectDomainGroups,
} = require('./release-impact.cjs');

assert.equal(isPresentationOnly('src/mobile791/v1048-runtime-fix.css'), true);
assert.equal(isPresentationOnly('src/mobile791/components/jobs/MobileJobsLayout.jsx'), false);
assert.equal(isCriticalPath('supabase/migrations/current/example.sql'), true);
assert.equal(isCriticalPath('.github/workflows/release-checks.yml'), true);
assert.equal(isCriticalPath('src/mobile791/components/jobs/MobileJobsLayout.jsx'), false);

const fastMobile = classifyEffectiveFiles(['src/mobile791/v1048-runtime-fix.css']);
assert.equal(fastMobile.profile, 'fast-ui');
assert.equal(fastMobile.scope, 'mobile');
assert.deepEqual(fastMobile.e2e, []);
assert.equal(fastMobile.needs_playwright, false);
assert(fastMobile.groups.includes('ui-fast-mobile'));
assert(!fastMobile.groups.includes('photos'));

const fastGlobal = classifyEffectiveFiles(['src/styles.css']);
assert.equal(fastGlobal.profile, 'fast-ui');
assert.equal(fastGlobal.scope, 'full');
assert(fastGlobal.groups.includes('ui-fast-mobile'));
assert(fastGlobal.groups.includes('ui-fast-desktop'));

const targetedMobile = classifyEffectiveFiles(['src/mobile791/components/jobs/MobileJobsLayout.jsx']);
assert.equal(targetedMobile.profile, 'targeted');
assert.equal(targetedMobile.scope, 'mobile');
assert.deepEqual(targetedMobile.e2e, ['mobile']);
assert.equal(targetedMobile.needs_playwright, true);
assert(targetedMobile.groups.includes('mobile'));
assert(targetedMobile.groups.includes('jobs'));

const targetedFuel = selectDomainGroups(['src/components/fuel/FuelPanel.jsx']);
assert(targetedFuel.includes('fuel'));
assert(targetedFuel.includes('desktop'));
assert(targetedFuel.includes('core'));

const criticalInfra = classifyEffectiveFiles(['scripts/run-release.cjs']);
assert.equal(criticalInfra.profile, 'critical');
assert.equal(criticalInfra.scope, 'full');
assert.deepEqual(criticalInfra.e2e, ['mobile', 'desktop']);
assert(criticalInfra.groups.includes('infra'));
assert(criticalInfra.groups.includes('photos'));

const criticalAuth = classifyEffectiveFiles(['src/hooks/useAppSession.js']);
assert.equal(criticalAuth.profile, 'critical');

assert.deepEqual(detectPlatforms(['src/mobile791/styles.css']), ['mobile']);
const globalPlatforms = detectPlatforms(['src/styles.css']);
assert(globalPlatforms.includes('mobile') && globalPlatforms.includes('desktop'));

console.log('WAWIS release impact 10.63 smoke OK: fast-ui, targeted and critical profiles');
