import { expect, test } from '@playwright/test';

test.describe('@mobile 10.84 — wyścigi IndexedDB', () => {
  test('stary update kursora nie przywraca starego snapshotu po nowszym zapisie', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const store = await import('/src/mobile791/modules/job-offline-store.js');
      const userId = 'v1084-cursor-race-user';
      const dbName = 'wawis-mobile-offline-data';
      await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });

      let failures = 0;
      for (let round = 0; round < 12; round += 1) {
        const baseTime = 1000 + round * 10;
        await store.saveOfflineAppSnapshot({
          userId, profile: { id: userId }, profiles: [],
          jobs: [{ id: 'job', marker: 'old-' + round }],
          serverFetchedAtMs: baseTime, changeCursor: 1,
        });

        const staleUpdates = Array.from({ length: 24 }, () => store.updateOfflineSyncCursor(userId, 2));
        const freshWrite = store.saveOfflineAppSnapshot({
          userId, profile: { id: userId }, profiles: [],
          jobs: [{ id: 'job', marker: 'new-' + round }],
          serverFetchedAtMs: baseTime + 5, changeCursor: 3,
        });
        await Promise.all([...staleUpdates, freshWrite]);
        const snapshot = await store.loadOfflineAppSnapshot(userId);
        if (Number(snapshot?.change_cursor || 0) !== 3 || snapshot?.jobs?.[0]?.marker !== 'new-' + round) failures += 1;
      }
      return { failures };
    });
    expect(result.failures).toBe(0);
  });

  test('usunięty rekord kolejki zdjęć nie może zostać wskrzeszony przez spóźniony update', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
      const id = 'local-photo-upload-v1084-delete-race';
      let failures = 0;
      for (let round = 0; round < 16; round += 1) {
        const file = new File([`v1084-${round}`], `v1084-${round}.jpg`, { type: 'image/jpeg' });
        await queue.savePhotoQueueItem({
          id,
          job_id: 'mock-job-002',
          uploaded_by: 'mock-worker-1',
          created_at: new Date(1000 + round).toISOString(),
          __localFile: file,
          upload_status: 'error',
        });
        const updates = Array.from({ length: 32 }, (_, index) => queue.updatePhotoQueueItem(id, {
          retry_count: index + 1,
          last_attempt_at: new Date(2000 + index).toISOString(),
        }));
        const deletion = queue.deletePhotoQueueItem(id);
        await Promise.allSettled([...updates, deletion]);
        const exists = (await queue.listPhotoQueueItems()).some((item) => String(item.id) === id);
        if (exists) {
          failures += 1;
          await queue.deletePhotoQueueItem(id);
        }
      }
      return { failures };
    });
    expect(result.failures).toBe(0);
  });

});
