import { devices, expect, test } from '@playwright/test';

const { defaultBrowserType: _unusedBrowser, ...iphone14 } = devices['iPhone 14'];
test.use(iphone14);

async function fixture(page) {
  await page.route('**/__wawis_r2_fixture__', route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html lang="pl"><body>WAWIS integrity</body></html>',
  }));
  await page.goto('/__wawis_r2_fixture__');
}

test.describe('@mobile P0-R2 — plik nie może zostać nadpisany przez fallback fingerprint', () => {
  test('różne File o tych samych metadanych i błędzie arrayBuffer pozostają osobno w IndexedDB', async ({ page }) => {
    await fixture(page);
    const first = await page.evaluate(async () => {
      const photos = await import('/src/mobile791/modules/photos.js');
      const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
      const originalArrayBuffer = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        if (this.name === 'identyczne-metadata.png') {
          return Promise.reject(new DOMException('Read error', 'NotReadableError'));
        }
        return originalArrayBuffer.call(this);
      };
      try {
        for (const old of await queue.listPhotoQueueItems()) await queue.deletePhotoQueueItem(old.id);
        const a = new File(['DIFFERENT-IMAGE-A'], 'identyczne-metadata.png', { type: 'image/png', lastModified: 7 });
        const b = new File(['DIFFERENT-IMAGE-B'], 'identyczne-metadata.png', { type: 'image/png', lastModified: 7 });
        const metadata = { photo_kind: 'nameplate', device_index: 1, unit_ref: 'jz' };
        const ia = await photos.createPhotoUploadIdentity({ file: a, jobId: 'p0-job', metadata, uploaderId: 'userA' });
        const ib = await photos.createPhotoUploadIdentity({ file: b, jobId: 'p0-job', metadata, uploaderId: 'userA' });
        const saveA = await queue.savePhotoQueueItem({
          id: ia.localId, upload_key: ia.uploadKey, file_fingerprint: ia.fileFingerprint, fingerprint_status: ia.fingerprintStatus,
          uploaded_by: 'userA', job_id: 'p0-job', photo_kind: 'nameplate', device_index: 1, unit_ref: 'jz', local_file: a,
        });
        const saveB = await queue.savePhotoQueueItem({
          id: ib.localId, upload_key: ib.uploadKey, file_fingerprint: ib.fileFingerprint, fingerprint_status: ib.fingerprintStatus,
          uploaded_by: 'userA', job_id: 'p0-job', photo_kind: 'nameplate', device_index: 1, unit_ref: 'jz', local_file: b,
        });
        const records = await queue.listPhotoQueueItems();
        return {
          differentId: ia.localId !== ib.localId,
          statuses: [ia.fingerprintStatus, ib.fingerprintStatus],
          fingerprints: [ia.fileFingerprint, ib.fileFingerprint],
          saved: [saveA, saveB],
          entries: await Promise.all(records.map(async r => ({ id: r.id, bytes: await r.local_file.text(), owner: r.user_id }))),
        };
      } finally { File.prototype.arrayBuffer = originalArrayBuffer; }
    });
    expect(first.differentId).toBe(true);
    expect(first.statuses).toEqual(['read_error', 'read_error']);
    expect(first.fingerprints).toEqual(['', '']);
    expect(first.saved).toEqual([true, true]);
    expect(first.entries).toHaveLength(2);
    expect(first.entries.map(e => e.bytes).sort()).toEqual(['DIFFERENT-IMAGE-A','DIFFERENT-IMAGE-B']);
    await page.reload();
    const after = await page.evaluate(async () => {
      const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
      return Promise.all((await queue.listPhotoQueueItems()).map(x => x.local_file.text()));
    });
    expect(after.sort()).toEqual(['DIFFERENT-IMAGE-A','DIFFERENT-IMAGE-B']);
  });

  test('zapis tego samego PK nie podmienia Blob ani ownera lub lease', async ({ page }) => {
    await fixture(page);
    const result = await page.evaluate(async () => {
      const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
      for (const old of await queue.listPhotoQueueItems()) await queue.deletePhotoQueueItem(old.id);
      const fileA = new File(['safe-original'], 'photo.jpg',{type:'image/jpeg',lastModified:1});
      const fileB = new File(['other-file!!!'], 'photo.jpg',{type:'image/jpeg',lastModified:1});
      const base = { id:'p0-immutable', job_id:'job1', uploaded_by:'ownerA', upload_key:'one', file_fingerprint:'trusted-hash', local_file:fileA, lease_until:'2030-01-01T00:00:00Z',lease_owner:'workerA',upload_status:'uploading' };
      const saved = await queue.savePhotoQueueItem(base);
      const same = await queue.savePhotoQueueItem({ ...base, local_file:fileA, upload_status:'local', lease_owner:'' });
      const wrongOwner = await queue.savePhotoQueueItem({ ...base, local_file:fileB, uploaded_by:'ownerB' });
      const wrongHash = await queue.savePhotoQueueItem({ ...base, local_file:fileB, file_fingerprint:'other-hash' });
      const current = (await queue.listPhotoQueueItems()).find(x=>x.id==='p0-immutable');
      return { saved, same, wrongOwner, wrongHash, bytes:await current.local_file.text(), leaseOwner:current.lease_owner, uploadStatus:current.upload_status };
    });
    expect(result).toEqual({saved:true,same:true,wrongOwner:false,wrongHash:false,bytes:'safe-original',leaseOwner:'workerA',uploadStatus:'uploading'});
  });
});
