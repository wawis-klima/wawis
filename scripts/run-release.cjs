const { execSync } = require('node:child_process');
const { writeReleaseResult } = require('./write-release-result.cjs');
const { getReleaseGroups } = require('./test-groups.cjs');

const SUPPORTED = new Set(['full', 'mobile', 'desktop', 'desktop-sandbox']);

function parseOptions(args = process.argv.slice(2)) {
  const variant = args.find((arg) => SUPPORTED.has(arg)) || 'full';
  return {
    variant,
    dryRun: args.includes('--dry-run'),
    bumpVersion: args.includes('--bump-version') && !args.includes('--skip-version-bump'),
  };
}

function buildPlan({ variant, bumpVersion }) {
  const plan = [];
  const effectiveScope = variant === 'desktop-sandbox' ? 'desktop' : variant;

  if (bumpVersion) {
    plan.push({ label: 'Version', command: 'npm run version:bump' });
  }

  for (const group of getReleaseGroups(effectiveScope)) {
    plan.push({ label: `Tests:${group}`, command: `node scripts/run-test-group.cjs ${group}` });
  }

  if (effectiveScope === 'desktop' || effectiveScope === 'full') {
    plan.push({ label: 'E2E:desktop', command: 'npm run test:e2e:desktop' });
  }
  if (effectiveScope === 'mobile' || effectiveScope === 'full') {
    plan.push({ label: 'E2E:mobile', command: 'npm run test:e2e:mobile' });
  }

  if (variant === 'desktop-sandbox') {
    plan.push({
      label: 'Build',
      command: 'npm run build',
      status: 'skipped',
      reason: 'Tryb desktop-sandbox celowo nie wykonuje produkcyjnego builda.',
    });
    plan.push({
      label: 'Build',
      command: 'npm run verify:bundle',
      status: 'skipped',
      reason: 'Tryb desktop-sandbox celowo nie weryfikuje bundla.',
    });
  } else {
    plan.push({ label: 'Build', command: 'npm run build' });
    plan.push({ label: 'Build', command: 'npm run verify:bundle' });
    if (effectiveScope === 'mobile' || effectiveScope === 'full') {
      plan.push({ label: 'Build', command: 'npm run test:smoke:dist-mobile-css' });
    }
  }

  plan.push({ label: 'Verify', command: 'npm run verify:release' });
  plan.push({ label: 'Package', command: 'npm run zip:release' });
  plan.push({ label: 'Package', command: 'node scripts/verify-release.cjs --require-zip' });

  return plan;
}

function run(command) {
  process.stdout.write(`\n> ${command}\n`);
  execSync(command, {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
}

function runPlan(plan, { variant, dryRun }) {
  if (dryRun) {
    console.log(`WAWIS release plan (${variant}) — single pass`);
    plan.forEach((step, index) => {
      const suffix = step.status === 'skipped' ? ` [POMINIĘTO: ${step.reason}]` : '';
      console.log(`${index + 1}. ${step.label}: ${step.command}${suffix}`);
    });
    return;
  }

  const steps = [];
  writeReleaseResult({ variant, status: 'pending', steps });

  try {
    for (const step of plan) {
      if (step.status === 'skipped') {
        steps.push({ ...step });
        continue;
      }
      run(step.command);
      steps.push({ ...step, status: 'ok' });
      writeReleaseResult({ variant, status: 'pending', steps });
    }

    writeReleaseResult({ variant, status: 'ok', steps });
    console.log(`\nWAWIS RELEASE GO — ${variant}`);
  } catch (error) {
    const failedStep = plan[steps.length] || { label: 'unknown', command: 'unknown' };
    steps.push({ ...failedStep, status: 'error' });
    writeReleaseResult({ variant, status: 'error', steps, error });
    console.error(`\nWAWIS RELEASE NO-GO — ${failedStep.label}: ${failedStep.command}`);
    process.exit(error?.status || 1);
  }
}

const options = parseOptions();
const plan = buildPlan(options);
runPlan(plan, options);
