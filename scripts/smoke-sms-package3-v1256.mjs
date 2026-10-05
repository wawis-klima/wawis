import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadSmsSettingsOnly } from '../src/modules/sms-fetch.js';
import { fetchAdminDevices } from '../src/modules/devices-fetch.js';
import { deleteServiceSmsQueueItems } from '../src/modules/sms-send.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20261005183500_sms_package3_settings_lazy_v1256.sql');
const panel = read('src/components/sms/SmsPanel.jsx');
const queueCard = read('src/components/sms/SmsQueueTable.jsx');
const unsentCard = read('src/components/sms/SmsUnsentCard.jsx');
const sentCard = read('src/components/sms/SmsSentThisMonthCard.jsx');
const devicesFetch = read('src/modules/devices-fetch.js');
const smsSend = read('src/modules/sms-send.js');
const edge = read('supabase/functions/send-service-sms/index.ts');
const app = read('src/App.jsx');

assert.match(migration, /create or replace function public\.admin_get_sms_settings\(\)/i);
assert.match(migration, /set search_path to ''/i);
assert.match(migration, /revoke all on function public\.admin_get_sms_settings\(\) from public,anon/i);

// P2-02 / P2-07: settings/templates must not load the whole SMS snapshot.
{
  const calls = [];
  const supabase = {
    async rpc(name) {
      calls.push(name);
      return {
        data: name === 'admin_get_sms_settings'
          ? { is_enabled: true, company_name: 'WAWIS TEST' }
          : null,
        error: null,
      };
    },
  };
  const settings = await loadSmsSettingsOnly({ supabase, isAdmin: true });
  assert.equal(settings.company_name, 'WAWIS TEST');
  assert.deepEqual(calls, ['admin_get_sms_settings']);
}
assert.match(panel, /if \(isSettingsOnlyView\) \{\s*void reloadSettingsOnly\(\);\s*return;/s);
assert.match(panel, /if \(!isAdmin \|\| !supabase \|\| isSettingsOnlyView\) return undefined;/);
assert.match(app, /const SmsPanel = lazy\(\(\) => import\("\.\/components\/sms\/SmsPanel\.jsx"\)\)/);
assert.match(app, /useState\("center360"\)/);

// P2-07: large device catalogs are paged instead of relying on one PostgREST response.
{
  const rows = Array.from({ length: 1201 }, (_, index) => ({
    id: `device-${index + 1}`,
    model: `MODEL-${index + 1}`,
    serial_number: `SN-${index + 1}`,
    source_job_id: '',
  }));
  const ranges = [];
  const supabase = {
    rpc(name) {
      assert.equal(name, 'admin_list_devices_with_contractor_v2');
      return {
        async range(from, to) {
          ranges.push([from, to]);
          return { data: rows.slice(from, to + 1), error: null };
        },
      };
    },
  };
  const result = await fetchAdminDevices({ supabase, isAdmin: true, jobs: [], trySync: false });
  assert.equal(result.devices.length, 1201);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
}
assert.match(devicesFetch, /fetchAllRpcRows/);
assert.match(panel, /const deviceRefresh = refreshDeviceCatalog\(\)/);
assert.match(panel, /if \(silent\) await deviceRefresh/);
assert.match(panel, /deviceCatalogWarning/);

// N-06: send date stays send date; delivery date is separate.
assert.doesNotMatch(panel, /log\.delivered_at \|\| log\.sent_at/);
assert.match(panel, /const when = log\.sent_at \|\| log\.approved_at \|\| log\.created_at/);
assert.match(panel, /const deliveredWhen = log\.delivered_at \|\| ''/);
assert.match(sentCard, /Doręczono: \{row\.formattedDeliveredAt\}/);

// P3-02: page footer uses actual page start instead of 1–N.
for (const source of [queueCard, unsentCard, sentCard]) {
  assert.match(source, /\(currentPage - 1\) \* 10 \+ 1/);
  assert.doesNotMatch(source, />1–\{Math\.min\(totalRows, currentPage \* 10\)\}/);
}

// P2-05: selections survive page navigation; page select merges/removes only page keys.
assert.doesNotMatch(panel, /\[activeSummaryView, currentPage, searchQuery, cityFilter\]/);
assert.match(panel, /return \[\.\.\.new Set\(\[\.\.\.prev, \.\.\.pageKeys\]\)\]/);
assert.match(panel, /return prev\.filter\(\(id\) => !pageSet\.has\(id\)\)/);
assert.match(unsentCard, /const selectedRows = rows\.filter/);

// P2-03: deletion carries stable group identity and backend expands it.
assert.match(panel, /reminderGroupId/);
assert.match(panel, /grouped_queue_log_ids/);
assert.match(panel, /grouped_log_ids/);
assert.match(edge, /\.in\("reminder_group_id", groupIds\)/);
assert.match(edge, /\.in\("status", \["pending_approval", "not_sent", "error"\]\)/);

// P2-04: large bulk delete is chunked and partial success is preserved instead of thrown away.
{
  const rows = Array.from({ length: 51 }, (_, index) => ({ logId: `log-${index + 1}` }));
  const chunks = [];
  let invokeIndex = 0;
  const supabase = {
    auth: {
      async getSession() {
        return { data: { session: { access_token: 'test-token' } }, error: null };
      },
    },
    functions: {
      async invoke(name, { body }) {
        assert.equal(name, 'send-service-sms');
        chunks.push(body.rows.length);
        invokeIndex += 1;
        if (invokeIndex === 2) {
          return {
            data: {
              ok: true,
              partial: true,
              deletedCount: body.rows.length - 1,
              failures: [{ id: body.rows.at(-1)?.logId || '', error: 'changed state' }],
            },
            error: null,
          };
        }
        return {
          data: { ok: true, partial: false, deletedCount: body.rows.length, failures: [] },
          error: null,
        };
      },
    },
  };
  const result = await deleteServiceSmsQueueItems({ supabase, rows });
  assert.deepEqual(chunks, [25, 25, 1]);
  assert.equal(result.deletedCount, 50);
  assert.equal(result.failures.length, 1);
  assert.equal(result.partial, true);
}
assert.match(smsSend, /for \(let index = 0; index < rows\.length; index \+= 25\)/);
assert.match(edge, /partial: true/);
assert.match(edge, /warning: "Część pozycji zmieniła stan/);
assert.doesNotMatch(edge, /ok: true,[\s\S]{0,120}partial: true,[\s\S]{0,120}error:/);
assert.match(panel, /await Promise\.allSettled\(\[reloadSmsData\(\{ silent: true \}\), refreshAll\?\.\(\)\]\)/);

console.log('PASS: SMS Package 3 UI, bulk, pagination and lazy-loading regressions');
