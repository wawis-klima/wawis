import assert from 'node:assert/strict';
import { storeJobProtocol } from '../src/mobile791/modules/job-protocol-storage.js';
import { addFuelEntry } from '../src/modules/fuel.js';

const LOST_RESPONSE = { code: 'FETCH_FAILED', message: 'Response lost after database write.' };
const LOOKUP_FAILED = { code: 'FETCH_FAILED', message: 'Reconciliation read failed.' };
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const FUEL_ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';

function assertLostResponse(error) {
  assert.match(String(error?.message || ''), /Response lost/i);
  return true;
}

function makeProtocolSupabase({ existingRecord = null, commitWrite = true, failReconciliation = false } = {}) {
  let record = existingRecord ? { ...existingRecord } : null;
  let writeAttempted = false;
  const files = new Set(existingRecord?.storage_path ? [existingRecord.storage_path] : []);
  const removed = [];

  return {
    files,
    removed,
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'worker-1' } } }, error: null };
      },
    },
    from(table) {
      assert.equal(table, 'job_protocols');
      let mode = 'read';
      let pendingRow = null;
      return {
        select() { return this; },
        eq() { return this; },
        insert(row) {
          mode = 'write';
          pendingRow = row;
          writeAttempted = true;
          if (commitWrite) {
            record = {
              id: 'protocol-1',
              created_at: '2026-09-16T05:00:00.000Z',
              ...row,
            };
          }
          return this;
        },
        update(row) {
          mode = 'write';
          pendingRow = row;
          writeAttempted = true;
          if (commitWrite && record) {
            record = { ...record, ...row };
          }
          return this;
        },
        async single() {
          assert.equal(mode, 'write');
          assert.ok(pendingRow);
          return { data: null, error: LOST_RESPONSE };
        },
        async maybeSingle() {
          if (writeAttempted && failReconciliation) return { data: null, error: LOOKUP_FAILED };
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

async function saveProtocol(supabase, replaceExisting = false) {
  return storeJobProtocol({
    supabase,
    job: { id: JOB_ID, status: 'Zakończone' },
    pdfBlob: new Blob(['%PDF-1.4 reconciliation'], { type: 'application/pdf' }),
    fileName: 'protokol.pdf',
    replaceExisting,
    timeoutMs: 200,
    uploadTimeoutMs: 200,
  });
}

{
  const supabase = makeProtocolSupabase({ commitWrite: true });
  const saved = await saveProtocol(supabase);
  assert.equal(saved.id, 'protocol-1');
  assert.ok(supabase.files.has(saved.storage_path), 'PDF musi zostać, gdy DB zapisała rekord mimo utraconej odpowiedzi.');
  assert.equal(supabase.removed.length, 0, 'Nie wolno usuwać PDF przed odczytem kontrolnym.');
}

{
  const oldPath = `${JOB_ID}/old-protocol.pdf`;
  const supabase = makeProtocolSupabase({
    existingRecord: {
      id: 'protocol-1',
      job_id: JOB_ID,
      storage_path: oldPath,
      file_name: 'old.pdf',
      file_size_bytes: 100,
      signed_at: '2026-09-15T05:00:00.000Z',
      created_at: '2026-09-15T05:00:00.000Z',
      created_by: 'worker-1',
    },
    commitWrite: true,
  });
  const saved = await saveProtocol(supabase, true);
  assert.notEqual(saved.storage_path, oldPath);
  assert.ok(supabase.files.has(saved.storage_path), 'Nowy PDF musi istnieć po potwierdzonym update rekordu.');
  assert.equal(supabase.files.has(oldPath), false, 'Stary PDF wolno usunąć dopiero po potwierdzeniu nowego rekordu.');
}

{
  const supabase = makeProtocolSupabase({ commitWrite: true, failReconciliation: true });
  await assert.rejects(() => saveProtocol(supabase), assertLostResponse);
  assert.equal(supabase.removed.length, 0, 'Przy niejednoznacznym wyniku PDF musi zostać w Storage.');
  assert.equal(supabase.files.size, 1);
}

{
  const supabase = makeProtocolSupabase({ commitWrite: false });
  await assert.rejects(() => saveProtocol(supabase), assertLostResponse);
  assert.equal(supabase.removed.length, 0, 'Po błędzie zapisu pusty readback nie daje prawa usunąć PDF.');
  assert.equal(supabase.files.size, 1);
}

function makeFuelSupabase({ commitWrite = true, failReconciliation = false } = {}) {
  let record = null;
  let writeAttempted = false;
  const files = new Set();
  const removed = [];
  const metrics = { insertCount: 0, uploadCount: 0 };

  return {
    files,
    removed,
    metrics,
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'worker-1' } } }, error: null };
      },
    },
    from(table) {
      assert.equal(table, 'fuel_entries');
      let mode = 'read';
      let idFilter = '';
      let photoFilter = '';
      return {
        insert(row) {
          mode = 'write';
          writeAttempted = true;
          metrics.insertCount += 1;
          if (commitWrite) {
            record = {
              fueled_at: '2026-09-16T05:00:00.000Z',
              created_at: '2026-09-16T05:00:00.000Z',
              created_by: 'worker-1',
              corrected_by: null,
              corrected_at: null,
              correction_count: 0,
              original_liters: null,
              original_odometer_km: null,
              ...row,
            };
          }
          return this;
        },
        select() { return this; },
        eq(column, value) {
          if (column === 'id') idFilter = String(value);
          if (column === 'odometer_photo_path') photoFilter = String(value);
          return this;
        },
        async single() {
          assert.equal(mode, 'write');
          return { data: null, error: LOST_RESPONSE };
        },
        async maybeSingle() {
          if (writeAttempted && failReconciliation) return { data: null, error: LOOKUP_FAILED };
          if (!record) return { data: null, error: null };
          if (idFilter) return { data: String(record.id) === idFilter ? { ...record } : null, error: null };
          if (photoFilter) return { data: String(record.odometer_photo_path || '') === photoFilter ? { ...record } : null, error: null };
          return { data: null, error: null };
        },
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'fuel-odometer-photos');
        return {
          async upload(path) {
            metrics.uploadCount += 1;
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

async function saveFuelEntry(supabase, entryId = FUEL_ATTEMPT_ID) {
  return addFuelEntry({
    supabase,
    isAdmin: false,
    vehicleId: 'vehicle-1',
    liters: '48,5',
    odometerKm: '125400',
    odometerPhotoBlob: new Blob(['odometer'], { type: 'image/jpeg' }),
    odometerAiConfidence: 0.94,
    odometerReadSource: 'local_ocr',
    entryId,
  });
}

{
  const supabase = makeFuelSupabase({ commitWrite: true });
  const saved = await saveFuelEntry(supabase);
  assert.equal(saved.id, FUEL_ATTEMPT_ID, 'Baza i klient muszą zachować UUID tej samej logicznej próby.');
  assert.ok(supabase.files.has(saved.odometer_photo_path), 'Zdjęcie licznika musi zostać, gdy wpis DB istnieje.');
  assert.equal(supabase.removed.length, 0);
  assert.equal(supabase.metrics.insertCount, 1);
  assert.equal(supabase.metrics.uploadCount, 1);

  const retried = await saveFuelEntry(supabase);
  assert.equal(retried.id, FUEL_ATTEMPT_ID, 'Retry po utraconej odpowiedzi musi pojednać ten sam UUID.');
  assert.equal(supabase.metrics.insertCount, 1, 'Retry tej samej próby nie może tworzyć drugiego INSERT-u.');
  assert.equal(supabase.metrics.uploadCount, 1, 'Retry tej samej próby nie może wysyłać drugiego zdjęcia.');
}

{
  const supabase = makeFuelSupabase({ commitWrite: true, failReconciliation: true });
  await assert.rejects(() => saveFuelEntry(supabase), assertLostResponse);
  assert.equal(supabase.removed.length, 0, 'Przy niejednoznacznym wyniku zdjęcia licznika nie wolno usuwać.');
  assert.equal(supabase.files.size, 1);
}

{
  const supabase = makeFuelSupabase({ commitWrite: false });
  await assert.rejects(() => saveFuelEntry(supabase), assertLostResponse);
  assert.equal(supabase.removed.length, 0, 'Po błędzie zapisu pusty readback nie daje prawa usunąć zdjęcia licznika.');
  assert.equal(supabase.files.size, 1);
}

console.log('PASS smoke-storage-write-reconciliation-v1074');
