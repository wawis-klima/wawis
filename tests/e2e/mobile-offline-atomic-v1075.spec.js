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


test('@mobile v10.80 — spóźniona aktualizacja nie wskrzesza zastąpionej operacji', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('wawis-mobile-offline-data');
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    });
    const store = await import('/src/mobile791/modules/job-offline-store.js');
    await store.queueOfflineJobOperation({
      id: 'status-race-old', user_id: 'worker-race', job_id: 'job-race', type: 'status',
      base: { status: 'Nowe' }, payload: { status: 'W trakcie' }, created_at: '2026-09-16T08:00:00.000Z',
    });

    const originalTransaction = IDBDatabase.prototype.transaction;
    let delayedReadonly = false;
    IDBDatabase.prototype.transaction = function patchedTransaction(storeNames, mode, ...args) {
      const tx = originalTransaction.call(this, storeNames, mode, ...args);
      if (!delayedReadonly && mode === 'readonly' && String(storeNames).includes('job-operations')) {
        delayedReadonly = true;
        let assigned = null;
        Object.defineProperty(tx, 'oncomplete', {
configurable: true,
get: () => assigned,
set: (handler) => {
  assigned = handler;
  tx.addEventListener('complete', (event) => setTimeout(() => handler?.call(tx, event), 60), { once: true });
},
        });
      }
      return tx;
    };
    try {
      const lateUpdate = store.updateOfflineJobOperation('status-race-old', { error: 'late-old-update' });
      await new Promise((resolve) => setTimeout(resolve, 15));
      const replacement = store.queueOfflineJobOperation({
        id: 'status-race-new', user_id: 'worker-race', job_id: 'job-race', type: 'status',
        base: { status: 'W trakcie' }, payload: { status: 'Zakończone' }, created_at: '2026-09-16T08:01:00.000Z',
      });
      await Promise.all([lateUpdate, replacement]);
    } finally {
      IDBDatabase.prototype.transaction = originalTransaction;
    }
    const rows = await store.listOfflineJobOperations('worker-race');
    return rows.map((row) => ({ id: row.id, payload: row.payload, error: row.error }));
  });
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('status-race-new');
  expect(result[0].payload.status).toBe('Zakończone');
});
