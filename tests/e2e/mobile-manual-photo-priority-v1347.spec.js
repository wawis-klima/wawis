import { devices, expect, test } from '@playwright/test';

const { defaultBrowserType: _browser, ...iphone } = devices['iPhone 14'];
test.use(iphone);

// Regression from physical iPhone 2026-10-22: 4 stale/active queue items
// from other jobs blocked two tabliczki for the selected test job.
test('@mobile P0 manual synchronizacja wybranego montażu omija zawieszony globalny worker', async ({ page }) => {
  await page.route('**/__wawis_manual_priority__', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body>Manual selected job priority test</body></html>',
  }));
  await page.goto('/__wawis_manual_priority__');
  const outcome = await page.evaluate(async () => {
    const photos = await import('/src/mobile791/modules/photos.js');
    const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
    for (const item of await queue.listPhotoQueueItems()) await queue.deletePhotoQueueItem(item.id);

    const oldJob = 'old-job-blocking', chosenJob = 'selected-job-now';
    const payload = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 4, 6, 2, 0xff, 0xd9]);
    const createRecord = (jobId, suffix) => {
      const path = jobId + '/nameplates/device-1_jz_TEST_' + suffix + '.jpg';
      return {
        id: 'local-queue-' + suffix,
        job_id: jobId,
        user_id: 'iphone-user',
        uploaded_by: 'iphone-user',
        upload_key: 'upload-' + suffix,
        file_fingerprint: 'fingerprint-' + suffix,
        planned_storage_path: path,
        local_file: new File([payload], suffix + '.jpg', { type: 'image/jpeg' }),
        photo_kind: 'nameplate', device_index: 1, unit_ref: 'jz',
        serial_number: 'TEST', upload_status: 'local',
        created_at: suffix === 'old' ? '2026-10-22T08:00:00Z' : '2026-10-22T11:00:00Z',
      };
    };
    await queue.savePhotoQueueItem(createRecord(oldJob, 'old'));
    await queue.savePhotoQueueItem(createRecord(chosenJob, 'chosen'));
    const remote = new Map();
    const serverRows = [];
    let oldUploadStarted;
    const blocked = new Promise((resolve) => { oldUploadStarted = resolve; });
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: 'iphone-user' } }, error: null }) },
      from(table) {
        if (table !== 'photos') throw new Error('Unexpected table ' + table);
        const checks = [];
        let inserting = null;
        return {
          select() { return this; },
          eq(k,v) { checks.push([k,v]); return this; },
          async maybeSingle() {
            return { data: serverRows.find((row) => checks.every(([k,v]) => row[k] === v)) || null, error: null };
          },
          insert(row) { inserting = { ...row, id: 'remote-' + serverRows.length, created_at: new Date().toISOString() }; return this; },
          async single() { serverRows.push(inserting); return { data: inserting, error: null }; },
        };
      },
      storage: { from() { return {
        async upload(path, body) {
          if (path.startsWith(oldJob + '/')) {
            oldUploadStarted();
            return new Promise(() => {}); // first/global worker remains stuck
          }
          remote.set(path, body instanceof ArrayBuffer ? new Blob([body], { type: 'image/jpeg' }) : body);
          return { data: { path }, error: null };
        },
        async download(path) { return remote.has(path)
          ? { data: remote.get(path), error: null }
          : { data: null, error: { statusCode: 404, message: 'not found' } }; },
        async createSignedUrl() { return { data: { signedUrl: 'https://example.invalid/photo' }, error: null }; },
      }; } },
    };
    const updates = { setJobs() {}, setSelectedJob() {} };
    // Global worker starts on OLD photo and never resolves.
    void photos.resumePersistedPhotoUploads({
      supabase, profile: { id: 'iphone-user' }, ...updates,
    });
    const backgroundReachedOldUpload = await Promise.race([
      blocked.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 6000)),
    ]);
    if (!backgroundReachedOldUpload) return { error: 'Global worker never started old upload' };
    const result = await Promise.race([
      photos.retryAllPersistedPhotoUploads({
        supabase, profile: { id: 'iphone-user' }, jobId: chosenJob, ...updates,
      }).then((value) => ({ finished: true, value })),
      new Promise((resolve) => setTimeout(() => resolve({ finished: false }), 6000)),
    ]);
    const leftovers = await queue.listPhotoQueueItems();
    return {
      result: result.finished,
      uploaded: result.value?.uploaded,
      selectedOnServer: serverRows.some((row) => row.job_id === chosenJob),
      selectedStillInQueue: leftovers.some((row) => row.job_id === chosenJob),
      oldStillInQueue: leftovers.some((row) => row.job_id === oldJob),
    };
  });
  expect(outcome.error).toBeUndefined();
  expect(outcome.result).toBe(true);
  expect(outcome.uploaded).toBe(1);
  expect(outcome.selectedOnServer).toBe(true);
  expect(outcome.selectedStillInQueue).toBe(false);
  expect(outcome.oldStillInQueue).toBe(true);
});
