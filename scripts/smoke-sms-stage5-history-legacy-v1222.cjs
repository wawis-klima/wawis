const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const migration = read('supabase/migrations/20261002090424_sms_stage5_history_legacy_v1222.sql');
  assert.match(migration, /add column if not exists sms_consent boolean not null default true/i);
  assert.match(migration, /add column if not exists sms_reminder_enabled boolean not null default true/i);
  assert.match(migration, /admin_list_devices_with_contractor_v2/);
  assert.match(migration, /sent_this_month_logs/);
  assert.match(migration, /history_logs/);
  assert.match(migration, /queue_logs/);
  assert.match(migration, /limit 300/i);
  assert.match(migration, /consent_source/);
  assert.match(migration, /legacy_device/);
  assert.match(migration, /v_device\.sms_consent is not true/);
  assert.match(migration, /v_device\.sms_reminder_enabled is not true/);
  assert.match(migration, /v_source_text <> ''/);
  assert.match(migration, /grant execute on function public\.claim_service_sms_group_v2\(uuid, uuid, uuid, integer\) to service_role/i);

  const desktopFetch = read('src/modules/sms-fetch.js');
  for (const fetchSource of [desktopFetch]) {
    assert.match(fetchSource, /admin_get_sms_module_snapshot/);
    assert.match(fetchSource, /sentThisMonthLogs/);
    assert.match(fetchSource, /historyLogs/);
    assert.match(fetchSource, /queue_logs/);
  }

  const desktopPanel = read('src/components/devices/DevicesPanel.jsx');
  const mobilePanel = read('src/mobile791/components/devices/DevicesPanel.jsx');
  assert.match(desktopPanel, /startsWith\('devices-rpc'\)/);
  assert.match(mobilePanel, /startsWith\('devices-rpc'\)/);
  assert.doesNotMatch(desktopPanel, /sourceMode !== 'devices-rpc'/);
  assert.doesNotMatch(mobilePanel, /sourceMode !== 'devices-rpc'/);

  const desktopDevices = read('src/modules/devices-fetch.js');
  const mobileDevices = read('src/mobile791/modules/devices-fetch.js');
  // Transport katalogu może różnić się między desktop/mobile, kontrakt danych pozostaje wspólny.
  for (const devicesSource of [desktopDevices, mobileDevices]) {
    assert.match(devicesSource, /admin_list_devices_with_contractor_v2/);
    assert.match(devicesSource, /sms_consent:\s*device\.sms_consent !== false/);
    assert.match(devicesSource, /sms_reminder_enabled:\s*device\.sms_reminder_enabled !== false/);
  }

  const desktopSms = read('src/modules/sms.js');
  assert.match(desktopSms, /isLegacyDevice/);
  assert.match(desktopSms, /sms_eligibility: hasAuthoritativeConsent \? 'linked_job' : \(isLegacyDevice \? 'legacy_device'/);

  const sms = await import(pathToFileURL(path.join(root, 'src', 'modules', 'sms.js')).href);
  const legacyTargets = sms.buildSmsTargets({
    jobs: [],
    devices: [{
      id: 'legacy-1',
      contractor_id: 'contractor-1',
      contractor_name: 'Klient legacy',
      contractor_phone: '500600700',
      source_job_id: '',
      installation_date: '2025-11-02',
      service_reminder_years: 5,
      sms_consent: true,
      sms_reminder_enabled: true,
    }],
  });
  assert.equal(legacyTargets.length, 1);
  assert.equal(legacyTargets[0].sms_consent, true);
  assert.equal(legacyTargets[0].sms_reminder_enabled, true);
  assert.equal(legacyTargets[0].sms_eligibility, 'legacy_device');

  const malformedLinked = sms.buildSmsTargets({
    jobs: [],
    devices: [{
      id: 'broken-1',
      contractor_id: 'contractor-1',
      contractor_phone: '500600700',
      source_job_id: 'not-a-valid-job-link',
      installation_date: '2025-11-02',
      sms_consent: true,
      sms_reminder_enabled: true,
    }],
  });
  assert.equal(malformedLinked[0].sms_consent, false);
  assert.equal(malformedLinked[0].sms_eligibility, 'missing_linked_job_consent');

  const generator = read('supabase/functions/generate-service-sms-queue/index.ts');
  assert.match(generator, /isLegacyDevice/);
  assert.match(generator, /device\.sms_consent === true/);
  assert.match(generator, /device\.sms_reminder_enabled === true/);
  assert.match(generator, /jobId:\s*linkedJobId \|\| null/);
  assert.match(generator, /contractor\?\.phone/);

  for (const panelPath of ['src/components/sms/SmsPanel.jsx']) {
    const panel = read(panelPath);
    assert.match(panel, /sentMonthSourceLogs/);
    assert.match(panel, /getSentThisMonthLogs\(sentMonthSourceLogs\)/);
    assert.match(panel, /loadSmsHistoryPage/);
    assert.match(panel, /<SmsHistoryCard[\s\S]*logs=\{historyLogs\}/);
    assert.match(panel, /sentThisMonth:\s*sentThisMonthLogs\.length/);
  }

  console.log('SMS stage 5 history/legacy v12.22 smoke OK');
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
