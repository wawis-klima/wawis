import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  confirmDeleteJobRecord as confirmDeleteDesktop,
  updateJobStatus as updateStatusDesktop,
} from '../src/modules/jobs-crud.js';
import {
  confirmDeleteJobRecord as confirmDeleteMobile,
  updateJobStatus as updateStatusMobile,
} from '../src/mobile791/modules/jobs-crud.js';
import { fetchAllOrderedTableRows } from '../src/modules/paginated-read.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error?.message || error}`);
  }
}

await check('F06 metadata pagination crosses 1000/2501 and is wired into desktop/mobile jobs fetch', async () => {
  const rows = Array.from({ length: 2501 }, (_, index) => ({
    id: String(index + 1).padStart(4, '0'),
    job_id: index === 2500 ? 'target-job' : `other-${index}`,
  }));
  const ranges = [];
  const supabase = {
    from(table) {
      assert.equal(table, 'photos');
      return {
        select() { return this; },
        order() { return this; },
        range(from, to) {
          ranges.push([from, to]);
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
    },
  };
  const paged = await fetchAllOrderedTableRows({
    supabase,
    table: 'photos',
    fields: 'id, job_id',
    pageSize: 500,
    orderBy: 'id',
    ascending: true,
  });
  assert.equal(paged.data.length, 2501);
  assert.deepEqual(ranges, [[0,499],[500,999],[1000,1499],[1500,1999],[2000,2499],[2500,2999]]);

  const desktop = fs.readFileSync(path.join(root, 'src/modules/jobs-fetch.js'), 'utf8');
  const mobile = fs.readFileSync(path.join(root, 'src/mobile791/modules/jobs-fetch.js'), 'utf8');
  assert.match(desktop, /fetchAllOrderedTableRows\(\{[\s\S]*?table:\s*['"]photos['"]/);
  assert.match(desktop, /fetchAllOrderedTableRows\(\{[\s\S]*?table:\s*['"]nameplate_manual_verifications['"]/);
  assert.match(desktop, /fetchAllOrderedTableRows\(\{[\s\S]*?table:\s*['"]job_access['"]/);
  assert.match(mobile, /fetchAllOrderedTableRows\(\{[\s\S]*?table:\s*['"]job_access['"]/);
});

for (const [surface, updateJobStatus] of [
  ['desktop', updateStatusDesktop],
  ['mobile', updateStatusMobile],
]) {
  await check(`F07 ${surface} rejects zero-row/not-found status transition`, async () => {
    const supabase = {
      from(table) {
        assert.equal(table, 'jobs');
        return {
          update() {
            return {
              eq() {
                return Promise.resolve({ data: null, error: null, count: 0 });
              },
            };
          },
        };
      },
      rpc(name) {
        assert.equal(name, 'change_job_status_guarded');
        return Promise.resolve({ data: { outcome: 'not_found' }, error: null });
      },
    };
    await assert.rejects(
      () => updateJobStatus({ supabase, jobId: 'job-missing', status: 'Zakończone', expectedStatus: 'W trakcie' }),
      /nie istnieje|not.?found|odśwież/i,
    );
  });
}

for (const [surface, confirmDeleteJobRecord] of [
  ['desktop', confirmDeleteDesktop],
  ['mobile', confirmDeleteMobile],
]) {
  await check(`F08 ${surface} retry after lost delete response reuses operation id`, async () => {
    const operationIds = [];
    let newRpcCalls = 0;
    const supabase = {
      rpc(name, args) {
        if (name === 'admin_delete_jobs_recoverable') {
          return Promise.resolve({ data: [], error: null });
        }
        assert.equal(name, 'admin_delete_job_idempotent');
        newRpcCalls += 1;
        operationIds.push(args?.p_operation_id);
        if (newRpcCalls === 1) {
          return Promise.resolve({ data: null, error: new TypeError('Failed to fetch after delete commit') });
        }
        return Promise.resolve({
          data: {
            outcome: 'already_applied',
            id: args.p_job_id,
            operation_id: args.p_operation_id,
          },
          error: null,
        });
      },
    };
    const job = { id: `job-delete-${surface}` };
    await assert.rejects(() => confirmDeleteJobRecord({ supabase, jobToDelete: job }), /fetch|network|delete|usun/i);
    const retry = await confirmDeleteJobRecord({ supabase, jobToDelete: job });
    assert.equal(retry?.outcome, 'already_applied');
    assert.equal(operationIds.length, 2);
    assert.ok(operationIds[0]);
    assert.equal(operationIds[0], operationIds[1], 'Retry musi użyć tego samego operation_id.');
  });
}

await check('F09 rebuild manifest covers active root/current migrations and starts before modern schema changes', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase/rebuild/manifest-v1089.json'), 'utf8'));
  const coverageFrom = String(manifest.migrationCoverageFrom || '');
  assert.match(coverageFrom, /^\d{14}$/);
  assert.ok(
    coverageFrom <= '20260917000000',
    `Coverage start ${coverageFrom} jest zbyt późny i może pominąć aktywne migracje aplikacji.`,
  );

  const required = [
    'supabase/migrations/20260928120000_job_installers_concurrency_v1168.sql',
    'supabase/migrations/20260930100831_require_device_before_completion_v1192.sql',
    'supabase/migrations/current/20260929171500_vat_invoice_status_v1184.sql',
    'supabase/migrations/current/20260930071500_payment_cash_transfer_optional_amount_v1187.sql',
    'supabase/migrations/current/20261001071500_vat_invoice_fakturownia_lock_v1205.sql',
    'supabase/migrations/current/20261007045546_fakturownia_p0_v1260.sql',
    'supabase/migrations/current/20261007062745_job_create_idempotency_v1261.sql',
  ];
  const manifestSet = new Set(manifest.files);
  for (const file of required) assert.ok(manifestSet.has(file), `Fresh rebuild pomija aktywną migrację: ${file}`);

  const migrationRoot = path.join(root, 'supabase/migrations');
  const discovered = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/^\d{14}_.+\.sql$/i.test(entry.name)) {
        const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
        if (entry.name.slice(0, 14) >= coverageFrom) discovered.push(relative);
      }
    }
  }
  walk(migrationRoot);
  const missing = discovered.filter((file) => !manifestSet.has(file));
  assert.deepEqual(missing, [], `Manifest pomija: ${missing.join(', ')}`);
});

if (failures.length) {
  console.error('\nP2 reproducer failures:');
  for (const { name, error } of failures) console.error(`- ${name}: ${error?.stack || error}`);
  process.exit(1);
}
console.log('PASS smoke-p2-audit-closure-v1262');
