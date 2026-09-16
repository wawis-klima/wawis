import { test, expect } from '@playwright/test';

test('@mobile v10.75 — wymiana operacji offline jest atomowa przy błędzie IndexedDB', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const deleteDatabase = () => new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('wawis-mobile-offline-data');
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    });
    await deleteDatabase();

    const store = await import('/src/mobile791/modules/job-offline-store.js');
    await store.queueOfflineJobOperation({
      id: 'status-old',
      user_id: 'worker-atomic',
      job_id: 'job-atomic',
      type: 'status',
      base: { status: 'Nowe' },
      payload: { status: 'W trakcie' },
      created_at: '2026-09-16T06:00:00.000Z',
    });

    const originalPut = IDBObjectStore.prototype.put;
    let failureName = '';
    IDBObjectStore.prototype.put = function patchedPut(value, ...args) {
      if (String(value?.id || '') === 'status-new-fail') {
        throw new DOMException('Wymuszony brak miejsca', 'QuotaExceededError');
      }
      return originalPut.call(this, value, ...args);
    };
    try {
      await store.queueOfflineJobOperation({
        id: 'status-new-fail',
        user_id: 'worker-atomic',
        job_id: 'job-atomic',
        type: 'status',
        base: { status: 'W trakcie' },
        payload: { status: 'Zakończone' },
        created_at: '2026-09-16T06:01:00.000Z',
      });
    } catch (error) {
      failureName = String(error?.name || '');
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }

    const afterFailure = await store.listOfflineJobOperations('worker-atomic');
    const replacement = await store.queueOfflineJobOperation({
      id: 'status-new-ok',
      user_id: 'worker-atomic',
      job_id: 'job-atomic',
      type: 'status',
      base: { status: 'W trakcie' },
      payload: { status: 'Zakończone' },
      created_at: '2026-09-16T06:02:00.000Z',
    });
    const afterSuccess = await store.listOfflineJobOperations('worker-atomic');
    return {
      failureName,
      afterFailure: afterFailure.map((item) => ({ id: item.id, base: item.base, payload: item.payload })),
      replacement: { id: replacement?.id, base: replacement?.base, payload: replacement?.payload },
      afterSuccess: afterSuccess.map((item) => ({ id: item.id, base: item.base, payload: item.payload })),
    };
  });

  expect(result.failureName).toBe('QuotaExceededError');
  expect(result.afterFailure).toHaveLength(1);
  expect(result.afterFailure[0].id).toBe('status-old');
  expect(result.afterFailure[0].payload.status).toBe('W trakcie');
  expect(result.replacement.id).toBe('status-new-ok');
  expect(result.replacement.base.status).toBe('Nowe');
  expect(result.afterSuccess).toHaveLength(1);
  expect(result.afterSuccess[0].id).toBe('status-new-ok');
  expect(result.afterSuccess[0].base.status).toBe('Nowe');
  expect(result.afterSuccess[0].payload.status).toBe('Zakończone');
});
