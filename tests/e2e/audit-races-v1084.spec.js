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
});
