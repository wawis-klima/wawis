import { devices, expect, test } from '@playwright/test';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

// Blank document on the SAME origin as Vite: actual application modules and
// real browser IndexedDB, but no mounted app, timers or production accounts.
async function openIsolatedBrowserFixture(page) {
  await page.route('**/__wawis_p0_queue_fixture__', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html lang="pl"><head><meta charset="utf-8"></head><body>P0 IndexedDB fixture</body></html>',
  }));
  await page.goto('/__wawis_p0_queue_fixture__');
}

async function restoreWithSyntheticServer({ seed, status, remote }) {
  const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
  const photos = await import('/src/mobile791/modules/photos.js');
  const id = 'legacy-photo-p0-synthetic';
  const jobId = 'job-p0-synthetic';
  const ownerId = 'worker-p0-synthetic';
  const original = 'WAWIS-NEW-NAMEPLATE-CONTENT-P0';

  if (seed) {
    for (const entry of await queue.listPhotoQueueItems()) {
      await queue.deletePhotoQueueItem(entry.id);
    }
    const file = new File([original], 'new-nameplate.jpg', { type: 'image/jpeg', lastModified: 1 });
    const saved = await queue.savePhotoQueueItem({
      id,
      job_id: jobId,
      uploaded_by: ownerId,
      user_id: ownerId,
      created_at: new Date().toISOString(),
      photo_kind: 'nameplate',
      device_index: 1,
      unit_ref: 'jz',
      upload_status: status,
      legacy_queue_item: true,
      // Legacy: no upload_key or planned_storage_path.
      local_file: file,
    });
    if (!saved) throw new Error('Nie zapisano lokalnego File w IndexedDB.');
  }
  const before = await queue.listPhotoQueueItems();
  const queued = before.find((entry) => entry.id === id);
  if (!queued) throw new Error('Brak pierwotnego rekordu legacy przed restore.');

  const remotePhoto = {
    id: remote === 'exact' ? 'server-exact-photo' : 'server-old-different-photo',
    job_id: jobId,
    uploaded_by: ownerId,
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    photo_kind: 'nameplate',
    device_index: 1,
    unit_ref: 'jz',
    storage_path: ['exact', 'missing', 'differentBytes', 'denied', 'serverError', 'empty'].includes(remote)
      ? queued.planned_storage_path
      : `${jobId}/nameplates/device-1_jz_old-other-content.jpg`,
    image_url: '',
  };
  const serverPhotos = remote === 'none' ? [] : [remotePhoto];
  const supabase = {
    from(name) {
      if (name !== 'photos') throw new Error(`Nieoczekiwana tabela: ${name}`);
      const filters = [];
      const query = {
        select() { return this; },
        eq(field, value) { filters.push([field, value]); return this; },
        async maybeSingle() {
          return { data: serverPhotos.find((photo) => filters.every(([key, value]) => photo[key] === value)) || null, error: null };
        },
        then(onSuccess, onError) {
          const data = serverPhotos.filter((photo) => filters.every(([key, value]) => photo[key] === value));
          return Promise.resolve({ data, error: null }).then(onSuccess, onError);
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        if (bucket !== 'job-photos') throw new Error(`Nieoczekiwany bucket: ${bucket}`);
        return {
          async createSignedUrl(path) {
            return { data: { signedUrl: `https://photos.example.invalid/${encodeURIComponent(path)}` }, error: null };
          },
          async download(path) {
            if (path !== remotePhoto.storage_path || remote === 'missing') {
              return { data: null, error: { statusCode: 404, message: 'Object not found' } };
            }
            if (remote === 'denied') return { data: null, error: { statusCode: 403, message: 'Forbidden' } };
            if (remote === 'serverError') return { data: null, error: { statusCode: 503, message: 'Storage unavailable' } };
            if (remote === 'empty') return { data: new Blob([]), error: null };
            return { data: new Blob([remote === 'differentBytes' ? 'WAWIS-OTHER-NAMEPLATE-CONTENT!' : original], { type: 'image/jpeg' }), error: null };
          },
        };
      },
    },
  };

  let jobs = [{ id: jobId, photos: [] }];
  let selectedJob = { id: jobId, photos: [] };
  await photos.restorePersistedJobPhotos({
    supabase,
    supabaseUrl: 'https://example.invalid',
    profile: { id: ownerId },
    setJobs: (update) => { jobs = update(jobs); },
    setSelectedJob: (update) => { selectedJob = update(selectedJob); },
  });
  const remaining = await queue.listPhotoQueueItems();
  const current = remaining.find((entry) => entry.id === id);
  return {
    remainingCount: remaining.length,
    preservedId: Boolean(current),
    preservedOriginalBytes: current?.local_file ? await current.local_file.text() : null,
    preservedStatus: current?.upload_status || null,
    recordedPath: current?.planned_storage_path || null,
    displayedServerIds: (selectedJob.photos || []).filter((photo) => photo.upload_status === 'uploaded').map((photo) => photo.id),
    displayedLocalIds: (selectedJob.photos || []).filter((photo) => photo.upload_status !== 'uploaded').map((photo) => photo.id),
  };
}

test.describe('@mobile P0 — legacy tabliczki w trwałej kolejce', () => {
  for (const status of ['error', 'uploading']) {
    test(`inny plik z tej samej jednostki nie usuwa niewysłanego File (${status}), także po reload`, async ({ page }) => {
      await openIsolatedBrowserFixture(page);
      const first = await page.evaluate(restoreWithSyntheticServer, { seed: true, status, remote: 'different' });
      expect(first.remainingCount).toBe(1);
      expect(first.preservedId).toBe(true);
      expect(first.preservedOriginalBytes).toBe('WAWIS-NEW-NAMEPLATE-CONTENT-P0');
      expect(first.preservedStatus).toBe(status);
      expect(first.displayedServerIds).toEqual([]);
      expect(first.displayedLocalIds).toEqual(['legacy-photo-p0-synthetic']);

      await page.reload();
      const second = await page.evaluate(restoreWithSyntheticServer, { seed: false, status, remote: 'different' });
      expect(second.remainingCount).toBe(1);
      expect(second.preservedOriginalBytes).toBe('WAWIS-NEW-NAMEPLATE-CONTENT-P0');
      expect(second.displayedServerIds).toEqual([]);
    });
  }


  test('dwie karty nie uzgadniają lokalnego File z obcą tabliczką tej samej jednostki', async ({ browser }) => {
    const context = await browser.newContext(iphone14);
    try {
      const firstPage = await context.newPage();
      const secondPage = await context.newPage();
      await openIsolatedBrowserFixture(firstPage);
      await openIsolatedBrowserFixture(secondPage);

      const first = await firstPage.evaluate(restoreWithSyntheticServer, { seed: true, status: 'error', remote: 'different' });
      const second = await secondPage.evaluate(restoreWithSyntheticServer, { seed: false, status: 'error', remote: 'different' });
      const firstAgain = await firstPage.evaluate(restoreWithSyntheticServer, { seed: false, status: 'error', remote: 'different' });

      for (const state of [first, second, firstAgain]) {
        expect(state.remainingCount).toBe(1);
        expect(state.preservedOriginalBytes).toBe('WAWIS-NEW-NAMEPLATE-CONTENT-P0');
        expect(state.displayedServerIds).toEqual([]);
      }
    } finally {
      await context.close();
    }
  });


  for (const remote of ['missing', 'differentBytes', 'denied', 'serverError', 'empty']) {
    test(`P0-R1: zgodna ścieżka, ale brak wiarygodnych bajtów Storage (${remote}) nie usuwa Blob`, async ({ page }) => {
      await openIsolatedBrowserFixture(page);
      const result = await page.evaluate(restoreWithSyntheticServer, { seed: true, status: 'error', remote });
      expect(result.remainingCount).toBe(1);
      expect(result.preservedOriginalBytes).toBe('WAWIS-NEW-NAMEPLATE-CONTENT-P0');
      expect(result.displayedServerIds).toEqual([]);
      await page.reload();
      const repeated = await page.evaluate(restoreWithSyntheticServer, { seed: false, status: 'error', remote });
      expect(repeated.remainingCount).toBe(1);
      expect(repeated.preservedOriginalBytes).toBe('WAWIS-NEW-NAMEPLATE-CONTENT-P0');
    });
  }

  for (const status of ['error', 'uploading']) {
    test(`dokładnie potwierdzona ścieżka uzgadnia legacy po reload (${status})`, async ({ page }) => {
      await openIsolatedBrowserFixture(page);
      const first = await page.evaluate(restoreWithSyntheticServer, { seed: true, status, remote: 'none' });
      expect(first.remainingCount).toBe(1);
      expect(first.recordedPath).toContain('job-p0-synthetic/nameplates/');

      await page.reload();
      const confirmed = await page.evaluate(restoreWithSyntheticServer, { seed: false, status, remote: 'exact' });
      expect(confirmed.remainingCount).toBe(0);
      expect(confirmed.displayedServerIds).toEqual(['server-exact-photo']);
    });
  }
});
