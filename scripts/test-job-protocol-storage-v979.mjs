import assert from 'node:assert/strict';
import {
  JOB_PROTOCOLS_BUCKET,
  JOB_PROTOCOLS_TABLE,
  loadJobProtocolRecord,
  shareStoredJobProtocol,
  storeJobProtocol,
} from '../src/mobile791/modules/job-protocol-storage.js';

const rows = [];
const objects = new Map();
let protocolRecordReadCount = 0;

function createSelectQuery() {
  let jobId = '';
  return {
    select() { return this; },
    eq(field, value) {
      if (field === 'job_id') jobId = String(value);
      return this;
    },
    async maybeSingle() {
      protocolRecordReadCount += 1;
      return { data: rows.find((row) => String(row.job_id) === jobId) || null, error: null };
    },
  };
}

const supabase = {
  auth: {
    async getSession() {
      return { data: { session: { user: { id: 'worker-1' } } }, error: null };
    },
  },
  from(table) {
    assert.equal(table, JOB_PROTOCOLS_TABLE);
    const query = createSelectQuery();
    query.insert = (row) => ({
      select() { return this; },
      async single() {
        const savedRow = { id: 'protocol-1', created_at: '2026-08-28T12:40:00.000Z', ...row };
        rows.push(savedRow);
        return { data: savedRow, error: null };
      },
    });
    query.update = (row) => {
      let recordId = '';
      return {
        eq(field, value) {
          assert.equal(field, 'id');
          recordId = value;
          return this;
        },
        select() { return this; },
        async single() {
          const index = rows.findIndex((item) => item.id === recordId);
          if (index < 0) return { data: null, error: new Error('Protocol not found') };
          rows[index] = { ...rows[index], ...row };
          return { data: rows[index], error: null };
        },
      };
    };
    return query;
  },
  storage: {
    from(bucket) {
      assert.equal(bucket, JOB_PROTOCOLS_BUCKET);
      return {
        async upload(path, blob, options) {
          assert.equal(options.contentType, 'application/pdf');
          assert.equal(options.upsert, false);
          objects.set(path, blob);
          return { data: { path }, error: null };
        },
        async download(path) {
          return { data: objects.get(path) || null, error: null };
        },
        async remove(paths) {
          paths.forEach((path) => objects.delete(path));
          return { data: null, error: null };
        },
      };
    },
  },
};

const completedJob = { id: '11111111-1111-4111-8111-111111111111', status: 'Zakończone' };
const signedAt = new Date('2026-08-28T12:37:00.000Z');
const pdfBlob = new Blob(['%PDF-1.4 storage verification'], { type: 'application/pdf' });
const saved = await storeJobProtocol({
  supabase,
  job: completedJob,
  pdfBlob,
  fileName: 'wawis-protokol-test.pdf',
  signedAt,
});

assert.equal(saved.job_id, completedJob.id);
assert.equal(saved.created_by, 'worker-1');
assert.equal(saved.signed_at, signedAt.toISOString());
assert.ok(saved.storage_path.startsWith(`${completedJob.id}/protocol-`));
assert.equal(objects.get(saved.storage_path), pdfBlob);
assert.equal(protocolRecordReadCount, 1, 'Successful insert must not perform an extra protocol read after saving.');

const loaded = await loadJobProtocolRecord({ supabase, jobId: completedJob.id });
assert.equal(loaded.backendAvailable, true);
assert.equal(loaded.record.id, 'protocol-1');

const firstStoragePath = saved.storage_path;
const replacementBlob = new Blob(['%PDF-1.4 replacement verification'], { type: 'application/pdf' });
const replaced = await storeJobProtocol({
  supabase,
  job: completedJob,
  pdfBlob: replacementBlob,
  fileName: 'wawis-protokol-zmieniony.pdf',
  signedAt: new Date('2026-08-28T13:10:00.000Z'),
  replaceExisting: true,
});
assert.equal(replaced.id, 'protocol-1');
assert.notEqual(replaced.storage_path, firstStoragePath);
assert.equal(objects.has(firstStoragePath), false);
assert.equal(objects.get(replaced.storage_path), replacementBlob);
assert.equal(protocolRecordReadCount, 3, 'Successful replacement must use only its initial protocol read.');

let sharedPayload = null;
navigator.canShare = (payload) => Array.isArray(payload?.files) && payload.files.length === 1;
navigator.share = async (payload) => {
  sharedPayload = payload;
};

const shareResult = await shareStoredJobProtocol({
  supabase,
  record: replaced,
  intent: 'print',
  createPrintImage: async (blob, fileName) => {
    assert.equal(blob, replacementBlob);
    assert.equal(fileName, replaced.file_name);
    return new File(['temporary print image'], 'wawis-protokol-zmieniony-druk.png', { type: 'image/png' });
  },
});
assert.equal(shareResult.method, 'share-image');
assert.deepEqual(Object.keys(sharedPayload), ['files']);
assert.equal(sharedPayload.files.length, 1);
assert.equal(sharedPayload.files[0].name, 'wawis-protokol-zmieniony-druk.png');
assert.equal(sharedPayload.files[0].type, 'image/png');
assert.equal(await sharedPayload.files[0].text(), 'temporary print image');

await assert.rejects(
  () => storeJobProtocol({
    supabase,
    job: { ...completedJob, id: '22222222-2222-4222-8222-222222222222', status: 'W trakcie' },
    pdfBlob,
    fileName: 'nie-wolno.pdf',
    signedAt,
  }),
  /dopiero po zakończeniu zlecenia/,
);

assert.equal(rows.length, 1);
console.log('PASS test-job-protocol-storage-v979');
