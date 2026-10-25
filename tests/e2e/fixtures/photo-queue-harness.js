// WAWIS 13.62 — harness przeglądarkowy kolejki zdjęć (prawdziwy IndexedDB + rzeczywiste moduły aplikacji).
// Ładowany przez Playwright (tests/e2e/mobile-photo-queue-compat-v1362.spec.js) oraz przez lokalny runner
// dowodowy RED/GREEN. Supabase zastąpiony adapterem w pamięci: brak sieci i brak danych produkcyjnych.
// Każdy scenariusz zaczyna od czystej lokalnej bazy testowej tej karty przeglądarki.
(() => {
  const QUEUE_DB = 'wawis-mobile-photo-queue';
  const STORE = 'queued-photos';
  const INDEXES = ['created_at', 'job_id', 'upload_key', 'unit_key', 'file_fingerprint', 'next_attempt_at'];
  const base = () => String(window.__WAWIS_MODULE_BASE__ || '');
  const loadQueue = () => import(`${base()}/src/mobile791/modules/photo-offline-queue.js`);
  const loadPhotos = () => import(`${base()}/src/mobile791/modules/photos.js`);

  const srv = { objects: new Map(), rows: [], uploads: 0, inserts: 0, faults: {}, bodyKinds: [] };
  function resetServer() {
    srv.objects = new Map(); srv.rows = []; srv.uploads = 0; srv.inserts = 0; srv.faults = {}; srv.bodyKinds = [];
  }
  function setOnline(online) {
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => online });
  }
  function supabaseFor(owner) {
    return {
      auth: { async getUser() { return { data: { user: { id: owner } }, error: null }; } },
      from() {
        const filters = [];
        const api = {
          select() { return api; }, eq(k, v) { filters.push([k, v]); return api; },
          async maybeSingle() { return { data: srv.rows.find((r) => filters.every(([k, v]) => r[k] === v)) || null, error: null }; },
          then(res, rej) { return Promise.resolve({ data: srv.rows.filter((r) => filters.every(([k, v]) => r[k] === v)), error: null }).then(res, rej); },
          insert(data) { return { select() { return { async single() {
            if (srv.rows.some((r) => r.storage_path === data.storage_path)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
            srv.inserts += 1; const row = { ...data, id: `row-${srv.inserts}`, created_at: new Date().toISOString() }; srv.rows.push(row);
            return { data: row, error: null };
          } }; } }; },
        };
        return api;
      },
      storage: { from() { return {
        async upload(path, body) {
          srv.uploads += 1;
          srv.bodyKinds.push(body instanceof Blob ? 'blob' : (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) ? 'bytes' : typeof body);
          const fault = srv.faults.uploadSequence?.shift();
          if (fault === 'network') throw new TypeError('Failed to fetch');
          if (fault === 'http400') return { data: null, error: { statusCode: '400', message: 'No content provided' } };
          if (fault === 'http503') return { data: null, error: { statusCode: '503', message: 'Service Unavailable' } };
          const bytes = new Uint8Array(await new Response(body).arrayBuffer());
          if (srv.objects.has(path)) return { data: null, error: { statusCode: '409', message: 'The resource already exists' } };
          srv.objects.set(path, bytes); return { data: { path }, error: null };
        },
        async download(path) { const b = srv.objects.get(path); return b ? { data: new Blob([b]), error: null } : { data: null, error: { statusCode: 404, message: 'Object not found' } }; },
        async createSignedUrl(path) { return { data: { signedUrl: `https://test.invalid/${encodeURIComponent(path)}` }, error: null }; },
        async remove(paths) { paths.forEach((p) => srv.objects.delete(p)); return { data: null, error: null }; },
      }; } },
    };
  }

  async function png(color, size = 24) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, size, size); x.fillStyle = '#fff'; x.fillText(color.slice(0, 3), 2, 12);
    return new Promise((r) => c.toBlob(r, 'image/png'));
  }
  async function sha(blob) {
    if (!blob) return null;
    const d = await crypto.subtle.digest('SHA-256', await new Response(blob).arrayBuffer());
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function file(color, name) { return new File([await png(color)], name, { type: 'image/png', lastModified: 1 }); }
  async function serverShas() { return Promise.all([...srv.objects.values()].map((b) => sha(new Blob([b])))); }
  function withTimeout(promise, ms, label) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ __timeout: label }), ms))]);
  }

  // Surowy dostęp do IndexedDB (bez kodu aplikacji) — tylko do przygotowania i kontroli stanu.
  function rawOpen(version, { upgrade } = {}) {
    return new Promise((resolve, reject) => {
      const req = version ? indexedDB.open(QUEUE_DB, version) : indexedDB.open(QUEUE_DB);
      req.onupgradeneeded = () => upgrade?.(req);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => {};
    });
  }
  function rawDelete(name = QUEUE_DB) {
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve(true); req.onerror = () => resolve(false); req.onblocked = () => {};
      setTimeout(() => resolve('blocked'), 4000);
    });
  }
  async function rawCreate(version, records = []) {
    const db = await rawOpen(version, { upgrade: (req) => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      INDEXES.forEach((name) => store.createIndex(name, name, { unique: false }));
    } });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      records.forEach((r) => tx.objectStore(STORE).put(r));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
  async function rawState() {
    let db;
    try {
      db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(QUEUE_DB);
        req.onupgradeneeded = () => req.transaction.abort();
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
    } catch { return { version: 0, count: 0, shas: [] }; }
    const version = db.version;
    if (!db.objectStoreNames.contains(STORE)) { db.close(); return { version, count: 0, shas: [] }; }
    const rows = await new Promise((resolve) => { const q = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); q.onsuccess = () => resolve(q.result); });
    db.close();
    return { version, count: rows.length, shas: await Promise.all(rows.map((r) => sha(r.local_file || (r.local_file_bytes ? new Blob([r.local_file_bytes]) : null)))) };
  }
  async function rawRows() {
    const db = await rawOpen(0);
    if (!db.objectStoreNames.contains(STORE)) { db.close(); return []; }
    const rows = await new Promise((resolve) => { const q = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); q.onsuccess = () => resolve(q.result); });
    db.close();
    return rows;
  }
  // Rekord w formacie wersji 13.38/13.61 (v3) lub 13.42–13.48 (v4: dodatkowe pola lease/generation).
  async function legacyRecord({ format, id, owner, jobId, unitRef, f, status = 'local', leaseUntil = '' }) {
    const rec = {
      id, job_id: jobId, created_at: new Date(Date.now() - 3600_000).toISOString(), uploaded_by: owner, user_id: owner,
      uploader_name: 'Pracownik', upload_status: status, upload_status_label: 'Zapisano na telefonie', upload_error: '',
      upload_key: `key-${id}`, unit_key: `${jobId}:nameplate:1:${unitRef}`, file_fingerprint: await sha(f),
      planned_storage_path: `${jobId}/nameplates/${id}.jpg`, legacy_queue_item: false,
      local_file_name: f.name, local_file_type: f.type, local_file_last_modified: 1, local_file: f,
      photo_kind: 'nameplate', device_index: 1, unit_ref: unitRef, device_ref: `device-1-${unitRef}`, serial_number: '',
      documentation_label: `Tabliczka ${unitRef.toUpperCase()}`, ocr_status: 'approved', ocr_checked_at: null,
      retry_count: 0, last_attempt_at: '', next_attempt_at: '', lease_until: leaseUntil, upload_stage: 'queued',
      prepared_file: null, prepared_file_name: '', prepared_file_type: '', prepared_file_last_modified: 0,
      upload_original_size: f.size, upload_file_size: 0, upload_saved_percent: 0, upload_compressed: false,
    };
    if (format === 'v4') Object.assign(rec, { lease_owner: status === 'uploading' ? 'stale-worker' : '', attempt_generation: 2, fingerprint_status: '' });
    return rec;
  }
  async function cleanStart() {
    resetServer(); setOnline(true);
    await rawDelete(QUEUE_DB);
  }
  function uiStatuses(jobs) { return jobs.flatMap((j) => (j.photos || []).map((p) => p.upload_status_label || p.upload_status)); }
  function trackUi(jobId) {
    const seen = [];
    let jobs = [{ id: jobId, photos: [] }];
    const setJobs = (fn) => { jobs = fn(jobs); seen.push(...uiStatuses(jobs)); };
    return { setJobs, seen, get jobs() { return jobs; } };
  }
  async function quotaPut(run) {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === STORE) throw new DOMException('Controlled full device', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try { return await run(); } finally { IDBObjectStore.prototype.put = put; }
  }

  const scenarios = {
    // 13.66: bez internetu zdjęcie NIE trafia do aplikacji (ani do kolejki telefonu); z internetem wysyła się od razu.
    async S01_offline_zdjecie_nie_jest_zapisywane_online_wysylka() {
      await cleanStart();
      const p = await loadPhotos();
      const f = await file('blue', 'jw.png'); setOnline(false);
      const ui = trackUi('J1');
      const offline = await p.uploadJobDocumentationPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J1', documents: [{ file: f, deviceIndex: 0, unitRef: 'jw' }], setJobs: ui.setJobs });
      const rawOffline = await rawState();
      setOnline(true);
      const online = await p.uploadJobDocumentationPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J1', documents: [{ file: f, deviceIndex: 0, unitRef: 'jw' }], setJobs: ui.setJobs });
      const shas = await serverShas(); const raw = await rawState();
      return { pass: offline.failedCount === 1 && offline.queuedCount === 0 && offline.offlineBlocked === true && offline.persistErrorCode === 'PHOTO_OFFLINE_DISABLED'
          && rawOffline.count === 0 && !ui.seen.includes('Zapisano na telefonie') && online.uploadedCount === 1 && shas.includes(await sha(f)) && raw.count === 0 && srv.rows.length === 1,
        offline: { failed: offline.failedCount, queued: offline.queuedCount, code: offline.persistErrorCode }, rawOffline, online: { uploaded: online.uploadedCount, failed: online.failedCount }, raw };
    },
    async S02_istniejaca_v3_z_niewyslanym_zdjeciem() {
      await cleanStart();
      const f = await file('green', 'jz.png');
      await rawCreate(3, [await legacyRecord({ format: 'v3', id: 'local-photo-upload-v3a', owner: 'A', jobId: 'J2', unitRef: 'jz', f })]);
      const p = await loadPhotos(); const q = await loadQueue();
      const visible = (await q.listPhotoQueueItems()).length;
      const res = await p.resumePersistedPhotoUploads({ supabase: supabaseFor('A'), profile: { id: 'A' } });
      const shas = await serverShas(); const raw = await rawState();
      return { pass: visible === 1 && shas.includes(await sha(f)) && srv.rows.length === 1 && raw.count === 0 && raw.version === 3,
        visible, res, raw };
    },
    // Telefon v4 z 13.42–13.48: stare zdjęcia są widoczne, NIE wysyłają się same (także „Wyślij wszystkie”),
    // znacznik wstrzymania jest zapisany w rekordzie, a po świadomym „Wyślij” trafiają na serwer bez duplikatów.
    async S03_istniejaca_v4_z_13_48() {
      await cleanStart();
      const files = [await file('navy', 'a.png'), await file('teal', 'b.png'), await file('olive', 'c.png')];
      const recs = [
        await legacyRecord({ format: 'v4', id: 'local-photo-upload-v4a', owner: 'A', jobId: 'J3', unitRef: 'jw', f: files[0], status: 'local' }),
        await legacyRecord({ format: 'v4', id: 'local-photo-upload-v4b', owner: 'A', jobId: 'J3', unitRef: 'jz', f: files[1], status: 'error' }),
        await legacyRecord({ format: 'v4', id: 'local-photo-upload-v4c', owner: 'A', jobId: 'J4', unitRef: 'jw', f: files[2], status: 'uploading', leaseUntil: new Date(Date.now() - 60_000).toISOString() }),
      ];
      await rawCreate(4, recs);
      const p = await loadPhotos(); const q = await loadQueue();
      const items = await q.listPhotoQueueItems();
      const visible = items.length;
      const heldVisible = items.filter((i) => q.isPhotoQueueItemHeld?.(i)).length;
      const auto = await p.resumePersistedPhotoUploads({ supabase: supabaseFor('A'), profile: { id: 'A' } });
      const manualAll = await p.retryAllPersistedPhotoUploads({ supabase: supabaseFor('A'), profile: { id: 'A' } });
      const uploadsBeforeDecision = srv.uploads;
      const persistedMarks = (await rawRows()).filter((r) => r.legacy_v4_review === 'pending').length;
      const release = q.releaseHeldPhotoQueueItems ? await q.releaseHeldPhotoQueueItems() : { ok: false };
      const res = await p.retryAllPersistedPhotoUploads({ supabase: supabaseFor('A'), profile: { id: 'A' } });
      const shas = await serverShas(); const raw = await rawState();
      const expected = await Promise.all(files.map(sha));
      return { pass: visible === 3 && heldVisible === 3 && uploadsBeforeDecision === 0 && persistedMarks === 3 && release.ok === true
          && expected.every((h) => shas.includes(h)) && shas.length === 3 && new Set(shas).size === 3 && raw.count === 0 && raw.version === 4,
        visible, heldVisible, auto, manualAll, uploadsBeforeDecision, persistedMarks, release, res, serverObjects: shas.length, raw };
    },
    async S04_przyszla_wersja_bazy_nie_jest_obnizana() {
      await cleanStart();
      await rawCreate(7, []);
      const p = await loadPhotos();
      const f = await file('maroon', 'n.png');
      const r = await p.uploadJobDocumentationPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J5', documents: [{ file: f, deviceIndex: 0, unitRef: 'jw' }], setJobs: () => {} });
      const raw = await rawState();
      return { pass: r.failedCount === 0 && r.uploadedCount === 1 && raw.version === 7 && (await serverShas()).includes(await sha(f)), result: r, raw };
    },
    async S05_offline_komunikat_bez_falszywego_zapisano() {
      await cleanStart();
      const p = await loadPhotos(); setOnline(false);
      const ui = trackUi('J6');
      const f = await file('gold', 'q.png');
      const r = await p.uploadJobPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J6', event: { target: { files: [f], value: 'x' } }, setJobs: ui.setJobs });
      const raw = await rawState();
      return { pass: r.failedCount === 1 && r.offlineBlocked === true && /Brak internetu/.test(r.persistErrorMessage || '') && raw.count === 0 && !ui.seen.includes('Zapisano na telefonie') && srv.uploads === 0,
        result: r, raw, uiSeen: [...new Set(ui.seen)] };
    },
    async S06_brak_miejsca_online_wysylka_z_pamieci() {
      await cleanStart();
      const p = await loadPhotos();
      const ui = trackUi('J7');
      const f = await file('purple', 'm.png');
      const r = await quotaPut(() => p.uploadJobDocumentationPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J7', documents: [{ file: f, deviceIndex: 0, unitRef: 'jw' }], setJobs: ui.setJobs }));
      return { pass: r.uploadedCount === 1 && r.failedCount === 0 && srv.rows.length === 1 && (await serverShas()).includes(await sha(f)) && !ui.seen.includes('Zapisano na telefonie'),
        result: r, rows: srv.rows.length, uiSeen: [...new Set(ui.seen)] };
    },
    async S07_zablokowana_baza_bez_zawieszenia_i_bez_pustej_listy() {
      await cleanStart();
      // Baza v2 wymaga podniesienia do v3; „stara karta” trzyma połączenie i nie reaguje na versionchange.
      await rawCreate(2, [await legacyRecord({ format: 'v3', id: 'local-photo-upload-held', owner: 'A', jobId: 'J8', unitRef: 'jw', f: await file('silver', 'h.png') })]);
      const holder = await rawOpen(2);
      holder.onversionchange = null;
      const q = await loadQueue();
      const t0 = performance.now();
      const state = await withTimeout(q.readPhotoQueueState ? q.readPhotoQueueState() : q.listPhotoQueueItems().then((items) => ({ ok: true, items })), 15000, 'read');
      const saved = await withTimeout(q.savePhotoQueueItem({ id: 'local-photo-upload-new', job_id: 'J8', __localFile: await file('red', 'x.png') }), 15000, 'save');
      const ms = Math.round(performance.now() - t0);
      holder.close();
      const afterRelease = await withTimeout(q.listPhotoQueueItems(), 15000, 'after');
      return { pass: !state.__timeout && state.ok === false && ['PHOTO_QUEUE_BLOCKED', 'PHOTO_QUEUE_TIMEOUT'].includes(state.code) && saved === false && ms < 20000
          && Array.isArray(afterRelease) && afterRelease.length === 1,
        state: state.__timeout ? state : { ok: state.ok, code: state.code, items: state.items?.length }, saved, ms, afterRelease: Array.isArray(afterRelease) ? afterRelease.length : afterRelease };
    },
    // 13.66: chwilowy zanik połączenia przy wysyłce — kolejna próba od razu (bez kopii w telefonie).
    async S08_chwilowa_utrata_polaczenia_ponowienie_od_razu() {
      await cleanStart();
      const p = await loadPhotos();
      srv.faults.uploadSequence = ['network'];
      const f = await file('coral', 'n.png');
      const r = await p.uploadJobDocumentationPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J9', documents: [{ file: f, deviceIndex: 0, unitRef: 'jw' }], setJobs: () => {} });
      const raw = await rawState();
      return { pass: r.uploadedCount === 1 && r.failedCount === 0 && srv.rows.length === 1 && srv.objects.size === 1 && raw.count === 0 && (await serverShas()).includes(await sha(f)),
        result: { uploaded: r.uploadedCount, failed: r.failedCount }, uploads: srv.uploads, raw };
    },
    async S09_ponowienie_po_400_i_503() {
      await cleanStart();
      const p = await loadPhotos();
      srv.faults.uploadSequence = ['http400', 'http503'];
      const f = await file('indigo', 'r.png');
      const r = await p.uploadJobDocumentationPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J10', documents: [{ file: f, deviceIndex: 0, unitRef: 'jw' }], setJobs: () => {} });
      const raw = await rawState();
      return { pass: r.uploadedCount === 1 && srv.rows.length === 1 && srv.objects.size === 1 && raw.count === 0 && (await serverShas()).includes(await sha(f)),
        result: { uploaded: r.uploadedCount, failed: r.failedCount }, uploads: srv.uploads, raw };
    },
    async S10_status_tylko_po_commit_transakcji() {
      await cleanStart();
      const q = await loadQueue();
      await q.listPhotoQueueItems();
      const putFn = IDBObjectStore.prototype.put;
      // Żądanie put zostaje przyjęte, ale transakcja nie dochodzi do commit (abort) — zapis NIE może zostać zgłoszony.
      IDBObjectStore.prototype.put = function (...args) {
        const request = putFn.apply(this, args);
        if (this.name === STORE) this.transaction.abort();
        return request;
      };
      const f = await file('lime', 'a.png');
      let saved;
      try { saved = await q.savePhotoQueueItem({ id: 'local-photo-upload-abort', job_id: 'J11', __localFile: f }); }
      finally { IDBObjectStore.prototype.put = putFn; }
      const raw = await rawState();
      return { pass: saved === false && raw.count === 0, saved, raw };
    },
    async S11_naprawa_kolejki_usuwa_tylko_kolejke_zdjec() {
      await cleanStart();
      const f = await file('navy', 'z.png');
      await rawCreate(4, [await legacyRecord({ format: 'v4', id: 'local-photo-upload-del', owner: 'A', jobId: 'J12', unitRef: 'jw', f })]);
      const otherDb = await new Promise((resolve) => { const r = indexedDB.open('wawis-mobile-offline-data', 2); r.onupgradeneeded = () => r.result.createObjectStore('job-operations', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); });
      await new Promise((resolve) => { const tx = otherDb.transaction('job-operations', 'readwrite'); tx.objectStore('job-operations').put({ id: 'op-1', type: 'device' }); tx.oncomplete = resolve; });
      otherDb.close();
      localStorage.setItem('wawis-test-session-marker', 'zachowaj');
      const q = await loadQueue();
      if (!q.resetPhotoQueueDatabase) return { pass: false, reason: 'brak resetPhotoQueueDatabase' };
      const result = await q.resetPhotoQueueDatabase();
      const raw = await rawState();
      const otherCount = await new Promise((resolve) => { const r = indexedDB.open('wawis-mobile-offline-data'); r.onsuccess = () => { const db = r.result; const c = db.transaction('job-operations', 'readonly').objectStore('job-operations').count(); c.onsuccess = () => { db.close(); resolve(c.result); }; }; });
      const marker = localStorage.getItem('wawis-test-session-marker');
      await rawDelete('wawis-mobile-offline-data'); localStorage.removeItem('wawis-test-session-marker');
      return { pass: result.ok === true && raw.count === 0 && otherCount === 1 && marker === 'zachowaj', result, raw, otherCount, marker };
    },
    async S12_naprawa_przy_bazie_wyzszej_wersji() {
      await cleanStart();
      await rawCreate(9, [await legacyRecord({ format: 'v4', id: 'local-photo-upload-v9', owner: 'A', jobId: 'J13', unitRef: 'jw', f: await file('red', 'v9.png') })]);
      const q = await loadQueue();
      if (!q.resetPhotoQueueDatabase) return { pass: false, reason: 'brak resetPhotoQueueDatabase' };
      const result = await q.resetPhotoQueueDatabase();
      const raw = await rawState();
      return { pass: result.ok === true && raw.count === 0, result, raw };
    },
    async S13_naprawa_zablokowana_nie_deklaruje_sukcesu() {
      await cleanStart();
      await rawCreate(4, [await legacyRecord({ format: 'v4', id: 'local-photo-upload-blk', owner: 'A', jobId: 'J14', unitRef: 'jw', f: await file('teal', 'b.png') })]);
      const holder = await rawOpen(4); holder.onversionchange = null;
      const q = await loadQueue();
      if (!q.resetPhotoQueueDatabase) { holder.close(); return { pass: false, reason: 'brak resetPhotoQueueDatabase' }; }
      const result = await withTimeout(q.resetPhotoQueueDatabase({ timeoutMs: 2000 }), 15000, 'reset');
      const before = await withTimeout(rawState(), 3000, 'raw-blocked');
      holder.close();
      return { pass: !result.__timeout && result.ok === false && result.code === 'PHOTO_QUEUE_BLOCKED', result, stateWhileBlocked: before };
    },
    async S14_awaryjna_wysylka_z_pamieci_13_55() {
      await cleanStart();
      const p = await loadPhotos();
      const f = await file('olive', 'e.png');
      const [doc] = await p.prepareJobDocumentationPhotoIdentities({ jobId: 'J15', documents: [{ file: f, deviceIndex: 0, unitRef: 'jw' }] });
      const id = doc.uploadIdentity;
      const errors = [];
      const onUnhandled = (e) => errors.push(String(e.reason?.name || e.reason));
      window.addEventListener('unhandledrejection', onUnhandled);
      await quotaPut(async () => {
        p.retryQueuedJobPhoto({ supabase: supabaseFor('A'), profile: { id: 'A' }, setJobs: () => {}, photo: { id: id.localId, job_id: 'J15', upload_key: id.uploadKey, planned_storage_path: id.plannedStoragePath, file_fingerprint: id.fileFingerprint, uploaded_by: 'A', photo_kind: 'nameplate', device_index: 1, unit_ref: 'jw', __localFile: f, upload_status: 'error' } });
        await new Promise((r) => setTimeout(r, 1500));
      });
      window.removeEventListener('unhandledrejection', onUnhandled);
      return { pass: srv.rows.length === 1 && (await serverShas()).includes(await sha(f)) && errors.length === 0, rows: srv.rows.length, unhandled: errors };
    },
    // Przypadek Pawła (23.10): telefon z bazą v4, internet działa, zapis dwóch tabliczek JW/JZ z kreatora.
    async S15_przypadek_pawla_v4_dwie_tabliczki_online() {
      await cleanStart();
      await rawCreate(4, []);
      const p = await loadPhotos();
      const ui = trackUi('J16');
      const files = [await file('blue', 'jw.png'), await file('green', 'jz.png')];
      const r = await p.uploadJobDocumentationPhotos({ supabase: supabaseFor('P'), profile: { id: 'P' }, jobId: 'J16', documents: [{ file: files[0], deviceIndex: 0, unitRef: 'jw' }, { file: files[1], deviceIndex: 0, unitRef: 'jz' }], setJobs: ui.setJobs });
      const shas = await serverShas();
      const expected = await Promise.all(files.map(sha));
      return { pass: r.uploadedCount === 2 && r.failedCount === 0 && srv.rows.length === 2 && expected.every((h) => shas.includes(h)) && (await rawState()).count === 0,
        result: { uploadedCount: r.uploadedCount, queuedCount: r.queuedCount, failedCount: r.failedCount }, storagePosts: srv.uploads, rows: srv.rows.length };
    },
    // Przypadek Kacpra (23.10): telefon z bazą v4, zwykłe zdjęcie montażu przy działającym internecie.
    async S16_przypadek_kacpra_v4_zwykle_zdjecie_online() {
      await cleanStart();
      await rawCreate(4, []);
      const p = await loadPhotos();
      const ui = trackUi('J17');
      const errors = [];
      const f = await file('orange', 'montaz.png');
      const r = await p.uploadJobPhotos({ supabase: supabaseFor('K'), profile: { id: 'K' }, jobId: 'J17', event: { target: { files: [f], value: 'x' } }, setJobs: ui.setJobs, onPhotoUploadError: (e) => errors.push(String(e?.message || e)) });
      await new Promise((res) => setTimeout(res, 800));
      return { pass: r.failedCount === 0 && srv.rows.length === 1 && (await serverShas()).includes(await sha(f)) && errors.length === 0,
        result: { queuedCount: r.queuedCount, failedCount: r.failedCount }, storagePosts: srv.uploads, rows: srv.rows.length, errors };
    },
    // Decyzja „Usuń stare zdjęcia”: usuwa wyłącznie wstrzymane rekordy v4; nowe zdjęcie z 13.62 zostaje i wysyła się.
    // Decyzja „Usuń stare zdjęcia”: usuwa wyłącznie wstrzymane rekordy v4; nowe zdjęcie (z internetem) wysyła się normalnie.
    async S17_usuniecie_starych_zachowuje_nowe() {
      await cleanStart();
      const old = await file('black', 'old.png');
      await rawCreate(4, [await legacyRecord({ format: 'v4', id: 'local-photo-upload-old', owner: 'A', jobId: 'J18', unitRef: 'jw', f: old })]);
      const p = await loadPhotos(); const q = await loadQueue();
      const before = await q.listPhotoQueueItems();
      const del = q.deleteHeldPhotoQueueItems ? await q.deleteHeldPhotoQueueItems() : { ok: false };
      const fresh = await file('white', 'new.png');
      const r = await p.uploadJobDocumentationPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J18', documents: [{ file: fresh, deviceIndex: 0, unitRef: 'jz' }], setJobs: () => {} });
      const shas = await serverShas(); const raw = await rawState();
      return { pass: before.length === 1 && del.ok === true && del.count === 1 && r.uploadedCount === 1 && shas.length === 1 && shas.includes(await sha(fresh)) && !shas.includes(await sha(old)) && raw.count === 0,
        before: before.length, del, uploaded: r.uploadedCount, serverObjects: shas.length, raw };
    },
    // Bezpieczny powrót: 13.62 nie podnosi v3 i zakłada nowe bazy w v3, więc 13.61 (open v3) nadal działa.
    // Bezpieczny powrót: nowa instalacja zakłada kolejkę w v3, więc 13.61 (open v3) nadal działa.
    async S18_nowa_instalacja_v3_powrot_do_13_61() {
      await cleanStart();
      const q = await loadQueue();
      const state = await q.readPhotoQueueState();
      let reopenedBy1361 = null;
      try { const db = await rawOpen(3); reopenedBy1361 = db.version; db.close(); } catch (error) { reopenedBy1361 = String(error?.name || error); }
      const raw = await rawState();
      return { pass: state.ok === true && reopenedBy1361 === 3 && raw.version === 3, state: { ok: state.ok }, reopenedBy1361, raw };
    },
    // Kacper/Paweł po aktualizacji: start aplikacji online (restore + automatyczna wysyłka) NIE wysyła starych zdjęć,
    // a nowe zdjęcie zrobione w tej samej sesji wysyła się normalnie.
    async S19_start_online_nie_wysyla_starych_przed_decyzja() {
      await cleanStart();
      const old = await file('brown', 'stare.png');
      await rawCreate(4, [await legacyRecord({ format: 'v4', id: 'local-photo-upload-stare', owner: 'K', jobId: 'J20', unitRef: 'jw', f: old })]);
      const p = await loadPhotos(); const q = await loadQueue();
      const ui = trackUi('J20');
      await p.restorePersistedJobPhotos({ supabase: supabaseFor('K'), profile: { id: 'K' }, setJobs: ui.setJobs });
      await p.resumePersistedPhotoUploads({ supabase: supabaseFor('K'), profile: { id: 'K' }, setJobs: ui.setJobs });
      const uploadsAfterStart = srv.uploads;
      const fresh = await file('pink', 'nowe.png');
      const r = await p.uploadJobPhotos({ supabase: supabaseFor('K'), profile: { id: 'K' }, jobId: 'J20', event: { target: { files: [fresh], value: 'x' } }, setJobs: ui.setJobs });
      await new Promise((res) => setTimeout(res, 800));
      await p.resumePersistedPhotoUploads({ supabase: supabaseFor('K'), profile: { id: 'K' }, setJobs: ui.setJobs });
      const shas = await serverShas();
      const remaining = await q.listPhotoQueueItems();
      return { pass: uploadsAfterStart === 0 && r.failedCount === 0 && shas.length === 1 && shas.includes(await sha(fresh)) && !shas.includes(await sha(old))
          && remaining.length === 1 && q.isPhotoQueueItemHeld(remaining[0]) && ui.seen.includes('Wstrzymane — zdecyduj w Synchronizacji'),
        uploadsAfterStart, failed: r.failedCount, serverObjects: shas.length, remaining: remaining.length, uiSeen: [...new Set(ui.seen)] };
    },
    // 13.64: do Storage trafiają bajty z pamięci (nie obiekt File/Blob z IndexedDB, który Safari potrafi
    // wysłać jako puste żądanie 0 B). Zdjęcie zapisane offline wysyła się po powrocie internetu.
    // 13.64: do Storage trafiają bajty z pamięci (nie obiekt File/Blob, który Safari potrafi wysłać jako 0 B).
    async S20_wysylka_bajtow_z_pamieci() {
      await cleanStart();
      const p = await loadPhotos();
      const f = await file('teal', 'tabliczka.png');
      const r = await p.uploadJobDocumentationPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J21', documents: [{ file: f, deviceIndex: 0, unitRef: 'jz' }], setJobs: () => {} });
      const sizes = [...srv.objects.values()].map((b) => b.byteLength);
      return { pass: r.uploadedCount === 1 && srv.bodyKinds.length > 0 && srv.bodyKinds.every((k) => k === 'bytes') && sizes.length === 1 && sizes[0] > 0,
        bodyKinds: srv.bodyKinds, sizes };
    },
    // 13.64: nieczytelny / pusty plik w telefonie → jasny błąd „Zrób zdjęcie ponownie”, bez pustego żądania do serwera
    // i bez nieskończonego „czeka na internet”.
    // Stare zdjęcie w kolejce telefonu, którego nie da się odczytać (0 B) → jasny błąd, bez pustego żądania do serwera.
    async S21_pusty_plik_w_telefonie_jasny_blad() {
      await cleanStart();
      const f = await file('navy', 'pusta.png');
      const rec = await legacyRecord({ format: 'v3', id: 'local-photo-upload-empty', owner: 'A', jobId: 'J22', unitRef: 'jw', f });
      rec.queue_writer = '13.62';
      await rawCreate(3, [rec]);
      const p = await loadPhotos(); const q = await loadQueue();
      const original = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = async function emptyRead() { return new ArrayBuffer(0); };
      try { await p.resumePersistedPhotoUploads({ supabase: supabaseFor('A'), profile: { id: 'A' } }); }
      finally { Blob.prototype.arrayBuffer = original; }
      const items = await q.listPhotoQueueItems();
      const item = items[0] || {};
      return { pass: srv.uploads === 0 && items.length === 1 && item.upload_status === 'error' && /0 B|ponownie/.test(item.upload_error || ''),
        uploads: srv.uploads, status: item.upload_status, error: item.upload_error };
    },
    // 13.64: zdjęcie zawieszone jako „Wysyłane” z ważną blokadą (przypadek administratora 25.10) —
    // „Synchronizuj teraz” zwalnia blokadę, której nic nie wysyła, i wysyła zdjęcie od razu.
    async S22_synchronizuj_teraz_zawieszone_wysylane() {
      await cleanStart();
      const f = await file('olive', 'zawieszone.png');
      const rec = await legacyRecord({ format: 'v3', id: 'local-photo-upload-stuck', owner: 'A', jobId: 'J23', unitRef: 'jz', f, status: 'uploading', leaseUntil: new Date(Date.now() + 120_000).toISOString() });
      rec.queue_writer = '13.62';
      await rawCreate(3, [rec]);
      const p = await loadPhotos();
      const before = await p.retryAllPersistedPhotoUploads({ supabase: supabaseFor('A'), profile: { id: 'A' } });
      const uploadsBefore = srv.uploads;
      if (!p.releaseIdlePhotoUploadLeases) return { pass: false, reason: 'brak releaseIdlePhotoUploadLeases', uploadsBefore };
      const released = await p.releaseIdlePhotoUploadLeases();
      const after = await p.retryAllPersistedPhotoUploads({ supabase: supabaseFor('A'), profile: { id: 'A' } });
      const shas = await serverShas();
      return { pass: uploadsBefore === 0 && released === 1 && shas.length === 1 && shas.includes(await sha(f)) && (await rawState()).count === 0,
        before, uploadsBefore, released, after, serverObjects: shas.length };
    },
    // 13.65: zdjęcie zapisuje się w telefonie jako bajty (ArrayBuffer), nie Blob/File — Safari nie zgubi zawartości.
    // 13.65: kolejka telefonu (stare zdjęcia, naprawa) przechowuje bajty (ArrayBuffer), nie Blob/File.
    async S23_kolejka_zapisuje_bajty() {
      await cleanStart();
      const q = await loadQueue(); const p = await loadPhotos();
      const f = await file('maroon', 'bajty.png');
      const saved = await q.savePhotoQueueItem({ id: 'local-photo-upload-bytes', job_id: 'J24', uploaded_by: 'A', user_id: 'A', __localFile: f, photo_kind: 'nameplate', device_index: 1, unit_ref: 'jw' });
      const row = (await rawRows())[0] || {};
      const storedAsBytes = row.local_file_bytes instanceof ArrayBuffer && row.local_file_bytes.byteLength === f.size && !(row.local_file instanceof Blob);
      await p.resumePersistedPhotoUploads({ supabase: supabaseFor('A'), profile: { id: 'A' } });
      const shas = await serverShas();
      return { pass: saved === true && storedAsBytes && shas.length === 1 && shas.includes(await sha(f)) && (await rawState()).count === 0,
        saved, storedAsBytes, serverObjects: shas.length };
    },
    // 13.65: nieczytelny plik (odczyt nigdy się nie kończy) nie zawiesza kolejki — po limicie czasu jasny błąd,
    // bez żądania do serwera; kolejne zdjęcie nadal się wysyła.
    async S24_zawieszony_odczyt_nie_blokuje_kolejki() {
      await cleanStart();
      const f = await file('silver', 'zawieszony.png');
      const rec = await legacyRecord({ format: 'v3', id: 'local-photo-upload-hang', owner: 'A', jobId: 'J25', unitRef: 'jw', f });
      rec.queue_writer = '13.62';
      await rawCreate(3, [rec]);
      const p = await loadPhotos(); const q = await loadQueue();
      const original = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function neverResolves() { return new Promise(() => {}); };
      const t0 = performance.now();
      let res;
      try { res = await withTimeout(p.resumePersistedPhotoUploads({ supabase: supabaseFor('A'), profile: { id: 'A' } }), 45000, 'resume'); }
      finally { Blob.prototype.arrayBuffer = original; }
      const ms = Math.round(performance.now() - t0);
      const item = (await q.listPhotoQueueItems())[0] || {};
      return { pass: !res?.__timeout && srv.uploads === 0 && item.upload_status === 'error' && /ponownie/.test(item.upload_error || '') && ms < 45000,
        ms, res, uploads: srv.uploads, status: item.upload_status, error: item.upload_error };
    },
    // 13.66: tabliczki bez internetu — brak zapisu w telefonie, brak żądań do serwera, jasny komunikat.
    async S25_tabliczki_bez_internetu_komunikat() {
      await cleanStart();
      const p = await loadPhotos();
      setOnline(false);
      const ui = trackUi('J26');
      const files = [await file('blue', 'jw.png'), await file('green', 'jz.png')];
      const r = await p.uploadJobDocumentationPhotos({ supabase: supabaseFor('A'), profile: { id: 'A' }, jobId: 'J26', documents: [{ file: files[0], deviceIndex: 0, unitRef: 'jw' }, { file: files[1], deviceIndex: 0, unitRef: 'jz' }], setJobs: ui.setJobs });
      const raw = await rawState();
      setOnline(true);
      return { pass: r.failedCount === 2 && r.offlineBlocked === true && /Brak internetu/.test(r.persistErrorMessage || '') && raw.count === 0 && srv.uploads === 0 && ui.seen.length === 0,
        result: { failed: r.failedCount, code: r.persistErrorCode }, raw, uploads: srv.uploads, uiSeen: ui.seen };
    },
  };

  window.__wawisQueueHarness = {
    names: Object.keys(scenarios),
    async run(name) {
      try { return await scenarios[name](); } catch (error) { return { pass: false, error: `${error?.name || 'Error'}: ${error?.message || error}` }; }
    },
  };
})();
