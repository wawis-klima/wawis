import { devices, expect, test } from '@playwright/test';
import { WORKER, loginWithoutReset, resetMockSupabase } from './mock-helpers.js';

// WAWIS 13.62 — telefon z bazą zdjęć v4 pozostawioną przez wycofane 13.42–13.48 (pełna aplikacja, mock Supabase).
// Po zalogowaniu online stare zdjęcie NIE może wysłać się automatycznie, zanim użytkownik zdecyduje:
// „Usuń stare zdjęcia” albo „Wyślij stare zdjęcia”. Montaże, sesja i dane mock pozostają.
const { defaultBrowserType: _defaultBrowserType, ...iphone14 } = devices['iPhone 14'];
const JOB_ID = 'mock-job-002';
const LEGACY_ID = 'local-photo-upload-legacy-v4-e2e';
const LEGACY_PATH = `${JOB_ID}/legacy-v4-e2e.png`;

test.use(iphone14);

async function seedLegacyV4Queue(page) {
  await page.evaluate(async ({ jobId, id, path }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    canvas.getContext('2d').fillRect(0, 0, 16, 16);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'stare-v4.png', { type: 'image/png', lastModified: 1 });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('wawis-mobile-photo-queue', 4);
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
      // Format rekordu z 13.42–13.48: brak znacznika queue_writer 13.62.
      tx.objectStore('queued-photos').put({
        id, job_id: jobId, created_at: '2026-10-22T09:16:00.000Z', uploaded_by: 'mock-worker-1', user_id: 'mock-worker-1',
        uploader_name: 'Pracownik Testowy', upload_status: 'local', upload_status_label: 'Zapisano na telefonie', upload_error: '',
        upload_key: `key-${id}`, unit_key: '', file_fingerprint: `fp-${id}`, planned_storage_path: path, legacy_queue_item: false,
        local_file_name: file.name, local_file_type: file.type, local_file_last_modified: 1, local_file: file,
        photo_kind: '', device_index: 0, unit_ref: '', device_ref: '', serial_number: '', documentation_label: '',
        retry_count: 0, last_attempt_at: '', next_attempt_at: '', lease_until: '', upload_stage: 'queued',
        lease_owner: '', attempt_generation: 2, fingerprint_status: '',
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { jobId: JOB_ID, id: LEGACY_ID, path: LEGACY_PATH });
}

async function queueState(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('wawis-mobile-photo-queue');
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve({ version: 0, ids: [] });
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('queued-photos')) { db.close(); resolve({ version: db.version, ids: [] }); return; }
      const all = db.transaction('queued-photos', 'readonly').objectStore('queued-photos').getAll();
      all.onsuccess = () => { db.close(); resolve({ version: db.version, ids: all.result.map((r) => r.id), reviews: all.result.map((r) => r.legacy_v4_review || '') }); };
    };
  }));
}

async function serverLegacyRows(page) {
  // Dane mock nie zawierają zdjęć tego montażu, więc każdy wiersz oznacza wysłane stare zdjęcie.
  return page.evaluate((jobId) => (window.__KLIMA_MOCK_SUPABASE__?.getStore?.().photos || [])
    .filter((row) => String(row.job_id || '') === jobId).length, JOB_ID);
}

async function startWithLegacyQueue(page) {
  await resetMockSupabase(page);
  await seedLegacyV4Queue(page);
  await loginWithoutReset(page, WORKER);
  await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible({ timeout: 20_000 });
  // Wskaźnik synchronizacji pokazuje decyzję do podjęcia, nie „Wszystko wysłane”.
  await expect(page.getByText('1 stare zdjęcie czeka na decyzję')).toBeVisible({ timeout: 20_000 });
  // Dajemy automatycznej synchronizacji czas na start (online, zlecenia wczytane) — nie może niczego wysłać.
  await page.waitForTimeout(4000);
  expect(await serverLegacyRows(page)).toBe(0);
  const state = await queueState(page);
  expect(state.version).toBe(4);
  expect(state.ids).toEqual([LEGACY_ID]);
  expect(state.reviews).toEqual(['pending']);
  await page.getByRole('button', { name: 'Otwórz Centrum synchronizacji' }).click();
  await expect(page.getByTestId('photo-queue-legacy-hold')).toBeVisible();
}

test.describe('@mobile stare zdjęcia z bazy v4 czekają na decyzję 13.62', () => {
  test('@mobile start online nie wysyła starych zdjęć; „Usuń stare zdjęcia” usuwa tylko je', async ({ page }) => {
    await startWithLegacyQueue(page);
    const jobsBefore = await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__.getStore().jobs.length);
    const dialogs = [];
    page.on('dialog', async (dialog) => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); });
    await page.getByTestId('photo-queue-legacy-delete').click();
    await expect.poll(() => dialogs.filter((d) => d.type === 'alert').length).toBe(1);
    expect(dialogs[0].message).toContain('1 stare zdjęcie');
    expect(dialogs.find((d) => d.type === 'alert').message).toContain('Usunięto');
    // Po potwierdzonym usunięciu aplikacja się odświeża; sesja i montaże zostają, stare zdjęcie znika także z widoku montażu.
    await page.waitForLoadState('load');
    await expect(page.locator('.statusActionButton[title="W trakcie"]')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await queueState(page)).ids.length).toBe(0);
    await expect(page.getByText('Wstrzymane — zdecyduj w Synchronizacji')).toHaveCount(0);
    await expect(page.getByText('1 stare zdjęcie czeka na decyzję')).toHaveCount(0);
    expect(await serverLegacyRows(page)).toBe(0);
    expect(await page.evaluate(() => window.__KLIMA_MOCK_SUPABASE__.getStore().jobs.length)).toBe(jobsBefore);
  });

  test('@mobile anulowanie decyzji niczego nie zmienia; „Wyślij stare zdjęcia” wysyła je na serwer', async ({ page }) => {
    await startWithLegacyQueue(page);
    let accept = false;
    page.on('dialog', async (dialog) => { if (accept) await dialog.accept(); else await dialog.dismiss(); });
    await page.getByTestId('photo-queue-legacy-send').click();
    await page.waitForTimeout(1500);
    expect(await serverLegacyRows(page)).toBe(0);
    expect((await queueState(page)).ids).toEqual([LEGACY_ID]);
    accept = true;
    await page.getByTestId('photo-queue-legacy-send').click();
    await expect.poll(() => serverLegacyRows(page), { timeout: 20_000 }).toBe(1);
    await expect.poll(async () => (await queueState(page)).ids.length, { timeout: 20_000 }).toBe(0);
  });
});
