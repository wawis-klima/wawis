import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.62 — „Napraw kolejkę zdjęć” w Centrum synchronizacji pracownika (pełna aplikacja, mock Supabase).
// Czyszczenie tylko po wyraźnym potwierdzeniu; anulowanie niczego nie usuwa; sesja i dane mock pozostają.
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const ONLINE_FLAG = 'klima-e2e-network-state';
const MOCK_STORE_KEY = 'klima-mock-supabase-store-v3';
const tinyPng = {
  name: 'naprawa-kolejki-e2e.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==', 'base64'),
};

test.use(iphone14);

async function installControllableNetworkState(page) {
  await page.addInitScript(({ flag }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get() { return window.localStorage.getItem(flag) !== 'offline'; },
    });
  }, { flag: ONLINE_FLAG });
}

async function setLogicalOnlineState(page, online) {
  await page.evaluate(({ flag, value }) => {
    window.localStorage.setItem(flag, value ? 'online' : 'offline');
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  }, { flag: ONLINE_FLAG, value: online });
}

async function countQueuedPhotos(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('wawis-mobile-photo-queue');
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve(0);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('queued-photos')) { db.close(); resolve(0); return; }
      const count = db.transaction('queued-photos', 'readonly').objectStore('queued-photos').count();
      count.onsuccess = () => { db.close(); resolve(count.result); };
      count.onerror = () => { db.close(); resolve(-1); };
    };
  }));
}

// 13.66: nowe zdjęcia nie trafiają już do kolejki telefonu — test umieszcza w niej stare, niewysłane zdjęcie
// (format 13.62–13.65, baza v3), a aplikacja działa bez internetu, żeby kolejka nie wysłała go sama.
async function addOfflinePhoto(page) {
  await installControllableNetworkState(page);
  await resetMockSupabase(page);
  await page.evaluate(async ({ png }) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('wawis-mobile-photo-queue', 3);
      request.onupgradeneeded = () => {
        const store = request.result.objectStoreNames.contains('queued-photos')
          ? request.transaction.objectStore('queued-photos')
          : request.result.createObjectStore('queued-photos', { keyPath: 'id' });
        for (const name of ['created_at', 'job_id', 'upload_key', 'unit_key', 'file_fingerprint', 'next_attempt_at']) {
          if (!store.indexNames.contains(name)) store.createIndex(name, name, { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('queued-photos', 'readwrite');
      tx.objectStore('queued-photos').put({
        id: 'local-photo-upload-repair-e2e', job_id: 'mock-job-002', created_at: new Date().toISOString(),
        uploaded_by: 'mock-worker-1', user_id: 'mock-worker-1', uploader_name: 'Pracownik Testowy', queue_writer: '13.62',
        upload_status: 'local', upload_status_label: 'Zapisano na telefonie', upload_error: '',
        upload_key: 'key-repair-e2e', unit_key: '', file_fingerprint: 'fp-repair-e2e', planned_storage_path: 'mock-job-002/repair-e2e.png',
        local_file_name: 'naprawa-kolejki-e2e.png', local_file_type: 'image/png', local_file_last_modified: 1,
        local_file: null, local_file_bytes: bytes.buffer, photo_kind: '', device_index: 0, unit_ref: '',
        retry_count: 0, next_attempt_at: '', lease_until: '', upload_stage: 'queued',
      });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { png: tinyPng.buffer.toString('base64') });
  await setLogicalOnlineState(page, false);
  await loginWithoutReset(page, WORKER);
  await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => countQueuedPhotos(page)).toBe(1);
}

test.describe('@mobile Napraw kolejkę zdjęć 13.62', () => {
  test('@mobile anulowanie nie usuwa niewysłanego zdjęcia', async ({ page }) => {
    await addOfflinePhoto(page);
    const dialogs = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.getByRole('button', { name: 'Otwórz Centrum synchronizacji' }).click();
    await page.getByTestId('photo-queue-repair').click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toContain('1 niewysłane zdjęcie');
    expect(dialogs[0]).toContain('USUNIE');
    await expect.poll(() => countQueuedPhotos(page)).toBe(1);
  });

  test('@mobile potwierdzona naprawa czyści tylko kolejkę zdjęć i zachowuje sesję', async ({ page }) => {
    await addOfflinePhoto(page);
    const mockStoreBefore = await page.evaluate((key) => window.localStorage.getItem(key), MOCK_STORE_KEY);
    const dialogs = [];
    page.on('dialog', async (dialog) => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); });
    await page.getByRole('button', { name: 'Otwórz Centrum synchronizacji' }).click();
    await page.getByTestId('photo-queue-repair').click();
    await expect.poll(() => dialogs.filter((d) => d.type === 'alert').length, { timeout: 20_000 }).toBe(1);
    expect(dialogs.filter((d) => d.type === 'confirm')).toHaveLength(2);
    expect(dialogs.find((d) => d.type === 'alert').message).toContain('wyczyszczona');
    await page.waitForLoadState('load');
    await expect.poll(() => countQueuedPhotos(page)).toBe(0);
    // Sesja i dane aplikacji nie są usuwane przez naprawę kolejki.
    await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible({ timeout: 20_000 });
    const mockStoreAfter = await page.evaluate((key) => window.localStorage.getItem(key), MOCK_STORE_KEY);
    expect(Boolean(mockStoreAfter)).toBe(true);
    expect(JSON.parse(mockStoreAfter).jobs?.length).toBe(JSON.parse(mockStoreBefore).jobs?.length);
  });
});
