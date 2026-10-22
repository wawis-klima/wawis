import { devices, expect, test } from '@playwright/test';

// 13.46: real iPhone WebKit sends multipart/form-data with Content-Length: 0.
// Preserve IndexedDB File until actual Storage bytes + DB ACK are confirmed.
const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 14'];
test.use(iphone);

test('@mobile iOS binary nameplate upload bypasses empty multipart', async ({ page }) => {
  await page.route('**/__wawis_ios_binary__', (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>iOS binary test</title>',
  }));
  await page.goto('/__wawis_ios_binary__');
  const actual = await page.evaluate(async () => {
    const photos = await import('/src/mobile791/modules/photos.js');
    const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
    for (const item of await queue.listPhotoQueueItems()) await queue.deletePhotoQueueItem(item.id);
    const initial = new TextEncoder().encode('WAWIS-BINARY-PHOTO-JZ-1346');
    const rows = [];
    const transferred = [];
    const supabase = {
      auth: { async getUser() { return { data: { user: { id: 'worker-ios' } }, error: null }; } },
      from(table) {
        if (table !== 'photos') throw new Error('Unexpected table: ' + table);
        const filters = [];
        let pending = null;
        return {
          select() { return this; },
          eq(key, value) { filters.push([key, value]); return this; },
          async maybeSingle() { return { data: rows.find((row) => filters.every(([k, v]) => row[k] === v)) || null, error: null }; },
          insert(input) { pending = { ...input, id: 'photo-server-ios', created_at: new Date().toISOString() }; return this; },
          async single() { rows.push(pending); return { data: pending, error: null }; },
        };
      },
      storage: { from() { return {
        async upload(path, body, options) {
          if (!(body instanceof ArrayBuffer) || !body.byteLength) {
            return { data: null, error: { statusCode: 400, message: 'No content provided' } };
          }
          transferred.push({
            path, bytes: [...new Uint8Array(body)], contentType: options.contentType,
          });
          return { data: { path }, error: null };
        },
        async download() { return { data: new Blob([initial], { type: 'image/jpeg' }), error: null }; },
        async createSignedUrl() { return { data: { signedUrl: 'https://example.invalid/ios' }, error: null }; },
      }; } },
    };
    let jobs = [{ id: 'job-ios', photos: [] }];
    let selected = { id: 'job-ios', photos: [] };
    const file = new File([initial], 'jz.jpg', { type: 'image/jpeg' });
    const result = await photos.uploadJobDocumentationPhotos({
      supabase, profile: { id: 'worker-ios' }, jobId: 'job-ios',
      documents: [{ file, deviceIndex: 0, unitRef: 'jz', serialNumber: 'TEST-IOS' }],
      compressImageFn: async (original) => ({ file: original, originalSize: original.size, uploadSize: original.size, compressed: false }),
      setJobs: (updater) => { jobs = updater(jobs); },
      setSelectedJob: (updater) => { selected = updater(selected); },
    });
    const left = (await queue.listPhotoQueueItems()).filter((item) => item.job_id === 'job-ios');
    return {
      iphone: /iPhone|iPad|iPod/i.test(navigator.userAgent),
      result, uploads: transferred.map((item) => ({ size: item.bytes.length, contentType: item.contentType, matches: item.bytes.every((x, i) => x === initial[i]) })),
      photos: rows.length, pending: left.length,
    };
  });
  expect(actual.iphone).toBe(true);
  expect(actual.uploads).toEqual([{ size: 'WAWIS-BINARY-PHOTO-JZ-1346'.length, contentType: 'image/jpeg', matches: true }]);
  expect(actual.result.uploadedCount).toBe(1);
  expect(actual.photos).toBe(1);
  expect(actual.pending).toBe(0);
});
