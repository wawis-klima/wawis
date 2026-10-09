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

// Every UI style change can affect positions, stacking and hit targets.
// Force E2E on the affected platform; even an isolated sidebar CSS change
// cannot silently disable interaction checks.
const visualMobile = classifyEffectiveFiles(['src/mobile791/v1048-runtime-fix.css']);
assert.equal(visualMobile.profile, 'targeted');
assert.equal(visualMobile.scope, 'mobile');
assert.deepEqual(visualMobile.visual_surfaces, ['mobile']);
assert.deepEqual(visualMobile.e2e, ['mobile']);
assert.equal(visualMobile.needs_playwright, true);
assert(visualMobile.groups.includes('mobile'));

const microMobile = classifyMicroUi({ impact: { ...visualMobile, effective_files: ['src/mobile791/v1048-runtime-fix.css'] } });
assert.equal(microMobile.micro_ui, false);
assert.equal(microMobile.scope, 'mobile');
assert.equal(isMicroUiFile('src/mobile791/v1048-runtime-fix.css'), true);
assert.equal(isMicroUiFile('src/mobile791/components/jobs/MobileJobsLayout.jsx'), false);
assert.equal(isMicroUiFile('supabase/style.css'), false);

const visualGlobal = classifyEffectiveFiles(['src/styles.css']);
assert.equal(visualGlobal.profile, 'targeted');
assert.equal(visualGlobal.scope, 'full');
assert.deepEqual(visualGlobal.visual_surfaces, ['mobile', 'desktop']);
assert.deepEqual(visualGlobal.e2e, ['mobile', 'desktop']);
assert(visualGlobal.groups.includes('mobile') && visualGlobal.groups.includes('desktop'));
const microGlobal = classifyMicroUi({ impact: { ...visualGlobal, effective_files: ['src/styles.css'] } });
assert.equal(microGlobal.micro_ui, false);
assert.equal(microGlobal.scope, 'full');

const presentationAsset = classifyEffectiveFiles(['public/logo.png']);
assert.equal(presentationAsset.profile, 'fast-ui');
assert.equal(classifyMicroUi({ impact: { ...presentationAsset, effective_files: ['public/logo.png'] } }).micro_ui, false);

// Permanent cross-module regression: WAWIS 12.85 looked visually correct
// but its clipped wizard hid the OCR review in a child modal.
// CSS-only changes to an interaction seam MUST NOT qualify for FAST/MICRO UI.
const wizardCss = classifyEffectiveFiles(['src/mobile791/components/devices/mobile-device-wizard.css']);
assert.equal(wizardCss.profile, 'targeted');
assert.deepEqual(wizardCss.e2e, ['mobile']);
assert.equal(wizardCss.needs_playwright, true);
assert.deepEqual(wizardCss.interaction_flows, ['device-photo-nameplate', 'device-protocol-completion']);
for (const group of ['jobs', 'photos', 'nameplates', 'protocol', 'mobile']) {
  assert(wizardCss.groups.includes(group), 'Missing dependent regression group: ' + group);
}
assert.deepEqual(wizardCss.groups, wizardCss.pr_groups);
assert.equal(classifyMicroUi({ impact: { ...wizardCss, effective_files: ['src/mobile791/components/devices/mobile-device-wizard.css'] } }).micro_ui, false);

const reviewCss = classifyEffectiveFiles(['src/mobile791/components/nameplate/nameplate-photo-capture.css']);
assert.equal(reviewCss.profile, 'targeted');
assert.deepEqual(reviewCss.interaction_flows, ['device-photo-nameplate']);
assert.deepEqual(reviewCss.e2e, ['mobile']);
assert(reviewCss.groups.includes('photos') && reviewCss.groups.includes('nameplates'));
const overlayCode = classifyEffectiveFiles(['src/mobile791/components/modals/AppModal.jsx']);
assert(overlayCode.interaction_flows.includes('device-photo-nameplate'));
assert.deepEqual(overlayCode.e2e, ['mobile']);
const globalMobileCss = classifyEffectiveFiles(['src/mobile791/styles.css']);
assert(globalMobileCss.interaction_flows.includes('device-photo-nameplate'));
assert(globalMobileCss.needs_playwright);

const invoiceFlow = classifyEffectiveFiles(['src/components/modals/JobFormModal.jsx']);
assert(invoiceFlow.interaction_flows.includes('customer-invoice'));
assert(invoiceFlow.groups.includes('jobs') && invoiceFlow.groups.includes('desktop'));
assert(invoiceFlow.e2e.includes('desktop'));
const smsFlow = classifyEffectiveFiles(['src/components/SmsPanel.jsx']);
assert(smsFlow.interaction_flows.includes('sms-queue-delivery-history'));
assert(smsFlow.groups.includes('jobs') && smsFlow.groups.includes('sms'));
assert.deepEqual(smsFlow.e2e, ['desktop', 'mobile']);
const pushFlow = classifyEffectiveFiles(['src/mobile791/hooks/useSelectedJobActions.js']);
assert(pushFlow.interaction_flows.includes('job-completion-push'));
assert(pushFlow.groups.includes('push') && pushFlow.groups.includes('jobs'));
assert(pushFlow.e2e.includes('mobile'));

const sidebarCss = classifyEffectiveFiles(['src/mobile791/components/navigation/sidebar.css']);
assert.equal(sidebarCss.profile, 'targeted');
assert.equal(sidebarCss.needs_playwright, true);
assert.deepEqual(sidebarCss.interaction_flows, []);
assert.deepEqual(sidebarCss.visual_surfaces, ['mobile']);
assert.deepEqual(sidebarCss.e2e, ['mobile']);

const desktopCss = classifyEffectiveFiles(['src/components/fuel/fuel-panel.css']);
assert.equal(desktopCss.profile, 'targeted');
assert.deepEqual(desktopCss.visual_surfaces, ['desktop']);
assert.deepEqual(desktopCss.e2e, ['desktop']);
assert(desktopCss.groups.includes('fuel'));
const sharedLogo = classifyEffectiveFiles(['src/assets/logo.svg']);
assert.equal(sharedLogo.profile, 'targeted');
assert.deepEqual(sharedLogo.visual_surfaces, ['mobile', 'desktop']);
assert.deepEqual(sharedLogo.e2e, ['mobile', 'desktop']);
// Static assets without a UI surface remain FAST UI and avoid Playwright.
const staticImage = classifyEffectiveFiles(['public/logo.png']);
assert.equal(staticImage.profile, 'fast-ui');
assert.equal(staticImage.needs_playwright, false);

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

assert.equal(fs.existsSync('.github/workflows/micro-ui-archive.yml'), false, 'MICRO UI nie może ponownie wymagać osobnego workflow ZIP/archive');
assert.equal(fs.existsSync('.github/workflows/post-deploy-checks.yml'), false, 'Nie może wrócić osobny blokujący post-deploy workflow');
assert.equal(fs.existsSync('.github/workflows/release-checks.yml'), false, 'Nie może wrócić dublujący final release workflow');

console.log('WAWIS release impact smoke OK: all module styles and UI graphics trigger platform E2E; cross-module flows and version/docs remain intact');
