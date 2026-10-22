import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const ONLINE_FLAG = 'klima-e2e-network-state';
const MOCK_STORE_KEY = 'klima-mock-supabase-store-v3';
const tinyPng = {
  name: 'kolejka-offline-e2e.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==', 'base64'),
};

test.use(iphone14);

async function installControllableNetworkState(page) {
  await page.addInitScript(({ flag }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() {
        return window.localStorage.getItem(flag) !== 'offline';
      },
    });
  }, { flag: ONLINE_FLAG });
}

async function setLogicalOnlineState(page, isOnline) {
  await page.evaluate(({ flag, online }) => {
    window.localStorage.setItem(flag, online ? 'online' : 'offline');
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  }, { flag: ONLINE_FLAG, online: isOnline });
}

async function countQueuedPhotos(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('wawis-mobile-photo-queue');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('queued-photos')) {
        db.close();
        resolve(0);
        return;
      }
      const transaction = db.transaction('queued-photos', 'readonly');
      const countRequest = transaction.objectStore('queued-photos').count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
      transaction.oncomplete = () => db.close();
    };
  }));
}

async function putLegacyQueuedNameplateError(page, { uploadStatus = 'error', leaseUntil = '' } = {}) {
  await page.evaluate(({ uploadStatus, leaseUntil }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('wawis-mobile-photo-queue');
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('queued-photos')) {
        db.createObjectStore('queued-photos', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('queued-photos', 'readwrite');
      transaction.objectStore('queued-photos').put({
        id: 'local-photo-upload-legacy-jz-error',
        job_id: 'mock-job-002',
        created_at: '2026-07-30T05:00:00.000Z',
        uploaded_by: 'mock-worker-1',
        uploader_name: 'Pracownik Testowy',
        upload_status: uploadStatus,
        upload_status_label: uploadStatus === 'uploading' ? 'Wysyłanie' : 'Błąd wysyłania',
        lease_until: leaseUntil,
        lease_owner: leaseUntil ? 'przerwana-sesja-testowa' : '',
        upload_error: 'Testowy stary błąd po udanym wysłaniu.',
        local_file_name: 'legacy-jz.jpg',
        local_file_type: 'image/jpeg',
        local_file_last_modified: Date.now(),
        local_file: new Blob(['legacy-jz'], { type: 'image/jpeg' }),
        photo_kind: 'nameplate',
        device_index: 1,
        unit_ref: 'jz',
        device_ref: 'device-1-jz',
        serial_number: 'MOCK-MIT-002',
        documentation_label: 'Tabliczka JZ',
        retry_count: 1,
        last_attempt_at: '2026-07-30T05:00:10.000Z',
      });
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }), { uploadStatus, leaseUntil });
}

// Dla scenariuszy pozytywnego pojednania symulujemy tę SAMĄ operację,
// nie dowolną inną tabliczkę tej samej jednostki (kontrakt P0-01).
async function getConfirmedLegacyNameplatePath(page) {
  return page.evaluate(async () => {
    const { createPhotoUploadIdentity } = await import('/src/mobile791/modules/photos.js');
    // hydratePhotoQueueItem() odtwarza dokładnie taki File z legacy Blob.
    const file = new File(['legacy-jz'], 'legacy-jz.jpg', { type: 'image/jpeg' });
    const identity = await createPhotoUploadIdentity({
      file,
      jobId: 'mock-job-002',
      metadata: { photo_kind: 'nameplate', device_index: 1, unit_ref: 'jz' },
    });
    return `mock-job-002/nameplates/device-1_jz_MOCK-MIT-002_${identity.uploadKey.slice(0, 48)}.jpg`;
  });
}

test.describe('@mobile iPhone — odporność danych', () => {
  test('lokalne zdjęcie przetrwa ponowne uruchomienie i wyśle się po odzyskaniu internetu', async ({ page }) => {
    await installControllableNetworkState(page);
    await resetMockSupabase(page);
    await setLogicalOnlineState(page, false);
    await loginWithoutReset(page, WORKER);

    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();
    await page.locator('.photoUploadBtnGallery input[type="file"]').setInputFiles(tinyPng);

    await expect(page.locator('.thumbCard')).toHaveCount(1);
    await expect(page.getByText('Zapisano na telefonie', { exact: true })).toBeVisible();
    await expect.poll(() => countQueuedPhotos(page)).toBe(1);

    await page.getByRole('button', { name: 'Otwórz Centrum synchronizacji' }).click();
    await expect(page.getByRole('heading', { name: 'Synchronizacja', exact: true })).toBeVisible();
    await expect(page.getByText('Zdjęcie montażu', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Synchronizuj teraz (1)' })).toBeDisabled();
    await page.locator('.photoSyncCenterClose').click();

    // Ponowne wskazanie dokładnie tego samego pliku nie może utworzyć drugiego
    // wpisu w UI ani drugiego rekordu w kolejce telefonu.
    await page.locator('.photoUploadBtnGallery input[type="file"]').setInputFiles(tinyPng);
    await expect(page.locator('.thumbCard')).toHaveCount(1);
    await expect.poll(() => countQueuedPhotos(page)).toBe(1);

    await page.reload();
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();

    await expect(page.locator('.thumbCard')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByText('Zapisano na telefonie', { exact: true })).toBeVisible();
    await expect.poll(() => countQueuedPhotos(page)).toBe(1);

    await setLogicalOnlineState(page, true);
    await expect(page.getByRole('status', { name: /Połączenie:/ })).toContainText('Wszystko wysłane', { timeout: 15_000 });
    await expect.poll(() => countQueuedPhotos(page), { timeout: 15_000 }).toBe(0);
    await expect.poll(async () => page.evaluate(() => (
      window.__KLIMA_MOCK_SUPABASE__?.getStore()?.photos?.filter((photo) => photo.job_id === 'mock-job-002').length || 0
    )), { timeout: 15_000 }).toBe(1);
  });

  test('same metadane bez pliku Storage zachowują stary Blob, a serwerowa JZ pozostaje widoczna', async ({ page }) => {
    await installControllableNetworkState(page);
    await resetMockSupabase(page);
    await setLogicalOnlineState(page, true);
    await loginWithoutReset(page, WORKER);
    const confirmedStoragePath = await getConfirmedLegacyNameplatePath(page);

    await page.evaluate(({ storeKey, confirmedStoragePath }) => {
      const store = JSON.parse(window.localStorage.getItem(storeKey) || '{}');
      store.photos = Array.isArray(store.photos) ? store.photos : [];
      store.photos.push({
        id: 'mock-server-nameplate-jz',
        job_id: 'mock-job-002',
        image_url: '',
        storage_path: confirmedStoragePath,
        uploaded_by: 'mock-worker-1',
        created_at: '2026-07-30T05:01:00.000Z',
      });
      const serialized = JSON.stringify(store);
      window.localStorage.setItem(storeKey, serialized);
      window.dispatchEvent(new StorageEvent('storage', { key: storeKey, newValue: serialized }));
    }, { storeKey: MOCK_STORE_KEY, confirmedStoragePath });
    await putLegacyQueuedNameplateError(page);

    await page.reload();
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();

    // Rekord photos i identyczna ścieżka bez obiektu w Storage nie są ACK.
    // Stary File nie może zostać usunięty tylko dla uzyskania zielonego testu.
    await expect.poll(() => countQueuedPhotos(page), { timeout: 30_000 }).toBe(1);
    const preserved = await page.evaluate(async () => {
      const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
      const local = (await queue.listPhotoQueueItems()).find(x => x.id === 'local-photo-upload-legacy-jz-error');
      return local?.local_file ? await local.local_file.text() : null;
    });
    expect(preserved).toBe('legacy-jz');
    await page.getByRole('button', { name: 'Rozwiń Urządzenie 1' }).click();
    const outdoorRow = page.locator('.deviceUnitDocumentationRow').filter({ hasText: 'JZ' }).first();
    await expect(outdoorRow).toContainText('Zapisano w systemie');
    await expect(outdoorRow).not.toContainText('Błąd wysyłania');
    await expect(outdoorRow).toHaveAttribute('role', 'button');
    await expect(outdoorRow).toHaveAttribute('aria-label', /Otwórz tabliczkę znamionową JZ/);
  });


  test('anulowany worker oddaje własny lease bez usuwania zdjęcia i bez naruszenia następnego workera', async ({ page }) => {
    await resetMockSupabase(page);
    await putLegacyQueuedNameplateError(page);

    const result = await page.evaluate(async () => {
      const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
      const id = 'local-photo-upload-legacy-jz-error';
      const first = await queue.claimPhotoQueueItem(id);
      const blocked = await queue.claimPhotoQueueItem(id);
      const releasedFirst = await queue.releaseClaimedPhotoQueueItem(id, first);
      const second = await queue.claimPhotoQueueItem(id);
      const staleRelease = await queue.releaseClaimedPhotoQueueItem(id, first);
      const afterStale = (await queue.listPhotoQueueItems()).find((p) => p.id === id);
      const releasedSecond = await queue.releaseClaimedPhotoQueueItem(id, second);
      const remaining = (await queue.listPhotoQueueItems()).find((p) => p.id === id);
      return {
        firstOwner: first?.lease_owner || '',
        blocked: blocked === null,
        releasedFirst,
        secondOwner: second?.lease_owner || '',
        staleRelease,
        ownerAfterStale: afterStale?.lease_owner || '',
        releasedSecond,
        remainingStatus: remaining?.upload_status || '',
        remainingError: remaining?.upload_error || '',
        remainingFile: Boolean(remaining?.local_file),
      };
    });

    expect(result.firstOwner).toBeTruthy();
    expect(result.blocked).toBe(true);
    expect(result.releasedFirst).toBe(true);
    expect(result.secondOwner).toBeTruthy();
    expect(result.secondOwner).not.toBe(result.firstOwner);
    expect(result.staleRelease).toBe(false);
    expect(result.ownerAfterStale).toBe(result.secondOwner);
    expect(result.releasedSecond).toBe(true);
    expect(result.remainingStatus).toBe('error');
    expect(result.remainingError).toBeTruthy();
    expect(result.remainingFile).toBe(true);
    expect(await countQueuedPhotos(page)).toBe(1);
  });

  test('osierocona 3-minutowa blokada nie ukrywa zapisanej na serwerze JZ', async ({ page }) => {
    await installControllableNetworkState(page);
    await resetMockSupabase(page);
    await setLogicalOnlineState(page, true);
    await loginWithoutReset(page, WORKER);

    // Dwa przejścia odtwarzają najtrudniejszy scenariusz bez losowania:
    // serwer ma inną tabliczkę tej jednostki, a poprzedni worker zostawił aktywny lease.
    // Na serwerze jest INNA tabliczka tej samej jednostki: aktywny lease
    // lokalnego pliku nie uprawnia do jego usunięcia na podstawie metadanych.
    const otherStoragePath = 'mock-job-002/nameplates/device-1_jz_MOCK-MIT-002_server.jpg';
    for (let run = 0; run < 2; run += 1) {
      await page.evaluate(({ storeKey, otherStoragePath }) => {
        const store = JSON.parse(window.localStorage.getItem(storeKey) || '{}');
        store.photos = (store.photos || []).filter((p) => p.id !== 'mock-server-nameplate-jz');
        store.photos.push({
          id: 'mock-server-nameplate-jz',
          job_id: 'mock-job-002',
          image_url: '',
          storage_path: otherStoragePath,
          uploaded_by: 'mock-worker-1',
          created_at: '2026-07-30T05:01:00.000Z',
        });
        const serialized = JSON.stringify(store);
        window.localStorage.setItem(storeKey, serialized);
        window.dispatchEvent(new StorageEvent('storage', { key: storeKey, newValue: serialized }));
      }, { storeKey: MOCK_STORE_KEY, otherStoragePath });
      await putLegacyQueuedNameplateError(page, {
        uploadStatus: 'uploading',
        leaseUntil: new Date(Date.now() + 180_000).toISOString(),
      });
      const beforeReload = await page.evaluate(async () => {
        const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
        const local = (await queue.listPhotoQueueItems()).find((p) => p.id === 'local-photo-upload-legacy-jz-error');
        return { present: Boolean(local), leaseUntil: local?.lease_until || '' };
      });
      expect(beforeReload.present).toBe(true);
      expect(Date.parse(beforeReload.leaseUntil)).toBeGreaterThan(Date.now());

      await page.reload();
      await page.locator('.statusActionButton[title="W trakcie"]').click();
      await page.getByText('Klient Testowy B', { exact: true }).click();
      // Obca, starsza tabliczka w tym samym montażu NIE może usuwać
      // lokalnego pliku przy nadal aktywnym lease (P0-01).
      await page.getByRole('button', { name: 'Rozwiń Urządzenie 1' }).click();
      const jz = page.locator('.deviceUnitDocumentationRow').filter({ hasText: 'JZ' }).first();
      await expect(jz).toContainText('Zapisano w systemie');
      await expect(jz).not.toContainText('Błąd wysyłania');

      // Weryfikujemy prawdziwe bajty File przechowywane przez IndexedDB,
      // nie tylko stan/etykietę UI ani statyczną obecność kodu.
      const preserved = await page.evaluate(async () => {
        const queue = await import('/src/mobile791/modules/photo-offline-queue.js');
        const records = await queue.listPhotoQueueItems();
        const local = records.find((photo) => photo.id === 'local-photo-upload-legacy-jz-error');
        return {
          count: records.length,
          bytes: local?.local_file ? await local.local_file.text() : null,
          status: local?.upload_status || '',
          leaseUntil: Date.parse(local?.lease_until || ''),
          expectedPath: local?.planned_storage_path || '',
          serverPaths: (window.__KLIMA_MOCK_SUPABASE__?.getStore()?.photos || [])
            .filter((photo) => photo.job_id === 'mock-job-002')
            .map((photo) => photo.storage_path),
        };
      });
      // Komunikat ma pokazać, czy lokalny Blob zniknął po rzeczywistym
      // potwierdzeniu tej samej ścieżki, czy po niepoprawnym skojarzeniu.
      expect(preserved.count, `run=${run}, paths=${JSON.stringify(preserved.serverPaths)}, expected=${preserved.expectedPath}`).toBe(1);
      expect(preserved.bytes).toBe('legacy-jz');
      expect(preserved.status).toBe('uploading');
      expect(preserved.leaseUntil).toBeGreaterThan(Date.now());
    }
  });

  test('zakończone zlecenie zwija monterów i puste komentarze, ale rozwija istniejącą historię', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);

    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
    await expect(page.locator('.workerReadOnlyNote')).toHaveText('Zakończone');
    await expect(page.locator('.mobileDetailsLoading')).toBeHidden();

    const viewersToggle = page.getByRole('button', { name: /^Rozwiń monterów$/i });
    const commentsToggle = page.getByRole('button', { name: /^Rozwiń komentarze i pytania$/i });
    await expect(viewersToggle).toBeVisible();
    await expect(viewersToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(commentsToggle).toBeVisible();
    await expect(commentsToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[id^="viewers-content-"]')).toHaveCount(0);
    await expect(page.locator('[id^="comments-content-"]')).toHaveCount(0);

    await page.evaluate(({ storeKey }) => {
      const store = JSON.parse(window.localStorage.getItem(storeKey) || '{}');
      store.comments = Array.isArray(store.comments) ? store.comments : [];
      store.comments.push({
        id: 'mock-comment-completed-e2e',
        job_id: 'mock-job-003',
        author_id: 'mock-admin-1',
        type: 'Komentarz',
        text: 'Historia komentarza zakończonego zlecenia.',
        created_at: '2026-07-29T06:00:00.000Z',
      });
      const serialized = JSON.stringify(store);
      window.localStorage.setItem(storeKey, serialized);
      window.dispatchEvent(new StorageEvent('storage', { key: storeKey, newValue: serialized }));
    }, { storeKey: MOCK_STORE_KEY });

    await expect.poll(() => page.evaluate(() => (
      window.__KLIMA_MOCK_SUPABASE__?.getStore()?.comments?.some(
        (comment) => comment.id === 'mock-comment-completed-e2e',
      ) || false
    )), { timeout: 10_000 }).toBe(true);

    await page.reload();

    await expect.poll(() => page.evaluate(() => (
      window.__KLIMA_MOCK_SUPABASE__?.getStore()?.comments?.some(
        (comment) => comment.id === 'mock-comment-completed-e2e',
      ) || false
    )), { timeout: 10_000 }).toBe(true);

    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
    await expect(page.locator('.mobileDetailsLoading')).toBeHidden();
    const viewersToggleAfterReload = page.getByRole('button', { name: /Rozwiń monterów/i });
    const commentsToggleWithHistory = page.getByRole('button', { name: /^Zwiń komentarze i pytania$/i });
    await expect(viewersToggleAfterReload).toHaveAttribute('aria-expanded', 'false');
    await expect(commentsToggleWithHistory).toBeVisible();
    await expect(commentsToggleWithHistory).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Historia komentarza zakończonego zlecenia.', { exact: true })).toBeVisible();
  });
});
