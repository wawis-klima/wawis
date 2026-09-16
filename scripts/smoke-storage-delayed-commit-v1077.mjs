import assert from 'node:assert/strict';
import { storeJobProtocol } from '../src/mobile791/modules/job-protocol-storage.js';
import { addFuelEntry } from '../src/modules/fuel.js';

const LOST_RESPONSE = { code: 'FETCH_FAILED', message: 'Response lost after database write.' };
const JOB_ID = '11111111-1111-4111-8111-111111111111';

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeDelayedProtocolCommitSupabase() {
  let record = null;
  let pendingRow = null;
  let writeAttempted = false;
  let postWriteReadbacks = 0;
  const files = new Set();
  const removed = [];

  return {
    files,
    removed,
    getRecord: () => (record ? { ...record } : null),
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'worker-1' } } }, error: null };
      },
    },
    from(table) {
      assert.equal(table, 'job_protocols');
      let mode = 'read';
      return {
        select() { return this; },
        eq() { return this; },
        insert(row) {
          mode = 'write';
          pendingRow = { ...row };
          writeAttempted = true;
          return this;
        },
        async single() {
          assert.equal(mode, 'write');
          return { data: null, error: LOST_RESPONSE };
        },
        async maybeSingle() {
          if (!writeAttempted) return { data: record ? { ...record } : null, error: null };
          postWriteReadbacks += 1;
          if (postWriteReadbacks === 1) {
            queueMicrotask(() => {
              record = {
                id: 'protocol-delayed-1',
                created_at: '2026-09-16T07:00:00.000Z',
                ...pendingRow,
              };
            });
            return { data: null, error: null };
          }
          return { data: record ? { ...record } : null, error: null };
        },
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'job-protocols');
        return {
          async upload(path) {
            files.add(path);
            return { data: { path }, error: null };
          },
          async remove(paths) {
            for (const path of paths) {
              removed.push(path);
              files.delete(path);
            }
            return { data: null, error: null };
          },
        };
      },
    },
  };
}

async function runProtocolScenario() {
  const supabase = makeDelayedProtocolCommitSupabase();
  await assert.rejects(
    () => storeJobProtocol({
      supabase,
      job: { id: JOB_ID, status: 'Zakończone' },
      pdfBlob: new Blob(['%PDF-1.4 delayed commit'], { type: 'application/pdf' }),
      fileName: 'protokol.pdf',
      timeoutMs: 200,
      uploadTimeoutMs: 200,
    }),
    (error) => /Response lost/i.test(String(error?.message || '')),
  );
  await nextTick();
  const committed = supabase.getRecord();
  assert.ok(committed, 'Symulowany commit DB powinien pojawić się dopiero po pustym readbacku.');
  assert.ok(supabase.files.has(committed.storage_path), 'PDF musi pozostać w Storage po późnym commitcie DB.');
  assert.equal(supabase.removed.length, 0, 'Nie wolno usuwać PDF po pustym readbacku niejednoznacznego zapisu.');
}

function makeDelayedFuelCommitSupabase() {
  let record = null;
  let pendingRow = null;
  let writeAttempted = false;
  let postWriteReadbacks = 0;
  const files = new Set();
  const removed = [];

  return {
    files,
    removed,
    getRecord: () => (record ? { ...record } : null),
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'worker-1' } } }, error: null };
      },
    },
    from(table) {
      assert.equal(table, 'fuel_entries');
      let mode = 'read';
      let photoFilter = '';
      return {
        insert(row) {
          mode = 'write';
          pendingRow = { ...row };
          writeAttempted = true;
          return this;
        },
        select() { return this; },
        eq(column, value) {
          if (column === 'odometer_photo_path') photoFilter = value;
          return this;
        },
        async single() {
          assert.equal(mode, 'write');
          return { data: null, error: LOST_RESPONSE };
        },
        async maybeSingle() {
          if (!writeAttempted) return { data: null, error: null };
          postWriteReadbacks += 1;
          if (postWriteReadbacks === 1) {
            queueMicrotask(() => {
              record = {
                id: 'fuel-delayed-1',
                fueled_at: '2026-09-16T07:00:00.000Z',
                created_at: '2026-09-16T07:00:00.000Z',
                created_by: 'worker-1',
                corrected_by: null,
                corrected_at: null,
                correction_count: 0,
                original_liters: null,
                original_odometer_km: null,
                ...pendingRow,
              };
            });
            return { data: null, error: null };
          }
          if (!record || record.odometer_photo_path !== photoFilter) return { data: null, error: null };
          return { data: { ...record }, error: null };
        },
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'fuel-odometer-photos');
        return {
          async upload(path) {
            files.add(path);
            return { data: { path }, error: null };
          },
          async remove(paths) {
            for (const path of paths) {
              removed.push(path);
              files.delete(path);
            }
            return { data: null, error: null };
          },
        };
      },
    },
  };
}

async function runFuelScenario() {
  const supabase = makeDelayedFuelCommitSupabase();
  await assert.rejects(
    () => addFuelEntry({
      supabase,
      isAdmin: false,
      vehicleId: 'vehicle-1',
      liters: '48,5',
      odometerKm: '125400',
      odometerPhotoBlob: new Blob(['odometer'], { type: 'image/jpeg' }),
      odometerAiConfidence: 0.94,
      odometerReadSource: 'local_ocr',
    }),
    (error) => /Response lost/i.test(String(error?.message || '')),
  );
  await nextTick();
  const committed = supabase.getRecord();
  assert.ok(committed, 'Symulowany commit tankowania powinien pojawić się dopiero po pustym readbacku.');
  assert.ok(supabase.files.has(committed.odometer_photo_path), 'Zdjęcie licznika musi pozostać po późnym commitcie DB.');
  assert.equal(supabase.removed.length, 0, 'Nie wolno usuwać zdjęcia po pustym readbacku niejednoznacznego zapisu.');
}

await runProtocolScenario();
await runFuelScenario();
console.log('PASS smoke-storage-delayed-commit-v1077');
