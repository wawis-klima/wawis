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

async function putLegacyQueuedNameplateError(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('wawis-mobile-photo-queue', 2);
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
        upload_status: 'error',
        upload_status_label: 'Błąd wysyłania',
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
  }));
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

    await page.getByRole('button', { name: 'Otwórz Centrum synchronizacji zdjęć' }).click();
    await expect(page.getByRole('heading', { name: 'Synchronizacja zdjęć' })).toBeVisible();
    await expect(page.getByText('Zdjęcie montażu', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wyślij wszystkie (1)' })).toBeDisabled();
    await page.getByRole('button', { name: 'Zamknij' }).click();

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

  test('serwerowa tabliczka usuwa stary lokalny błąd i nie jest oznaczana jako brakująca', async ({ page }) => {
    await installControllableNetworkState(page);
    await resetMockSupabase(page);
    await setLogicalOnlineState(page, true);
    await loginWithoutReset(page, WORKER);

    await page.evaluate(({ storeKey }) => {
      const store = JSON.parse(window.localStorage.getItem(storeKey) || '{}');
      store.photos = Array.isArray(store.photos) ? store.photos : [];
      store.photos.push({
        id: 'mock-server-nameplate-jz',
        job_id: 'mock-job-002',
        image_url: '',
        storage_path: 'mock-job-002/nameplates/device-1_jz_MOCK-MIT-002_server.jpg',
        uploaded_by: 'mock-worker-1',
        created_at: '2026-07-30T05:01:00.000Z',
      });
      window.localStorage.setItem(storeKey, JSON.stringify(store));
    }, { storeKey: MOCK_STORE_KEY });
    await putLegacyQueuedNameplateError(page);

    await page.reload();
    await page.locator('.statusActionButton[title="W trakcie"]').click();
    await page.getByText('Klient Testowy B', { exact: true }).click();

    await expect.poll(() => countQueuedPhotos(page), { timeout: 15_000 }).toBe(0);
    const outdoorRow = page.locator('.deviceUnitDocumentationRow').filter({ hasText: 'JZ' }).first();
    await expect(outdoorRow).toContainText('Zapisano w systemie');
    await expect(outdoorRow).not.toContainText('Błąd wysyłania');
    await expect(outdoorRow).toHaveAttribute('role', 'button');
    await expect(outdoorRow).toHaveAttribute('aria-label', /Otwórz tabliczkę znamionową JZ/);
  });

  test('zakończone zlecenie ukrywa pustą sekcję komentarzy, ale pokazuje istniejącą historię', async ({ page }) => {
    await resetMockSupabase(page);
    await loginWithoutReset(page, WORKER);

    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
    await expect(page.getByText('Zakończone · tylko podgląd', { exact: true })).toBeVisible();
    await expect(page.locator('.mobileDetailsLoading')).toBeHidden();
    await expect(page.getByText('Komentarze i pytania', { exact: true })).toHaveCount(0);

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
      window.localStorage.setItem(storeKey, JSON.stringify(store));
    }, { storeKey: MOCK_STORE_KEY });

    await page.reload();
    await page.locator('.statusActionButton[title="Zakończone"]').click();
    await page.getByText('Klient Testowy C Zakończony', { exact: true }).click();
    await expect(page.getByText('Komentarze i pytania', { exact: true })).toBeVisible();
    await expect(page.getByText('Historia komentarza zakończonego zlecenia.', { exact: true })).toBeVisible();
  });
});
