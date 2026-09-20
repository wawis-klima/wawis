const GROUPS = {
  'ui-fast-core': [
    'npm run test:smoke',
    'npm run test:smoke:version',
  ],
  'ui-fast-mobile': [
    'npm run test:smoke:mobile-style-bootstrap',
    'npm run test:smoke:mobile-admin-header',
  ],
  'ui-fast-desktop': [
    'npm run test:smoke:desktop-refresh',
    'npm run test:smoke:desktop-only',
  ],
  core: [
    'npm run test:smoke',
    'npm run test:smoke:version',
    'npm run test:smoke:lazy',
    'npm run test:smoke:suspense',
    'npm run test:smoke:selection',
    'npm run test:smoke:regex-compat',
    'npm run test:smoke:technical-refresh',
    'npm run test:smoke:reliable-sync',
    'npm run test:smoke:feed-stale-v1079',
    'node scripts/smoke-mobile-offline-resilience-v1075.mjs',
    'node scripts/smoke-session-sync-resilience-v1080.mjs',
    'node scripts/smoke-update-reload-guard-v1081.mjs',
    'node scripts/smoke-update-reload-guard-v1082.mjs',
    'node scripts/smoke-audit-races-v1084.mjs',
    'npm run test:smoke:diagnostic-report',
    'npm run test:smoke:diagnostics-clarity',
    'npm run test:smoke:startup-chunk',
    'npm run test:smoke:realtime-lite',
  ],
  jobs: [
    'npm run test:smoke:delete',
    'npm run test:smoke:device-save',
    'npm run test:smoke:job-multi-indoor',
    'npm run test:smoke:job-device-type-switch',
    'npm run test:smoke:device-delete',
    'npm run test:smoke:job-auto-contractor',
    'npm run test:smoke:contractor-addresses',
    'npm run test:smoke:worker-shared-job-edit',
    'npm run test:smoke:worker-create-status',
    'npm run test:smoke:job-completion',
    'npm run test:smoke:new-job-author-comment',
  ],
  photos: [
    'npm run test:smoke:private-photos',
    'npm run test:smoke:mobile-private-photos',
    'npm run test:smoke:mobile-photo-compression',
    'npm run test:smoke:mobile-photo-upload-rls',
    'npm run test:smoke:mobile-photo-visibility-sync',
    'npm run test:smoke:mobile-thumbnail-recovery',
    'npm run test:smoke:photo-cross-device-sync',
    'npm run test:smoke:mobile-photo-sync-indicator',
    'npm run test:smoke:mobile-photo-sync-center',
    'npm run test:smoke:mobile-offline-photo-queue',
    'npm run test:smoke:mobile-photo-idempotency',
    'npm run test:smoke:photo-preview-gallery-separation',
    'npm run test:smoke:desktop-photo-thumbnails',
    'node scripts/smoke-photo-zero-byte-v1096.mjs',
  ],
  protocol: [
    'npm run test:smoke:mobile-protocol',
    'npm run test:smoke:mobile-protocol-save',
    'node scripts/smoke-storage-write-reconciliation-v1074.mjs',
    'node scripts/smoke-storage-delayed-commit-v1077.mjs',
    'node scripts/smoke-audit-fixes-v1088.mjs',
    'npm run test:smoke:mobile-protocol-print',
    'npm run test:smoke:mobile-protocol-layout',
    'npm run test:smoke:mobile-protocol-email',
    'npm run test:smoke:mobile-payment',
    'npm run test:smoke:desktop-protocol',
  ],
  roles: [
    'npm run test:smoke:admin-worker',
    'npm run test:smoke:desktop-only',
    'npm run test:smoke:supabase-grants',
    'npm run test:smoke:destructive-rls',
    'node scripts/smoke-worker-contractor-update-v1089.cjs',
    'node scripts/smoke-supabase-security-hardening-v1090.mjs',
  ],
  push: [
    'npm run test:smoke:assignment-push',
    'npm run test:smoke:push-reliability',
    'npm run test:smoke:push-mobile-reassignment',
    'npm run test:smoke:push-logout-handoff',
    'npm run test:smoke:push-safety-v1078',
    'npm run test:smoke:comment-admin-push',
    'npm run test:smoke:push-toggle',
    'npm run test:smoke:push-initial-state',
    'node scripts/smoke-session-push-gate-v1083.mjs',
    'node scripts/smoke-audit-fixes-v1087.mjs',
  ],
  fuel: [
    'npm run test:smoke:fuel-module',
    'node scripts/smoke-storage-write-reconciliation-v1074.mjs',
    'node scripts/smoke-storage-delayed-commit-v1077.mjs',
    'node scripts/smoke-audit-fixes-v1088.mjs',
  ],
  nameplates: [
    'npm run test:smoke:mobile-serial-scanner',
    'npm run test:smoke:nameplate-rendering',
    'npm run test:smoke:nameplate-finish-verification',
    'npm run test:smoke:nameplate-quality',
    'npm run test:smoke:nameplate-product-catalog',
    'npm run test:smoke:rotenso-model-history',
    'npm run test:smoke:desktop-nameplate-ocr',
    'npm run test:smoke:desktop-nameplate-ai-barcode',
    'npm run test:smoke:desktop-nameplate-read-resilience',
    'npm run test:smoke:desktop-nameplate-automatic-fallback',
    'npm run test:smoke:desktop-nameplate-ean-separation',
    'npm run test:smoke:desktop-nameplate-verification-status',
    'node scripts/smoke-nameplate-ai-auth-v1085.mjs',
    'node scripts/smoke-audit-fixes-v1088.mjs',
  ],
  desktop: [
    'npm run test:smoke:sms-summary',
    'npm run test:smoke:sms-job-grouping',
    'npm run test:smoke:sms-log-cleanup',
    'npm run test:smoke:center360',
    'npm run test:smoke:center360-personalization',
    'npm run test:smoke:dashboard-metrics',
    'npm run test:smoke:desktop-refresh',
    'npm run test:smoke:desktop-jobs-layout-width',
    'npm run test:smoke:desktop-job-details-polish',
    'npm run test:smoke:desktop-global-search',
    'npm run test:smoke:desktop-cross-module-panels',
    'npm run test:smoke:calendar-width',
  ],
  mobile: [
    'npm run test:smoke:mobile-ui-copy',
    'npm run test:smoke:mobile-style-bootstrap',
    'npm run test:smoke:mobile-admin-header',
    'npm run test:smoke:mobile-new-job-no-devices',
    'npm run test:smoke:mobile-worker-add-client',
    'npm run test:smoke:mobile-default-installation-date',
    'npm run test:smoke:cache-first-refresh',
  ],
  infra: [
    'node scripts/smoke-release-automation-v1061.cjs',
    'node scripts/smoke-release-impact-v1063.cjs',
    'npm run test:smoke:release-runner',
    'npm run test:smoke:release-zip',
    'npm run test:smoke:release-zip-clean',
    'node scripts/smoke-playwright-runner-fail-closed-v1085.cjs',
    'node scripts/smoke-smsapi-webhook-security-v1085.mjs',
    'node scripts/smoke-audit-fixes-v1086.mjs',
    'node scripts/smoke-audit-fixes-v1087.mjs',
    'node scripts/smoke-audit-fixes-v1088.mjs',
    'npm run test:smoke:e2e-mobile',
    'npm run test:smoke:e2e-desktop',
    'npm run test:smoke:remove-resend-email',
    'npm run test:smoke:no-services-module',
    'node scripts/smoke-session-push-gate-v1083.mjs',
    'node scripts/smoke-audit-races-v1084.mjs',
  ],
};

const RELEASE_GROUPS = {
  mobile: ['core', 'jobs', 'photos', 'protocol', 'roles', 'push', 'fuel', 'nameplates', 'mobile', 'infra'],
  desktop: ['core', 'jobs', 'protocol', 'roles', 'push', 'fuel', 'nameplates', 'desktop', 'infra'],
  full: ['core', 'jobs', 'photos', 'protocol', 'roles', 'push', 'fuel', 'nameplates', 'desktop', 'mobile', 'infra'],
};

function uniqueCommands(groupNames = []) {
  const seen = new Set();
  const commands = [];
  for (const groupName of groupNames) {
    const group = GROUPS[groupName];
    if (!group) throw new Error(`Unknown WAWIS test group: ${groupName}`);
    for (const command of group) {
      if (seen.has(command)) continue;
      seen.add(command);
      commands.push(command);
    }
  }
  return commands;
}

function getReleaseGroups(scope = 'full') {
  const normalized = scope === 'desktop-sandbox' ? 'desktop' : scope;
  const groups = RELEASE_GROUPS[normalized];
  if (!groups) throw new Error(`Unsupported WAWIS release scope: ${scope}`);
  return [...groups];
}

module.exports = {
  GROUPS,
  RELEASE_GROUPS,
  getReleaseGroups,
  uniqueCommands,
};
