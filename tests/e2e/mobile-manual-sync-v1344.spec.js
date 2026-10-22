import { test, expect } from '@playwright/test';

test('@mobile v13.44 — ręczna synchronizacja pomija backoff tylko wybranego oczekującego montażu', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const deleteDb = () => new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('wawis-mobile-offline-data');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    await deleteDb();

    const store = await import('/src/mobile791/modules/job-offline-store.js');
    const { syncOfflineJobOperations } = await import('/src/mobile791/modules/job-offline-sync.js');
    const userId = 'manual-sync-admin';
    const jobId = 'manual-sync-job';
    const otherJobId = 'manual-sync-other-job';
    const requiredPath = 'jobs/manual-sync-job/nameplate/outdoor.jpg';
    const futureRetry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await store.queueOfflineJobOperation({
      id: 'manual-sync-target',
      user_id: userId,
      job_id: jobId,
      type: 'device',
      base: { device_model: 'Old', device_serial_number: 'OLD-1' },
      payload: {
        device_fields: { device_model: 'New', device_serial_number: 'NEW-1' },
        required_nameplate_paths: [requiredPath],
      },
    });
    await store.updateOfflineJobOperation('manual-sync-target', {
      status: 'pending',
      error: 'Zapis urządzeń czeka na zdjęcia.',
      next_attempt_at: futureRetry,
    });
    await store.queueOfflineJobOperation({
      id: 'manual-sync-other',
      user_id: userId,
      job_id: otherJobId,
      type: 'device',
      base: { device_model: 'Other old', device_serial_number: 'OTHER-OLD' },
      payload: { device_fields: { device_model: 'Other new', device_serial_number: 'OTHER-NEW' } },
    });
    await store.updateOfflineJobOperation('manual-sync-other', { next_attempt_at: futureRetry });

    const jobs = new Map([
      [jobId, { id: jobId, status: 'W trakcie', device_model: 'Old', device_serial_number: 'OLD-1' }],
      [otherJobId, { id: otherJobId, status: 'W trakcie', device_model: 'Other old', device_serial_number: 'OTHER-OLD' }],
    ]);
    const serverPhotos = [{
      id: 'server-nameplate', job_id: jobId, storage_path: requiredPath,
      photo_kind: 'nameplate', device_index: 1, unit_ref: 'outdoor',
    }];
    const receipts = new Set();
    const supabase = {
      storage: { from() { return { download: async () => ({ data: new Blob(['fixture-server-photo']), error: null }) }; } },
      from(table) {
        const state = { filters: {}, updateValues: null, insertValues: null };
        const query = {
          select() { return this; },
          eq(key, value) { state.filters[key] = value; return this; },
          order() { return this; },
          is(key) { state.filters[key] = null; return this; },
          update(values) { state.updateValues = values; return this; },
          insert(values) {
            state.insertValues = values;
            if (table === 'mobile_sync_receipts') receipts.add(values.operation_id);
            return { error: null };
          },
          maybeSingle: async () => {
            if (table === 'mobile_sync_receipts') {
              return { data: receipts.has(state.filters.operation_id) ? { operation_id: state.filters.operation_id } : null, error: null };
            }
            if (table === 'jobs') {
              const job = jobs.get(state.filters.id);
              if (!job) return { data: null, error: null };
              if (state.updateValues) Object.assign(job, state.updateValues);
              return { data: state.updateValues ? { id: job.id } : { ...job }, error: null };
            }
            return { data: null, error: null };
          },
          then(resolve, reject) {
            const data = table === 'photos'
              ? serverPhotos.filter((photo) => String(photo.job_id) === String(state.filters.job_id))
              : [];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return query;
      },
    };

    const profile = { id: userId, role: 'Administrator' };
    const automaticAttempt = await syncOfflineJobOperations({ supabase, profile, allowedTypes: ['device'] });
    const prepared = await store.makeOfflineJobOperationsRetryableNow(userId, { jobId, allowedTypes: ['device'] });
    const afterPrepare = await store.listOfflineJobOperations(userId);
    const manualAttempt = await syncOfflineJobOperations({ supabase, profile, allowedTypes: ['device'] });
    await store.queueOfflineJobOperation({
      id: 'manual-sync-conflict', user_id: userId, job_id: jobId, type: 'comment', payload: { text: 'conflict' },
    });
    await store.updateOfflineJobOperation('manual-sync-conflict', { status: 'conflict', error: 'Konflikt' });
    await store.queueOfflineJobOperation({
      id: 'manual-sync-active', user_id: userId, job_id: jobId, type: 'status', payload: { status: 'Zakończone' },
    });
    await store.updateOfflineJobOperation('manual-sync-active', {
      status: 'syncing',
      lease_until: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    });
    const protectedPrepared = await store.makeOfflineJobOperationsRetryableNow(userId, { jobId });
    const remaining = await store.listOfflineJobOperations(userId);

    return {
      automaticProcessed: automaticAttempt.processed,
      prepared,
      targetWasDue: afterPrepare.find((item) => item.id === 'manual-sync-target')?.next_attempt_at === '',
      otherStillBackedOff: afterPrepare.find((item) => item.id === 'manual-sync-other')?.next_attempt_at === futureRetry,
      manualSynced: manualAttempt.synced,
      protectedPrepared,
      conflictStillProtected: remaining.find((item) => item.id === 'manual-sync-conflict')?.status === 'conflict',
      activeStillProtected: remaining.find((item) => item.id === 'manual-sync-active')?.status === 'syncing',
      targetRemaining: remaining.some((item) => item.id === 'manual-sync-target'),
      otherRemaining: remaining.some((item) => item.id === 'manual-sync-other'),
      savedJob: jobs.get(jobId),
    };
  });

  expect(result.automaticProcessed).toBe(0);
  expect(result.prepared).toBe(1);
  expect(result.targetWasDue).toBe(true);
  expect(result.otherStillBackedOff).toBe(true);
  expect(result.manualSynced).toBe(1);
  expect(result.protectedPrepared).toBe(0);
  expect(result.conflictStillProtected).toBe(true);
  expect(result.activeStillProtected).toBe(true);
  expect(result.targetRemaining).toBe(false);
  expect(result.otherRemaining).toBe(true);
  expect(result.savedJob.device_model).toBe('New');
  expect(result.savedJob.device_serial_number).toBe('NEW-1');
});

test('@mobile v13.44 — oczekujący montaż i diagnostyka pokazują ręczną synchronizację', async ({ page }) => {
  await page.goto('/');
  const sources = await page.evaluate(async () => {
    const [details, diagnostics, syncCenter] = await Promise.all([
      fetch('/src/mobile791/components/JobDetailsPanel.jsx').then((response) => response.text()),
      fetch('/src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx').then((response) => response.text()),
      fetch('/src/mobile791/components/PhotoSyncStatus.jsx').then((response) => response.text()),
    ]);
    return { details, diagnostics, syncCenter };
  });

  expect(sources.details).toContain('Synchronizuj teraz');
  expect(sources.details).toContain('synchronizePendingChanges(selectedJobId)');
  expect(sources.diagnostics).toContain("await synchronizeNow({ jobId: selectedJobId })");
  expect(sources.syncCenter).toContain('Synchronizuj teraz');
});

test('@mobile v13.45 — błąd przygotowania zdjęcia nie zatrzymuje kolejki i zachowuje plik w IndexedDB', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const store = await import('/src/mobile791/modules/photo-offline-queue.js');
    const { retryAllPersistedPhotoUploads } = await import('/src/mobile791/modules/photos.js');
    const photoId = 'local-photo-upload-resilience-1345';
    const userId = 'user-resilience-1345';
    const originalFile = globalThis.File;
    const saved = await store.savePhotoQueueItem({
      id: photoId,
      job_id: 'job-resilience-1345',
      uploaded_by: userId,
      user_id: userId,
      upload_key: 'resilience-1345',
      planned_storage_path: 'job-resilience-1345/nameplates/resilience.jpg',
      photo_kind: 'nameplate',
      device_index: 1,
      unit_ref: 'jz',
      local_file: new originalFile(['test-bytes-1345'], 'nameplate.jpg', { type: 'image/jpeg' }),
      upload_status: 'local',
    });
    let notified = 0;
    let queueResult = null;
    let thrown = null;
    try {
      globalThis.File = class BrokenFile extends originalFile {
        constructor() { throw new Error('SIMULATED_WEBKIT_FILE_REHYDRATION_FAILURE'); }
      };
      queueResult = await retryAllPersistedPhotoUploads({
        supabase: {},
        profile: { id: userId },
        onPhotoUploadError: () => { notified += 1; },
      });
    } catch (error) {
      thrown = String(error?.message || error);
    } finally {
      globalThis.File = originalFile;
    }
    const entries = await store.listPhotoQueueItems();
    const preserved = entries.find((entry) => entry.id === photoId);
    if (preserved) await store.deletePhotoQueueItem(photoId);
    return {
      saved,
      failed: queueResult?.failed,
      thrown,
      notified,
      remained: Boolean(preserved),
      size: preserved?.local_file?.size || 0,
      status: preserved?.upload_status,
    };
  });
  expect(result.saved).toBe(true);
  expect(result.thrown).toBe(null);
  expect(result.failed).toBe(1);
  expect(result.notified).toBeGreaterThan(0);
  expect(result.remained).toBe(true);
  expect(result.size).toBeGreaterThan(0);
  expect(result.status).toBe('error');
});
