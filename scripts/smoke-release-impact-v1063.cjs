const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
  classifyEffectiveFiles,
  detectPlatforms,
  isCriticalPath,
  isPresentationOnly,
  selectDomainGroups,
} = require('./release-impact.cjs');
const {
  classifyMicroUi,
  isMicroUiFile,
} = require('./micro-ui-policy.cjs');

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

const microMobile = classifyMicroUi({ impact: { ...fastMobile, effective_files: ['src/mobile791/v1048-runtime-fix.css'] } });
assert.equal(microMobile.micro_ui, true);
assert.equal(microMobile.scope, 'mobile');
assert(microMobile.groups.includes('ui-fast-core'));
assert(microMobile.groups.includes('ui-fast-mobile'));
assert.equal(isMicroUiFile('src/mobile791/v1048-runtime-fix.css'), true);
assert.equal(isMicroUiFile('src/mobile791/components/jobs/MobileJobsLayout.jsx'), false);
assert.equal(isMicroUiFile('supabase/style.css'), false);

const fastGlobal = classifyEffectiveFiles(['src/styles.css']);
assert.equal(fastGlobal.profile, 'fast-ui');
assert.equal(fastGlobal.scope, 'full');
assert(fastGlobal.groups.includes('ui-fast-mobile'));
assert(fastGlobal.groups.includes('ui-fast-desktop'));
const microGlobal = classifyMicroUi({ impact: { ...fastGlobal, effective_files: ['src/styles.css'] } });
assert.equal(microGlobal.micro_ui, true);
assert.equal(microGlobal.scope, 'full');
assert(microGlobal.groups.includes('ui-fast-mobile'));
assert(microGlobal.groups.includes('ui-fast-desktop'));

const presentationAsset = classifyEffectiveFiles(['public/logo.png']);
assert.equal(presentationAsset.profile, 'fast-ui');
assert.equal(classifyMicroUi({ impact: { ...presentationAsset, effective_files: ['public/logo.png'] } }).micro_ui, false);

const targetedMobile = classifyEffectiveFiles(['src/mobile791/components/jobs/MobileJobsLayout.jsx']);
assert.equal(targetedMobile.profile, 'targeted');
assert.equal(targetedMobile.scope, 'mobile');
assert.deepEqual(targetedMobile.e2e, ['mobile']);
assert.equal(targetedMobile.needs_playwright, true);
assert(targetedMobile.groups.includes('mobile'));
assert(targetedMobile.groups.includes('jobs'));
assert.equal(classifyMicroUi({ impact: { ...targetedMobile, effective_files: ['src/mobile791/components/jobs/MobileJobsLayout.jsx'] } }).micro_ui, false);

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
assert.equal(classifyMicroUi({ impact: { ...criticalInfra, effective_files: ['scripts/run-release.cjs'] } }).micro_ui, false);

const criticalAuth = classifyEffectiveFiles(['src/hooks/useAppSession.js']);
assert.equal(criticalAuth.profile, 'critical');

assert.deepEqual(detectPlatforms(['src/mobile791/styles.css']), ['mobile']);
const globalPlatforms = detectPlatforms(['src/styles.css']);
assert(globalPlatforms.includes('mobile') && globalPlatforms.includes('desktop'));

const microGateSource = fs.readFileSync('scripts/micro-ui-deploy-gate.cjs', 'utf8');
new vm.Script(microGateSource, { filename: 'micro-ui-deploy-gate.cjs' });
assert.match(microGateSource, /classifyMicroUi/);
assert.match(microGateSource, /HEAD\^1/);
assert.match(microGateSource, /archive/);
assert.match(microGateSource, /blocking/);

const router = fs.readFileSync('scripts/deploy-gate-router.sh', 'utf8');
assert.match(router, /release_mode/);
assert.match(router, /micro-ui-deploy-gate\.cjs/);
assert.match(router, /release-policy-gate\.cjs --deploy/);

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.match(vercel.buildCommand || '', /deploy-gate-router\.sh/);
assert.match(vercel.buildCommand || '', /release-policy-gate\.cjs --deploy/);

const archive = fs.readFileSync('.github/workflows/micro-ui-archive.yml', 'utf8');
assert.match(archive, /branches:\s*\[main\]/);
assert.match(archive, /micro-ui-policy\.cjs/);
assert.match(archive, /upload-artifact/);

console.log('WAWIS release impact smoke OK: fast-ui, targeted, critical + strict MICRO UI CSS-only path');
