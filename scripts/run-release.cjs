const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { writeReleaseResult } = require('./write-release-result.cjs');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const FULL_SMOKE_COMMANDS = [
  'npm run test:smoke',
  'npm run test:smoke:version',
  'npm run test:smoke:client-voice',
  'npm run test:smoke:delete',
  'npm run test:smoke:comment-delete-resilience',
  'npm run test:smoke:device-save',
  'npm run test:smoke:job-multi-indoor',
  'npm run test:smoke:job-device-type-switch',
  'npm run test:smoke:job-device-spaces',
  'npm run test:smoke:device-delete',
  'npm run test:smoke:job-auto-contractor',
  'npm run test:smoke:assignment-push',
  'npm run test:smoke:supabase-transient',
  'npm run test:smoke:cache-first-refresh',
  'npm run test:smoke:push-reliability',
  'npm run test:smoke:comment-admin-push',
  'npm run test:smoke:source-job-id-hotfix',
  'npm run test:smoke:empty-device-serial',
  'npm run test:smoke:supabase-grants',
  'npm run test:smoke:destructive-rls',
  'npm run test:smoke:device-client-fallback',
  'npm run test:smoke:job-contractor-link',
  'npm run test:smoke:job-contractor-conflict',
  'npm run test:smoke:contractor-addresses',
  'npm run test:smoke:sms-summary',
  'npm run test:smoke:sms-job-grouping',
  'npm run test:smoke:sms-log-cleanup',
  'npm run test:smoke:center360',
  'npm run test:smoke:center360-personalization',
  'npm run test:smoke:center360-installer-width',
  'npm run test:smoke:dashboard-metrics',
  'npm run test:smoke:desktop-refresh',
  'npm run test:smoke:desktop-only',
  'npm run test:smoke:desktop-jobs-layout-width',
  'npm run test:smoke:desktop-jobs-split-scroll',
  'npm run test:smoke:desktop-job-details-polish',
  'npm run test:smoke:desktop-protocol',
  'npm run test:smoke:desktop-device-wizard-polish',
  'npm run test:smoke:nameplate-rendering',
  'npm run test:smoke:photo-preview-gallery-separation',
  'npm run test:smoke:desktop-nameplate-ocr',
  'npm run test:smoke:desktop-nameplate-white-screen',
  'npm run test:smoke:desktop-nameplate-ai-barcode',
  'npm run test:smoke:desktop-nameplate-read-resilience',
  'npm run test:smoke:desktop-nameplate-source-persistence',
  'npm run test:smoke:desktop-nameplate-automatic-fallback',
  'npm run test:smoke:desktop-nameplate-ean-separation',
  'npm run test:smoke:desktop-nameplate-universal-reader',
  'npm run test:smoke:desktop-nameplate-layout-profiles',
  'npm run test:smoke:desktop-nameplate-verification-status',
  'npm run test:smoke:nameplate-product-catalog',
  'npm run test:smoke:desktop-global-search',
  'npm run test:smoke:desktop-cross-module-panels',
  'npm run test:smoke:release-runner',
  'npm run test:smoke:diagnostic-report',
  'npm run test:smoke:diagnostics-clarity',
  'npm run test:smoke:release-visual-controls',
  'npm run test:smoke:windows-npm-runner',
  'npm run test:smoke:npm-registry',
  'npm run test:smoke:mobile-ci',
  'npm run test:smoke:mobile-style-bootstrap',
  'npm run test:smoke:mobile-device-table',
  'npm run test:smoke:release-zip',
  'npm run test:smoke:release-zip-clean',
  'npm run test:smoke:sidebar-settings',
  'npm run test:smoke:regex-compat',
  'npm run test:smoke:admin-worker',
  'npm run test:smoke:lazy',
  'npm run test:smoke:suspense',
  'npm run test:smoke:selection',
  'npm run test:smoke:sms-client-details',
  'npm run test:smoke:sms-navigation',
  'npm run test:smoke:sms-street',
  'npm run test:smoke:sms-street-sql',
  'npm run test:smoke:calendar-sidebar',
  'npm run test:smoke:calendar-width',
  'npm run test:smoke:e2e-desktop',
  'npm run test:e2e:desktop',
  'npm run test:smoke:visual-artifacts:desktop',
  'npm run test:smoke:startup-chunk',
  'npm run test:smoke:no-services-module',
  'npm run test:smoke:remove-resend-email',
  'npm run test:smoke:realtime-lite',
  'npm run test:smoke:private-photos',
  'npm run test:smoke:mobile-private-photos',
  'npm run test:smoke:mobile-photo-compression',
  'npm run test:smoke:mobile-photo-upload-rls',
  'npm run test:smoke:mobile-photo-visibility-sync',
  'npm run test:smoke:mobile-thumbnail-recovery',
  'npm run test:smoke:photo-cross-device-sync',
  'npm run test:smoke:mobile-photo-sync-indicator',
  'npm run test:smoke:mobile-photo-sync-center',
  'npm run test:smoke:mobile-nameplate-save-resilience',
  'npm run test:smoke:mobile-ui-copy',
  'npm run test:smoke:mobile-admin-header',
  'npm run test:smoke:mobile-new-job-no-devices',
  'npm run test:smoke:push-mobile-reassignment',
  'npm run test:smoke:mobile-worker-add-client',
  'npm run test:smoke:worker-create-status',
  'npm run test:smoke:technical-refresh',
  'npm run test:smoke:reliable-sync',
  'npm run test:smoke:mobile-protocol',
  'npm run test:smoke:mobile-protocol-save',
  'npm run test:smoke:mobile-protocol-print',
  'npm run test:smoke:mobile-protocol-layout',
  'npm run test:smoke:mobile-protocol-email',
  'npm run test:smoke:mobile-default-installation-date',
  'npm run test:smoke:mobile-new-job-comment',
  'npm run test:smoke:mobile-new-job-sms-defaults',
  'npm run test:smoke:e2e-mobile',
  'npm run test:smoke:mobile-serial-scanner',
  'npm run test:smoke:nameplate-finish-verification',
  'npm run test:smoke:mobile-offline-photo-queue',
  'npm run test:smoke:mobile-full-offline',
  'npm run test:smoke:mobile-photo-idempotency',
  'npm run test:smoke:nameplate-quality',
  'npm run test:smoke:rotenso-model-history',
  'npm run test:e2e:mobile',
  'npm run test:smoke:visual-artifacts:mobile',
];

const MOBILE_SMOKE_COMMANDS = [
  'npm run test:smoke',
  'npm run test:smoke:version',
  'npm run test:smoke:client-voice',
  'npm run test:smoke:delete',
  'npm run test:smoke:comment-delete-resilience',
  'npm run test:smoke:device-save',
  'npm run test:smoke:job-multi-indoor',
  'npm run test:smoke:job-device-type-switch',
  'npm run test:smoke:job-device-spaces',
  'npm run test:smoke:device-delete',
  'npm run test:smoke:job-auto-contractor',
  'npm run test:smoke:assignment-push',
  'npm run test:smoke:supabase-transient',
  'npm run test:smoke:cache-first-refresh',
  'npm run test:smoke:push-reliability',
  'npm run test:smoke:comment-admin-push',
  'npm run test:smoke:source-job-id-hotfix',
  'npm run test:smoke:empty-device-serial',
  'npm run test:smoke:supabase-grants',
  'npm run test:smoke:device-client-fallback',
  'npm run test:smoke:job-contractor-link',
  'npm run test:smoke:job-contractor-conflict',
  'npm run test:smoke:contractor-addresses',
  'npm run test:smoke:admin-worker',
  'npm run test:smoke:lazy',
  'npm run test:smoke:suspense',
  'npm run test:smoke:selection',
  'npm run test:smoke:regex-compat',
  'npm run test:smoke:release-runner',
  'npm run test:smoke:diagnostic-report',
  'npm run test:smoke:diagnostics-clarity',
  'npm run test:smoke:release-visual-controls',
  'npm run test:smoke:windows-npm-runner',
  'npm run test:smoke:npm-registry',
  'npm run test:smoke:mobile-ci',
  'npm run test:smoke:mobile-style-bootstrap',
  'npm run test:smoke:mobile-device-table',
  'npm run test:smoke:release-zip',
  'npm run test:smoke:release-zip-clean',
  'npm run test:smoke:startup-chunk',
  'npm run test:smoke:realtime-lite',
  'npm run test:smoke:private-photos',
  'npm run test:smoke:mobile-private-photos',
  'npm run test:smoke:mobile-photo-compression',
  'npm run test:smoke:mobile-photo-upload-rls',
  'npm run test:smoke:mobile-photo-visibility-sync',
  'npm run test:smoke:mobile-thumbnail-recovery',
  'npm run test:smoke:photo-cross-device-sync',
  'npm run test:smoke:mobile-photo-sync-indicator',
  'npm run test:smoke:mobile-photo-sync-center',
  'npm run test:smoke:mobile-nameplate-save-resilience',
  'npm run test:smoke:mobile-ui-copy',
  'npm run test:smoke:mobile-admin-header',
  'npm run test:smoke:mobile-new-job-no-devices',
  'npm run test:smoke:push-mobile-reassignment',
  'npm run test:smoke:mobile-worker-add-client',
  'npm run test:smoke:worker-create-status',
  'npm run test:smoke:technical-refresh',
  'npm run test:smoke:reliable-sync',
  'npm run test:smoke:mobile-protocol',
  'npm run test:smoke:mobile-protocol-save',
  'npm run test:smoke:mobile-protocol-print',
  'npm run test:smoke:mobile-protocol-layout',
  'npm run test:smoke:mobile-protocol-email',
  'npm run test:smoke:mobile-default-installation-date',
  'npm run test:smoke:mobile-new-job-comment',
  'npm run test:smoke:mobile-new-job-sms-defaults',
  'npm run test:smoke:e2e-mobile',
  'npm run test:smoke:mobile-serial-scanner',
  'npm run test:smoke:nameplate-finish-verification',
  'npm run test:smoke:mobile-offline-photo-queue',
  'npm run test:smoke:mobile-full-offline',
  'npm run test:smoke:mobile-photo-idempotency',
  'npm run test:smoke:nameplate-quality',
  'npm run test:smoke:rotenso-model-history',
  'npm run test:smoke:nameplate-rendering',
  'npm run test:smoke:photo-preview-gallery-separation',
  'npm run test:e2e:mobile',
  'npm run test:smoke:visual-artifacts:mobile',
];

const DESKTOP_SMOKE_COMMANDS = [
  'npm run test:smoke',
  'npm run test:smoke:version',
  'npm run test:smoke:client-voice',
  'npm run test:smoke:delete',
  'npm run test:smoke:comment-delete-resilience',
  'npm run test:smoke:device-save',
  'npm run test:smoke:job-multi-indoor',
  'npm run test:smoke:job-device-type-switch',
  'npm run test:smoke:job-device-spaces',
  'npm run test:smoke:device-delete',
  'npm run test:smoke:job-auto-contractor',
  'npm run test:smoke:contractor-addresses',
  'npm run test:smoke:assignment-push',
  'npm run test:smoke:supabase-transient',
  'npm run test:smoke:cache-first-refresh',
  'npm run test:smoke:push-reliability',
  'npm run test:smoke:comment-admin-push',
  'npm run test:smoke:source-job-id-hotfix',
  'npm run test:smoke:empty-device-serial',
  'npm run test:smoke:supabase-grants',
  'npm run test:smoke:destructive-rls',
  'npm run test:smoke:sms-summary',
  'npm run test:smoke:sms-job-grouping',
  'npm run test:smoke:sms-log-cleanup',
  'npm run test:smoke:center360',
  'npm run test:smoke:center360-personalization',
  'npm run test:smoke:center360-installer-width',
  'npm run test:smoke:dashboard-metrics',
  'npm run test:smoke:admin-worker',
  'npm run test:smoke:lazy',
  'npm run test:smoke:suspense',
  'npm run test:smoke:selection',
  'npm run test:smoke:desktop-only',
  'npm run test:smoke:desktop-jobs-layout-width',
  'npm run test:smoke:desktop-jobs-split-scroll',
  'npm run test:smoke:desktop-job-details-polish',
  'npm run test:smoke:desktop-protocol',
  'npm run test:smoke:desktop-device-wizard-polish',
  'npm run test:smoke:nameplate-rendering',
  'npm run test:smoke:photo-preview-gallery-separation',
  'npm run test:smoke:desktop-nameplate-ocr',
  'npm run test:smoke:desktop-nameplate-white-screen',
  'npm run test:smoke:desktop-nameplate-ai-barcode',
  'npm run test:smoke:desktop-nameplate-read-resilience',
  'npm run test:smoke:desktop-nameplate-source-persistence',
  'npm run test:smoke:desktop-nameplate-automatic-fallback',
  'npm run test:smoke:desktop-nameplate-ean-separation',
  'npm run test:smoke:desktop-nameplate-universal-reader',
  'npm run test:smoke:desktop-nameplate-layout-profiles',
  'npm run test:smoke:desktop-nameplate-verification-status',
  'npm run test:smoke:nameplate-product-catalog',
  'npm run test:smoke:desktop-global-search',
  'npm run test:smoke:desktop-cross-module-panels',
  'npm run test:smoke:release-runner',
  'npm run test:smoke:diagnostic-report',
  'npm run test:smoke:diagnostics-clarity',
  'npm run test:smoke:release-visual-controls',
  'npm run test:smoke:windows-npm-runner',
  'npm run test:smoke:npm-registry',
  'npm run test:smoke:release-zip',
  'npm run test:smoke:release-zip-clean',
  'npm run test:smoke:calendar-width',
  'npm run test:smoke:e2e-desktop',
  'npm run test:e2e:desktop',
  'npm run test:smoke:visual-artifacts:desktop',
  'npm run test:smoke:startup-chunk',
  'npm run test:smoke:no-services-module',
  'npm run test:smoke:remove-resend-email',
  'npm run test:smoke:technical-refresh',
];

const VERIFY_COMMANDS = ['npm run verify:release'];
const BUILD_COMMANDS = ['npm run build', 'npm run verify:bundle', 'npm run test:smoke:dist-mobile-css'];
const SANDBOX_BUILD_SKIP_REASON = 'Pominięto w trybie release:desktop:sandbox zgodnie z zasadą pracy w sandboxie bez npm run build.';
const FINAL_COMMANDS = [
  'npm run zip:release',
  'node scripts/verify-release.cjs --require-zip',
];

function getVariant(args = process.argv.slice(2)) {
  const explicitVariant = args.find((arg) => arg === 'full' || arg === 'mobile' || arg === 'desktop' || arg === 'desktop-sandbox');
  return explicitVariant || 'full';
}

function pushTwice(plan, label, commands) {
  for (let pass = 1; pass <= 2; pass += 1) {
    for (const command of commands) {
      plan.push({ label, pass, command });
    }
  }
}

function pushSkippedTwice(plan, label, commands, reason) {
  for (let pass = 1; pass <= 2; pass += 1) {
    for (const command of commands) {
      plan.push({ label, pass, command, status: 'skipped', reason });
    }
  }
}

function getReleasePlan(variant = 'full', options = {}) {
  if (!['full', 'mobile', 'desktop', 'desktop-sandbox'].includes(variant)) {
    throw new Error(`Unsupported release variant: ${variant}`);
  }

  const plan = [];
  const isDesktopVariant = variant === 'desktop' || variant === 'desktop-sandbox';
  const smokeCommands = variant === 'mobile'
    ? MOBILE_SMOKE_COMMANDS
    : isDesktopVariant
      ? DESKTOP_SMOKE_COMMANDS
      : FULL_SMOKE_COMMANDS;

  if (!options.skipVersionBump) {
    plan.push({ label: 'Version', pass: 1, command: 'npm run version:bump' });
  }
  plan.push({
    label: 'Report',
    pass: 1,
    command: `node scripts/write-release-result.cjs --pending --variant ${variant}`,
  });

  pushTwice(plan, 'Smoke', smokeCommands);
  pushTwice(plan, 'Verify', VERIFY_COMMANDS);
  if (variant === 'desktop-sandbox') {
    pushSkippedTwice(plan, 'Build', BUILD_COMMANDS, SANDBOX_BUILD_SKIP_REASON);
  } else {
    pushTwice(plan, 'Build', BUILD_COMMANDS);
  }
  for (const command of FINAL_COMMANDS) {
    plan.push({ label: 'Package', pass: 1, command });
  }

  return plan;
}

function splitChainedCommand(command) {
  return String(command).split(/\s+&&\s+/).map((part) => part.trim()).filter(Boolean);
}

function splitArgs(command) {
  const matches = String(command).match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((part) => part.replace(/^(["'])(.*)\1$/, '$2'));
}

function runSpawn(command, args, displayCommand) {
  try {
    const output = execFileSync(command, args, {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (output) process.stdout.write(output);
  } catch (error) {
    const status = error?.status ?? error?.signal ?? 'unknown';
    throw new Error(`Command failed with exit code ${status}: ${displayCommand}`);
  }
}

function runSingleCommand(command, seenScripts = []) {
  const npmRunMatch = command.match(/^npm\s+run\s+([^\s]+)(?:\s+--\s*(.*))?$/);
  if (npmRunMatch) {
    const scriptName = npmRunMatch[1];
    const scriptCommand = packageJson.scripts?.[scriptName];
    if (!scriptCommand) throw new Error(`Unknown npm script: ${scriptName}`);
    if (seenScripts.includes(scriptName)) throw new Error(`Recursive npm script detected: ${scriptName}`);
    const extraArgs = String(npmRunMatch[2] || '').trim();
    const resolvedCommand = extraArgs ? `${scriptCommand} ${extraArgs}` : scriptCommand;
    for (const part of splitChainedCommand(resolvedCommand)) {
      runSingleCommand(part, [...seenScripts, scriptName]);
    }
    return;
  }

  const parts = splitArgs(command);
  if (parts[0] === 'node') {
    runSpawn(process.execPath, parts.slice(1), command);
    return;
  }

  try {
    const output = execSync(command, {
      cwd: root,
      env: process.env,
      shell: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (output) process.stdout.write(output);
  } catch (error) {
    const status = error?.status ?? error?.signal ?? 'unknown';
    throw new Error(`Command failed with exit code ${status}: ${command}`);
  }
}

function runCommand(command) {
  console.log(`\n> ${command}`);
  for (const part of splitChainedCommand(command)) {
    runSingleCommand(part);
  }
}

function runPlan(plan, options = {}) {
  let previousGroup = '';
  const executedSteps = [];
  let finalReportPrepared = false;

  for (let index = 0; index < plan.length; index += 1) {
    const step = plan[index];
    const group = `${step.label} ${step.pass}/2`;
    if (step.label !== 'Version' && step.label !== 'Package' && group !== previousGroup) {
      console.log(`\n=== ${group} ===`);
      previousGroup = group;
    }

    try {
      if (step.label === 'Package' && options.writeReport !== false && !finalReportPrepared) {
        const projectedPackageSteps = plan
          .slice(index)
          .filter((item) => item.label === 'Package')
          .map((item) => ({ ...item, status: 'ok' }));
        writeReleaseResult({
          variant: options.variant || 'full',
          status: 'ok',
          steps: [...executedSteps, ...projectedPackageSteps],
        });
        finalReportPrepared = true;
      }

      if (step.status === 'skipped') {
        console.log(`\n- skipped: ${step.command} (${step.reason || 'skipped'})`);
        executedSteps.push({ ...step, status: 'skipped' });
        continue;
      }
      runCommand(step.command);
      executedSteps.push({ ...step, status: 'ok' });
    } catch (error) {
      executedSteps.push({ ...step, status: 'failed' });
      if (options.writeReport !== false) {
        writeReleaseResult({ variant: options.variant || 'full', status: 'failed', steps: executedSteps, error });
      }
      throw error;
    }
  }

  if (options.writeReport !== false && !finalReportPrepared) {
    writeReleaseResult({ variant: options.variant || 'full', status: 'ok', steps: executedSteps });
  }

  return executedSteps;
}

function printPlan(plan) {
  for (const step of plan) {
    const passText = step.label === 'Version' || step.label === 'Package' ? '' : ` ${step.pass}/2`;
    const skipText = step.status === 'skipped' ? ' [SKIP]' : '';
    console.log(`${step.label}${passText}: ${step.command}${skipText}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const variant = getVariant(args);
  const skipVersionBump = args.includes('--skip-version-bump');
  const dryRun = args.includes('--dry-run') || args.includes('--list-commands');
  const plan = getReleasePlan(variant, { skipVersionBump });

  console.log(`Release runner: ${variant}`);

  if (dryRun) {
    printPlan(plan);
    console.log(`\nRelease runner dry-run OK: ${variant}`);
    return;
  }

  runPlan(plan, { variant });
  console.log(`\nRelease runner OK: ${variant}`);
}

if (require.main === module) {
  try {
    main();
    process.exit(0);
  } catch (error) {
    console.error(`\nRelease runner failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  FULL_SMOKE_COMMANDS,
  MOBILE_SMOKE_COMMANDS,
  DESKTOP_SMOKE_COMMANDS,
  VERIFY_COMMANDS,
  BUILD_COMMANDS,
  FINAL_COMMANDS,
  SANDBOX_BUILD_SKIP_REASON,
  getVariant,
  getReleasePlan,
  splitChainedCommand,
  splitArgs,
  runCommand,
  runPlan,
};
