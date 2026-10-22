import { test, expect } from '@playwright/test';

test('@mobile v13.43 — offline można kolejkować sam zapis urządzenia, bez zmian reszty montażu', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { isDeviceOnlyOfflineEdit } = await import('/src/mobile791/modules/job-offline-device-edit.js');
    const { buildEditJobForm } = await import('/src/mobile791/modules/jobs-form.js');
    const job = { id: 'offline-edit-1', client: 'Klient', status: 'W trakcie', device_model: 'Stary', device_serial_number: 'SN-1' };
    const base = { ...buildEditJobForm({ job, profiles: [], normalizeStatus: (value) => value }), nip: '' };
    const deviceEdit = { ...base, device_model: 'Nowy', device_serial_number: 'SN-2', devices: [{ model: 'Nowy', serial_number: 'SN-2' }], pending_nameplate_photos: [{ file: {} }] };
    const otherEdit = { ...deviceEdit, client: 'Inny klient' };
    return {
      deviceOnly: isDeviceOnlyOfflineEdit({ form: deviceEdit, baseJob: job, profiles: [], normalizeStatus: (value) => value }),
      includesOtherField: isDeviceOnlyOfflineEdit({ form: otherEdit, baseJob: job, profiles: [], normalizeStatus: (value) => value }),
    };
  });
  expect(result.deviceOnly).toBe(true);
  expect(result.includesOtherField).toBe(false);
});

test('@mobile v13.43 — zapis urządzenia czeka na konkretną tabliczkę i synchronizuje się u administratora', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const removeDb = () => new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('wawis-mobile-offline-data');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    await removeDb();
    const store = await import('/src/mobile791/modules/job-offline-store.js');
    const { syncOfflineJobOperations } = await import('/src/mobile791/modules/job-offline-sync.js');
    const path = 'jobs/job-photo-dependency/nameplate/device-1.jpg';
    const secondPath = 'jobs/job-photo-dependency/nameplate/device-2.jpg';
    let duplicateSerial = false;
    await store.queueOfflineJobOperation({
      id: 'device-photo-dependency', user_id: 'admin-photo-dependency', job_id: 'job-photo-dependency', type: 'device',
      base: { device_model: 'Old', device_serial_number: 'OLD-1' },
      payload: { device_fields: { device_model: 'New', device_serial_number: 'NEW-1' }, required_nameplate_paths: [path] },
    });
    await store.queueOfflineJobOperation({
      id: 'device-photo-dependency-retry', user_id: 'admin-photo-dependency', job_id: 'job-photo-dependency', type: 'device',
      base: { device_model: 'New', device_serial_number: 'NEW-1' },
      payload: { device_fields: { device_model: 'New', device_serial_number: 'NEW-1' }, required_nameplate_paths: [secondPath] },
    });
    await store.queueOfflineJobOperation({
      id: 'comment-admin-not-allowed', user_id: 'admin-photo-dependency', job_id: 'job-photo-dependency', type: 'comment',
      payload: { text: 'should not sync for admin device-only run' },
    });
    const serverJob = { id: 'job-photo-dependency', status: 'W trakcie', device_model: 'Old', device_serial_number: 'OLD-1' };
    let serverPhotos = [];
    const supabase = {
      from(table) {
        const query = {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          is() { return this; },
          update(values) { this.values = values; return this; },
          insert() { return { error: null }; },
          maybeSingle: async () => table === 'jobs'
            ? { data: { ...serverJob }, error: null }
            : { data: null, error: null },
          then(resolve, reject) {
            return Promise.resolve({ data: table === 'photos' ? serverPhotos : [], error: null }).then(resolve, reject);
          },
        };
        if (table === 'jobs') {
          const maybeSingle = query.maybeSingle;
          query.maybeSingle = async () => {
            if (query.values) Object.assign(serverJob, query.values);
            return maybeSingle();
          };
          query.select = function select() {
            if (query.values) return { maybeSingle: async () => {
              if (duplicateSerial && query.values.device_serial_number === 'DUP-1') {
                return { data: null, error: { code: '23505', constraint: 'devices_serial_number_key', message: 'duplicate key value violates unique constraint devices_serial_number_key' } };
              }
              Object.assign(serverJob, query.values);
              return { data: { id: serverJob.id }, error: null };
            } };
            return this;
          };
        }
        return query;
      },
    };
    const profile = { id: 'admin-photo-dependency', role: 'admin' };
    const waiting = await syncOfflineJobOperations({ supabase, profile, allowedTypes: ['device'] });
    const afterWaiting = await store.listOfflineJobOperations(profile.id);
    await store.updateOfflineJobOperation('device-photo-dependency-retry', { next_attempt_at: '' });
    serverPhotos = [{ id: 'photo-1', storage_path: path, photo_kind: 'nameplate', device_index: 1, unit_ref: 'outdoor' }];
    const stillWaiting = await syncOfflineJobOperations({ supabase, profile, allowedTypes: ['device'] });
    await store.updateOfflineJobOperation('device-photo-dependency-retry', { next_attempt_at: '' });
    serverPhotos.push({ id: 'photo-2', storage_path: secondPath, photo_kind: 'nameplate', device_index: 2, unit_ref: 'outdoor' });
    const synced = await syncOfflineJobOperations({ supabase, profile, allowedTypes: ['device'] });
    const adminServerJob = { ...serverJob };
    const remaining = await store.listOfflineJobOperations(profile.id);
    await store.queueOfflineJobOperation({
      id: 'worker-device-save', user_id: 'worker-photo-dependency', job_id: 'job-photo-dependency', type: 'device',
      base: { device_model: 'New', device_serial_number: 'NEW-1' },
      payload: { device_fields: { device_model: 'Worker saved', device_serial_number: 'WORKER-1' } },
    });
    const workerSync = await syncOfflineJobOperations({ supabase, profile: { id: 'worker-photo-dependency' } });
    duplicateSerial = true;
    await store.queueOfflineJobOperation({
      id: 'worker-duplicate-serial', user_id: 'worker-photo-dependency', job_id: 'job-photo-dependency', type: 'device',
      base: { device_model: 'Worker saved', device_serial_number: 'WORKER-1' },
      payload: { device_fields: { device_model: 'Duplicate', device_serial_number: 'DUP-1' } },
    });
    const duplicateSync = await syncOfflineJobOperations({ supabase, profile: { id: 'worker-photo-dependency' } });
    const duplicateOperation = (await store.listOfflineJobOperations('worker-photo-dependency'))
      .find((item) => item.id === 'worker-duplicate-serial');
    const duplicateProjection = store.applyOfflineOperationsToJobs([{ id: serverJob.id, device_model: 'Duplicate', device_serial_number: 'DUP-1', offline_pending: true }], [duplicateOperation])[0];
    return {
      waitingErrors: waiting.errors,
      deviceRetained: afterWaiting.some((item) => item.id === 'device-photo-dependency-retry' && item.status === 'pending' && item.payload.required_nameplate_paths?.length === 2),
      commentRetained: afterWaiting.some((item) => item.id === 'comment-admin-not-allowed'),
      secondDependencyWaited: stillWaiting.errors === 1,
      syncedCount: synced.synced,
      remainingDevice: remaining.some((item) => item.id === 'device-photo-dependency-retry'),
      workerSynced: workerSync.synced,
      duplicateConflictCount: duplicateSync.conflicts,
      duplicateRestoresServer: duplicateProjection.device_model === 'Worker saved'
        && duplicateProjection.device_serial_number === 'WORKER-1'
        && duplicateProjection.offline_conflict === true
        && duplicateProjection.offline_pending === false,
      adminServerJob,
      serverJob,
    };
  });
  expect(result.waitingErrors).toBe(1);
  expect(result.deviceRetained).toBe(true);
  expect(result.commentRetained).toBe(true);
  expect(result.secondDependencyWaited).toBe(true);
  expect(result.syncedCount).toBe(1);
  expect(result.remainingDevice).toBe(false);
  expect(result.adminServerJob.device_model).toBe('New');
  expect(result.adminServerJob.device_serial_number).toBe('NEW-1');
  expect(result.workerSynced).toBe(1);
  expect(result.duplicateConflictCount).toBe(1);
  expect(result.duplicateRestoresServer).toBe(true);
  expect(result.serverJob.device_model).toBe('Worker saved');
});
