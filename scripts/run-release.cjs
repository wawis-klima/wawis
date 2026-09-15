const { execSync } = require('node:child_process');
const { writeReleaseResult } = require('./write-release-result.cjs');
const { getReleaseGroups } = require('./test-groups.cjs');
const { classifyRelease } = require('./release-impact.cjs');

const SUPPORTED = new Set(['auto', 'full', 'mobile', 'desktop', 'desktop-sandbox']);

function valueAfter(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || fallback) : fallback;
}

function parseOptions(args = process.argv.slice(2)) {
  const variant = args.find((arg) => SUPPORTED.has(arg)) || 'auto';
  return {
    variant,
    dryRun: args.includes('--dry-run'),
    bumpVersion: args.includes('--bump-version') && !args.includes('--skip-version-bump'),
    baseRef: valueAfter(args, '--base-ref', process.env.WAWIS_RELEASE_BASE_REF || 'origin/main'),
  };
}

function resolveRelease(options) {
  if (options.variant !== 'auto') {
    const effectiveScope = options.variant === 'desktop-sandbox' ? 'desktop' : options.variant;
    return {
      requestedVariant: options.variant,
      profile: options.variant === 'desktop-sandbox' ? 'sandbox' : 'manual',
      scope: effectiveScope,
      groups: getReleaseGroups(effectiveScope),
      e2e: effectiveScope === 'full' ? ['desktop', 'mobile'] : [effectiveScope],
      platforms: effectiveScope === 'full' ? ['mobile', 'desktop'] : [effectiveScope],
      reason: 'Ręcznie wybrany zakres wydania.',
    };
  }

  const impact = classifyRelease({ baseRef: options.baseRef });
  return {
    requestedVariant: 'auto',
    ...impact,
  };
}

function buildPlan(options, release) {
  const plan = [];
  const isSandbox = options.variant === 'desktop-sandbox';

  if (options.bumpVersion) {
    plan.push({ label: 'Version', command: 'npm run version:bump' });
  }

  for (const group of release.groups) {
    plan.push({ label: `Tests:${group}`, command: `node scripts/run-test-group.cjs ${group}` });
  }

  for (const platform of release.e2e) {
    plan.push({ label: `E2E:${platform}`, command: `npm run test:e2e:${platform}` });
  }

  if (isSandbox) {
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
    plan.push({ label: 'Verify', command: 'node scripts/verify-release.cjs --allow-no-build' });
  } else {
    plan.push({ label: 'Build', command: 'npm run build' });
    plan.push({ label: 'Build', command: 'npm run verify:bundle' });
    if (release.platforms.includes('mobile')) {
      plan.push({ label: 'Build', command: 'npm run test:smoke:dist-mobile-css' });
    }
    plan.push({ label: 'Verify', command: 'npm run verify:release' });
  }

  plan.push({ label: 'Package', command: 'npm run zip:release' });
  plan.push({
    label: 'Package',
    command: isSandbox
      ? 'node scripts/verify-release.cjs --require-zip --allow-no-build'
      : 'node scripts/verify-release.cjs --require-zip',
  });

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

function releaseLabel(release) {
  if (release.requestedVariant !== 'auto') return release.requestedVariant;
  return `auto:${release.profile}/${release.scope}`;
}

function runPlan(plan, options, release) {
  const variant = releaseLabel(release);
  console.log(`WAWIS release profile: ${release.profile} / ${release.scope}`);
  console.log(`Powód: ${release.reason}`);
  console.log(`Grupy: ${release.groups.join(', ')}`);
  console.log(`E2E: ${release.e2e.length ? release.e2e.join(', ') : 'pominięte'}`);

  if (options.dryRun) {
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
const release = resolveRelease(options);
const plan = buildPlan(options, release);
runPlan(plan, options, release);
