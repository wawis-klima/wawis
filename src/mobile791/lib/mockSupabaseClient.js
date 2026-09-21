const MOCK_SESSION_KEY = 'klima-mock-supabase-session';
const MOCK_STORE_KEY = 'klima-mock-supabase-store-v3';
const MOCK_RESET_EVENT = 'klima:mock-reset';
const MOCK_SIGNED_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==';


function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createMockUser({ id, email, full_name, role }) {
  return {
    id,
    email,
    user_metadata: { full_name, role },
    app_metadata: {},
    aud: 'authenticated',
    role: 'authenticated',
    created_at: '2026-01-01T08:00:00.000Z',
  };
}

function createSeedData() {
  const admin = createMockUser({
    id: 'mock-admin-1',
    email: 'admin@wawis.test',
    full_name: 'Administrator Testowy',
    role: 'Administrator',
  });
  const worker = createMockUser({
    id: 'mock-worker-1',
    email: 'pracownik@wawis.test',
    full_name: 'Pracownik Testowy',
    role: 'Pracownik',
  });

  const profiles = [admin, worker].map((user) => ({
    id: user.id,
    full_name: user.user_metadata.full_name,
    email: user.email,
    role: user.user_metadata.role,
  }));

  const jobs = [
    {
      id: 'mock-job-001',
      title: 'Montaż testowy — Nowe',
      client: 'Klient Testowy A',
      email: 'klient.a@example.test',
      phone: '500100200',
      city: 'Warszawa',
      street: 'Klimatyczna 12',
      location: 'Warszawa, Klimatyczna 12',
      status: 'Nowe',
      installation_date: '2026-05-04',
      device_model: 'Daikin Mock 3.5 kW',
      device_serial_number: 'MOCK-DAI-001',
      admin_note: 'Mock do testów E2E desktop.',
      created_at: '2026-04-20T08:30:00.000Z',
      created_by: admin.id,
      main_technician_id: worker.id,
      contractor_id: 'mock-contractor-001',
      sms_consent: true,
      sms_reminder_enabled: true,
      service_due_date: '2027-05-04',
      last_sms_sent_at: null,
      last_sms_status: null,
      last_sms_error: null,
      sms_recipient_phone: '500100200',
    },
    {
      id: 'mock-job-002',
      title: 'Montaż testowy — W trakcie',
      client: 'Klient Testowy B',
      email: 'klient.b@example.test',
      phone: '500300400',
      city: 'Kraków',
      street: 'Chłodna 5',
      location: 'Kraków, Chłodna 5',
      status: 'W trakcie',
      installation_date: '2026-05-05',
      device_model: 'JW: Mitsubishi Mock JW 2,5 kW | JZ: Mitsubishi Mock JZ 2,5 kW',
      device_serial_number: 'JW: MOCK-MIT-JW-002 | JZ: MOCK-MIT-JZ-002',
      admin_note: '',
      created_at: '2026-04-21T09:45:00.000Z',
      created_by: admin.id,
      main_technician_id: worker.id,
      contractor_id: 'mock-contractor-002',
      sms_consent: true,
      sms_reminder_enabled: true,
      service_due_date: '2027-05-05',
      last_sms_sent_at: null,
      last_sms_status: null,
      last_sms_error: null,
      sms_recipient_phone: '500300400',
    },
    {
      id: 'mock-job-003',
      title: 'Montaż testowy — Zakończone',
      client: 'Klient Testowy C Zakończony',
      email: 'klient.c@example.test',
      phone: '500500600',
      city: 'Gdańsk',
      street: 'Serwisowa 9',
      location: 'Gdańsk, Serwisowa 9',
      status: 'Zakończone',
      installation_date: '2026-05-06',
      device_model: 'LG Mock 3.5 kW',
      device_serial_number: 'MOCK-LG-003',
      admin_note: 'Zakończona karta do testów blokad pracownika.',
      created_at: '2026-04-22T10:15:00.000Z',
      created_by: admin.id,
      completed_at: '2026-04-22T11:05:00.000Z',
      completed_by: worker.id,
      main_technician_id: worker.id,
      contractor_id: 'mock-contractor-003',
      sms_consent: true,
      sms_reminder_enabled: true,
      service_due_date: '2027-05-06',
      last_sms_sent_at: null,
      last_sms_status: null,
      last_sms_error: null,
      sms_recipient_phone: '500500600',
    },
    {
      id: 'mock-job-004',
      title: 'Montaż testowy — Cudzy',
      client: 'Klient Testowy D Cudzy',
      email: 'klient.d@example.test',
      phone: '500700800',
      city: 'Łódź',
      street: 'Obca 4',
      location: 'Łódź, Obca 4',
      status: 'W trakcie',
      installation_date: '2026-05-07',
      device_model: 'Toshiba Mock 2.5 kW',
      device_serial_number: 'MOCK-TOS-004',
      admin_note: 'Cudza karta do testów blokad pracownika.',
      created_at: '2026-04-23T11:00:00.000Z',
      created_by: admin.id,
      main_technician_id: admin.id,
      contractor_id: 'mock-contractor-004',
      sms_consent: true,
      sms_reminder_enabled: true,
      service_due_date: '2027-05-07',
      last_sms_sent_at: null,
      last_sms_status: null,
      last_sms_error: null,
      sms_recipient_phone: '500700800',
    },
    {
      id: 'mock-job-005',
      title: 'Montaż testowy — Multi-Split 3×JW',
      client: 'Klient Testowy Multi-Split',
      email: 'multi.test@example.test',
      phone: '500800900',
      city: 'Zawiercie',
      street: 'Multi-Splitowa 3',
      location: 'Zawiercie, Multi-Splitowa 3',
      status: 'W trakcie',
      installation_date: '2026-07-24',
      device_model: 'JW1: Rotenso Model JW 1 (TEST) | JW2: Rotenso Model JW 2 (TEST) | JW3: Rotenso Model JW 3 (TEST) | JZ: Rotenso Multi-Split JZ (TEST)',
      device_serial_number: 'JW1: TEST-MULTI-JW-1 | JW2: TEST-MULTI-JW-2 | JW3: TEST-MULTI-JW-3 | JZ: TEST-MULTI-JZ-1',
      admin_note: 'Karta testowa multi-split: jeden agregat i trzy jednostki wewnętrzne.',
      created_at: '2026-07-24T06:00:00.000Z',
      created_by: admin.id,
      main_technician_id: worker.id,
      contractor_id: 'mock-contractor-005',
      sms_consent: true,
      sms_reminder_enabled: true,
      service_due_date: '2027-07-24',
      last_sms_sent_at: null,
      last_sms_status: null,
      last_sms_error: null,
      sms_recipient_phone: '500800900',
    },
  ];

  return {
    users: [admin, worker],
    profiles,
    jobs,
    job_access: [
      { id: 'mock-access-001', job_id: 'mock-job-001', user_id: worker.id },
      { id: 'mock-access-002', job_id: 'mock-job-002', user_id: worker.id },
      { id: 'mock-access-003', job_id: 'mock-job-003', user_id: worker.id },
      { id: 'mock-access-004', job_id: 'mock-job-005', user_id: worker.id },
    ],
    comments: [
      { id: 'mock-comment-001', job_id: 'mock-job-001', author_id: admin.id, type: 'note', text: 'Komentarz testowy administratora.', created_at: '2026-04-22T10:00:00.000Z' },
    ],
    photos: [],
    notifications: [
      { id: 'mock-notification-001', user_id: admin.id, title: 'Mock E2E', body: 'Powiadomienie testowe', is_read: false, created_at: '2026-04-22T11:00:00.000Z', link_job_id: 'mock-job-001' },
    ],
    contractors: [
      { id: 'mock-contractor-001', company_name: 'Klient Testowy A', email: 'klient.a@example.test', phone: '500100200', city: 'Warszawa', street: 'Klimatyczna 12', is_active: true, created_at: '2026-04-10T08:00:00.000Z' },
      { id: 'mock-contractor-002', company_name: 'Klient Testowy B', email: 'klient.b@example.test', phone: '500300400', city: 'Kraków', street: 'Chłodna 5', is_active: true, created_at: '2026-04-11T08:00:00.000Z' },
      { id: 'mock-contractor-003', company_name: 'Klient Testowy C Zakończony', email: 'klient.c@example.test', phone: '500500600', city: 'Gdańsk', street: 'Serwisowa 9', is_active: true, created_at: '2026-04-12T08:00:00.000Z' },
      { id: 'mock-contractor-004', company_name: 'Klient Testowy D Cudzy', email: 'klient.d@example.test', phone: '500700800', city: 'Łódź', street: 'Obca 4', is_active: true, created_at: '2026-04-13T08:00:00.000Z' },
      { id: 'mock-contractor-005', company_name: 'Klient Testowy Multi-Split', email: 'multi.test@example.test', phone: '500800900', city: 'Zawiercie', street: 'Multi-Splitowa 3', is_active: true, created_at: '2026-07-24T06:00:00.000Z' },
    ],
    devices: [
      { id: 'mock-device-001', contractor_id: 'mock-contractor-001', contractor_name: 'Klient Testowy A', contractor_city: 'Warszawa', contractor_phone: '500100200', contractor_email: 'klient.a@example.test', contractor_street: 'Klimatyczna 12', model: 'Daikin Mock 3.5 kW', serial_number: 'MOCK-DAI-001', installation_date: '2026-05-04', status: 'aktywne', notes: '', source_job_id: 'mock-job-001', source_kind: 'job', service_reminder_years: 1, created_at: '2026-04-20T08:30:00.000Z', updated_at: '2026-04-20T08:30:00.000Z' },
      { id: 'mock-device-002', contractor_id: 'mock-contractor-002', contractor_name: 'Klient Testowy B', contractor_city: 'Kraków', contractor_phone: '500300400', contractor_email: 'klient.b@example.test', contractor_street: 'Chłodna 5', model: 'JW: Mitsubishi Mock JW 2,5 kW | JZ: Mitsubishi Mock JZ 2,5 kW', serial_number: 'JW: MOCK-MIT-JW-002 | JZ: MOCK-MIT-JZ-002', installation_date: '2026-05-05', status: 'aktywne', notes: '', source_job_id: 'mock-job-002', source_kind: 'job', service_reminder_years: 1, created_at: '2026-04-21T09:45:00.000Z', updated_at: '2026-04-21T09:45:00.000Z' },
      { id: 'mock-device-003', contractor_id: 'mock-contractor-003', contractor_name: 'Klient Testowy C Zakończony', contractor_city: 'Gdańsk', contractor_phone: '500500600', contractor_email: 'klient.c@example.test', contractor_street: 'Serwisowa 9', model: 'LG Mock 3.5 kW', serial_number: 'MOCK-LG-003', installation_date: '2026-05-06', status: 'aktywne', notes: '', source_job_id: 'mock-job-003', source_kind: 'job', service_reminder_years: 1, created_at: '2026-04-22T10:15:00.000Z', updated_at: '2026-04-22T10:15:00.000Z' },
      { id: 'mock-device-004', contractor_id: 'mock-contractor-004', contractor_name: 'Klient Testowy D Cudzy', contractor_city: 'Łódź', contractor_phone: '500700800', contractor_email: 'klient.d@example.test', contractor_street: 'Obca 4', model: 'Toshiba Mock 2.5 kW', serial_number: 'MOCK-TOS-004', installation_date: '2026-05-07', status: 'aktywne', notes: '', source_job_id: 'mock-job-004', source_kind: 'job', service_reminder_years: 1, created_at: '2026-04-23T11:00:00.000Z', updated_at: '2026-04-23T11:00:00.000Z' },
      { id: 'mock-device-005', contractor_id: 'mock-contractor-005', contractor_name: 'Klient Testowy Multi-Split', contractor_city: 'Zawiercie', contractor_phone: '500800900', contractor_email: 'multi.test@example.test', contractor_street: 'Multi-Splitowa 3', model: 'JW1: Rotenso Model JW 1 (TEST) | JW2: Rotenso Model JW 2 (TEST) | JW3: Rotenso Model JW 3 (TEST) | JZ: Rotenso Multi-Split JZ (TEST)', serial_number: 'JW1: TEST-MULTI-JW-1 | JW2: TEST-MULTI-JW-2 | JW3: TEST-MULTI-JW-3 | JZ: TEST-MULTI-JZ-1', installation_date: '2026-07-24', status: 'aktywne', notes: 'Karta testowa zdjęć multi-split.', source_job_id: 'mock-job-005', source_kind: 'job', service_reminder_years: 1, created_at: '2026-07-24T06:00:00.000Z', updated_at: '2026-07-24T06:00:00.000Z' },
    ],
    sms_settings: {
      is_enabled: true,
      sender_name: 'WAWIS',
      service_phone: '600700800',
      company_name: 'Wawis Klimatyzacja',
      template_service_reminder: 'Dzień dobry, przypominamy o serwisie klimatyzacji {{device_model}}.',
    },
    sms_log: [
      { id: 'mock-sms-001', job_id: 'mock-job-001', device_id: null, recipient_phone: '500100200', message: 'SMS testowy', status: 'sent', sent_at: '2026-04-23T12:00:00.000Z', created_at: '2026-04-23T12:00:00.000Z' },
    ],
    job_protocols: [],
    job_protocol_email_log: [],
    push_subscriptions: [],
  };
}

function getSharedStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function persistSession(session) {
  const storage = getSessionStorage();
  if (!storage) return;
  if (session) storage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
  else storage.removeItem(MOCK_SESSION_KEY);
}

function restoreSession(users) {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(MOCK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const user = users.find((item) => item.id === parsed?.user?.id) || null;
    return user ? { access_token: `mock-token-${user.id}`, user } : null;
  } catch {
    return null;
  }
}

function restoreSharedStore() {
  const storage = getSharedStorage();
  if (!storage) return createSeedData();
  try {
    const raw = storage.getItem(MOCK_STORE_KEY);
    return raw ? JSON.parse(raw) : createSeedData();
  } catch {
    return createSeedData();
  }
}

class MockQueryBuilder {
  constructor(store, tableName, onMutation) {
    this.store = store;
    this.tableName = tableName;
    this.filters = [];
    this.sorters = [];
    this.rangeValue = null;
    this.limitValue = null;
    this.maybeSingleMode = false;
    this.pendingMutation = null;
    this.onMutation = onMutation;
  }

  select() {
    return this;
  }

  order(field, options = {}) {
    this.sorters.push({ field, ascending: options.ascending !== false });
    return this;
  }

  eq(field, value) {
    this.filters.push((item) => String(item?.[field] ?? '') === String(value ?? ''));
    return this;
  }

  is(field, value) {
    this.filters.push((item) => item?.[field] === value);
    return this;
  }

  in(field, values = []) {
    const normalized = new Set(values.map((value) => String(value)));
    this.filters.push((item) => normalized.has(String(item?.[field] ?? '')));
    return this;
  }

  range(from, to) {
    this.rangeValue = [from, to];
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  maybeSingle() {
    this.maybeSingleMode = true;
    return this;
  }

  single() {
    this.maybeSingleMode = true;
    return this;
  }

  insert(payload) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const table = this.getTable();
    const inserted = rows.map((row) => ({ id: row.id || `mock-${this.tableName}-${Date.now()}-${Math.random().toString(36).slice(2)}`, created_at: row.created_at || nowIso(), ...row }));
    table.push(...inserted);
    this.pendingMutation = inserted;
    return this;
  }

  upsert(payload) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const table = this.getTable();
    const changed = [];
    for (const row of rows) {
      const id = row.id || row.user_id || row.endpoint || `mock-${this.tableName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const index = table.findIndex((item) => String(item.id || item.user_id || item.endpoint) === String(id));
      if (index >= 0) {
        table[index] = { ...table[index], ...row, id: table[index].id || row.id || id, updated_at: nowIso() };
        changed.push(table[index]);
      } else {
        const next = { id: row.id || id, created_at: row.created_at || nowIso(), ...row };
        table.push(next);
        changed.push(next);
      }
    }
    this.pendingMutation = changed;
    return this;
  }

  update(payload) {
    this.pendingMutation = { type: 'update', payload };
    return this;
  }

  delete() {
    this.pendingMutation = { type: 'delete' };
    return this;
  }

  getTable() {
    if (!Array.isArray(this.store[this.tableName])) this.store[this.tableName] = [];
    return this.store[this.tableName];
  }

  applyFilters(rows) {
    return this.filters.reduce((items, filter) => items.filter(filter), rows);
  }

  applySort(rows) {
    const result = [...rows];
    for (const sorter of [...this.sorters].reverse()) {
      result.sort((a, b) => {
        const left = String(a?.[sorter.field] ?? '');
        const right = String(b?.[sorter.field] ?? '');
        return sorter.ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }
    return result;
  }

  applyWindow(rows) {
    let result = rows;
    if (this.rangeValue) result = result.slice(this.rangeValue[0], this.rangeValue[1] + 1);
    if (Number.isFinite(this.limitValue)) result = result.slice(0, this.limitValue);
    return result;
  }

  then(resolve, reject) {
    Promise.resolve(this.execute()).then(resolve, reject);
  }

  async execute() {
    const table = this.getTable();

    if (this.pendingMutation?.type === 'update') {
      const filtered = this.applyFilters(table);
      for (const item of filtered) Object.assign(item, this.pendingMutation.payload, { updated_at: nowIso() });
      this.onMutation?.({ table: this.tableName, event: 'UPDATE', newRows: filtered, oldRows: [] });
      return { data: clone(filtered), error: null };
    }

    if (this.pendingMutation?.type === 'delete') {
      const filtered = this.applyFilters(table);
      const deletedIds = new Set(filtered.map((item) => item.id));
      this.store[this.tableName] = table.filter((item) => !deletedIds.has(item.id));
      this.onMutation?.({ table: this.tableName, event: 'DELETE', newRows: [], oldRows: filtered });
      return { data: clone(filtered), error: null };
    }

    if (this.pendingMutation) {
      this.onMutation?.({ table: this.tableName, event: 'INSERT', newRows: this.pendingMutation, oldRows: [] });
      return { data: clone(this.pendingMutation), error: null };
    }

    let rows = this.applyWindow(this.applySort(this.applyFilters(table)));
    if (this.maybeSingleMode) rows = rows[0] || null;
    return { data: clone(rows), error: null };
  }
}

export function createMockSupabaseClient() {
  let store = restoreSharedStore();
  const storageObjects = new Map();
  const listeners = new Set();
  const realtimeHandlers = new Set();

  function emitRealtime(change) {
    const rows = change.event === 'DELETE' ? change.oldRows : change.newRows;
    const payloads = (rows?.length ? rows : [{}]).map((row) => ({
      eventType: change.event,
      table: change.table,
      schema: 'public',
      new: change.event === 'DELETE' ? {} : clone(row),
      old: change.event === 'DELETE' ? clone(row) : {},
    }));
    for (const handler of realtimeHandlers) {
      if (handler.filter?.table && handler.filter.table !== change.table) continue;
      if (handler.filter?.event && handler.filter.event !== '*' && handler.filter.event !== change.event) continue;
      for (const payload of payloads) queueMicrotask(() => handler.callback(payload));
    }
  }

  function persistSharedStore(change) {
    const storage = getSharedStorage();
    storage?.setItem(MOCK_STORE_KEY, JSON.stringify(store));
    if (change) emitRealtime(change);
  }

  function resetMockData({ keepSession = false } = {}) {
    store = createSeedData();
    storageObjects.clear();
    persistSharedStore({ table: '*', event: 'UPDATE', newRows: [], oldRows: [] });
    if (!keepSession) persistSession(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MOCK_RESET_EVENT));
    }
    return clone(store);
  }


  function notifyAuth(session) {
    for (const listener of listeners) {
      queueMicrotask(() => listener('SIGNED_IN', session));
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== MOCK_STORE_KEY || !event.newValue) return;
      try {
        store = JSON.parse(event.newValue);
        for (const table of ['jobs', 'job_access', 'comments', 'photos', 'notifications']) {
          emitRealtime({ table, event: 'UPDATE', newRows: [], oldRows: [] });
        }
      } catch {
        // Nieprawidłowe dane testowe nie powinny zatrzymać strony E2E.
      }
    });
    window.__KLIMA_MOCK_SUPABASE__ = {
      reset: resetMockData,
      getStore: () => clone(store),
      credentials: MOCK_SUPABASE_CREDENTIALS,
    };
  }

  const client = {
    auth: {
      async getSession() {
        return { data: { session: restoreSession(store.users) }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const normalizedEmail = normalizeEmail(email);
        const user = store.users.find((item) => normalizeEmail(item.email) === normalizedEmail);
        if (!user || !String(password || '').trim()) {
          return { data: { user: null, session: null }, error: { message: 'Nieprawidłowe dane logowania mock.' } };
        }
        const session = { access_token: `mock-token-${user.id}`, user };
        persistSession(session);
        notifyAuth(session);
        return { data: { user, session }, error: null };
      },
      async signOut() {
        persistSession(null);
        for (const listener of listeners) queueMicrotask(() => listener('SIGNED_OUT', null));
        return { error: null };
      },
      async signUp({ email, password, options }) {
        const id = `mock-user-${Date.now()}`;
        const user = createMockUser({
          id,
          email,
          full_name: options?.data?.full_name || email,
          role: options?.data?.role || 'Pracownik',
        });
        store.users.push(user);
        store.profiles.push({ id, full_name: user.user_metadata.full_name, email: user.email, role: user.user_metadata.role });
        persistSharedStore({ table: 'profiles', event: 'INSERT', newRows: [store.profiles.at(-1)], oldRows: [] });
        return { data: { user }, error: password ? null : { message: 'Hasło jest wymagane.' } };
      },
      onAuthStateChange(callback) {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
    },
    from(tableName) {
      return new MockQueryBuilder(store, tableName, persistSharedStore);
    },
    async rpc(name, payload = {}) {
      if (name === 'admin_cleanup_sms_duplicate_logs') return { data: { ok: true, mock: true }, error: null };
      if (name === 'admin_get_sms_module_snapshot') return { data: { settings: store.sms_settings, logs: store.sms_log }, error: null };
      if (name === 'admin_upsert_sms_settings') {
        store.sms_settings = {
          ...store.sms_settings,
          is_enabled: !!payload.p_is_enabled,
          sender_name: payload.p_sender_name || store.sms_settings.sender_name,
          service_phone: payload.p_service_phone || store.sms_settings.service_phone,
          company_name: payload.p_company_name || store.sms_settings.company_name,
          template_service_reminder: payload.p_template_service_reminder || store.sms_settings.template_service_reminder,
        };
        return { data: store.sms_settings, error: null };
      }
      if (name === 'admin_list_contractors') return { data: clone(store.contractors), error: null };
      if (name === 'admin_list_devices_with_contractor') return { data: clone(store.devices), error: null };
      if (name === 'admin_get_contractor_devices') return { data: clone(store.devices.filter((device) => device.contractor_id === payload.p_contractor_id)), error: null };
      if (name === 'admin_sync_device_from_job') return { data: { synced: true }, error: null };
      if (name === 'admin_sync_devices_from_jobs') return { data: clone(store.devices), error: null };
      if (name === 'admin_get_device_sms_history') return { data: clone(store.sms_log), error: null };
      if (name === 'admin_update_device_status') {
        const device = store.devices.find((item) => item.id === payload.p_id);
        if (device) device.status = payload.p_status;
        return { data: clone(device || { id: payload.p_id, status: payload.p_status }), error: null };
      }
      if (name === 'admin_upsert_device') {
        const device = {
          id: payload.p_id || `mock-device-${Date.now()}`,
          contractor_id: payload.p_contractor_id || '',
          model: payload.p_model || '',
          serial_number: payload.p_serial_number || '',
          installation_date: payload.p_installation_date || '',
          status: payload.p_status || 'aktywne',
          notes: payload.p_notes || '',
          source_job_id: payload.p_source_job_id || '',
          source_kind: payload.p_source_kind || 'manual',
          updated_at: nowIso(),
        };
        const index = store.devices.findIndex((item) => item.id === device.id);
        if (index >= 0) store.devices[index] = { ...store.devices[index], ...device };
        else store.devices.push(device);
        return { data: clone(index >= 0 ? store.devices[index] : device), error: null };
      }
      if (name === 'worker_create_or_get_contractor_for_job') {
        const companyName = String(payload.p_company_name || '').trim();
        const phone = String(payload.p_phone || '').trim();
        const email = String(payload.p_email || '').trim().toLowerCase();
        const existing = store.contractors.find((item) => (
          String(item.company_name || '').trim().toLowerCase() === companyName.toLowerCase()
          || (phone && String(item.phone || '').replace(/\D+/g, '') === phone.replace(/\D+/g, ''))
          || (email && String(item.email || '').trim().toLowerCase() === email)
        ));
        if (existing) return { data: clone(existing), error: null };
        const contractor = {
          id: `mock-contractor-${Date.now()}`,
          company_name: companyName || 'Kontrahent mock',
          contact_person: '',
          email,
          phone,
          city: payload.p_city || '',
          street: payload.p_street || '',
          addresses: [],
          notes: 'Utworzono przez pracownika z mobilnego formularza nowego klienta.',
          nip: '',
          is_active: true,
          updated_at: nowIso(),
        };
        store.contractors.push(contractor);
        return { data: clone(contractor), error: null };
      }
      if (name === 'admin_upsert_contractor') {
        const addresses = Array.isArray(payload.p_addresses)
          ? payload.p_addresses.map((address, index) => ({
            id: address?.id || `mock-address-${index + 1}`,
            label: address?.label || `Adres ${index + 1}`,
            city: address?.city || '',
            street: address?.street || '',
            notes: address?.notes || '',
            is_primary: Boolean(address?.is_primary),
          }))
          : [];
        const primaryAddress = addresses.find((address) => address.is_primary) || addresses[0] || null;
        const contractor = {
          id: payload.p_id || `mock-contractor-${Date.now()}`,
          company_name: payload.p_company_name || 'Kontrahent mock',
          contact_person: payload.p_contact_person || '',
          email: payload.p_email || '',
          phone: payload.p_phone || '',
          city: primaryAddress?.city || payload.p_city || '',
          street: primaryAddress?.street || payload.p_street || '',
          addresses,
          notes: payload.p_notes || '',
          nip: payload.p_nip || '',
          is_active: payload.p_is_active !== false,
          updated_at: nowIso(),
        };
        const index = store.contractors.findIndex((item) => item.id === contractor.id);
        if (index >= 0) store.contractors[index] = { ...store.contractors[index], ...contractor };
        else store.contractors.push(contractor);
        return { data: clone(index >= 0 ? store.contractors[index] : contractor), error: null };
      }
      if (name === 'admin_delete_contractor') {
        store.contractors = store.contractors.filter((item) => item.id !== payload.p_id);
        return { data: true, error: null };
      }
      if (name === 'admin_delete_device') {
        store.devices = store.devices.filter((item) => item.id !== payload.p_id);
        return { data: true, error: null };
      }
      if (name === 'admin_delete_comment') {
        store.comments = store.comments.filter((item) => item.id !== payload.p_comment_id);
        return { data: true, error: null };
      }
      return { data: null, error: { message: `Mock RPC nie obsługuje funkcji: ${name}` } };
    },
    channel() {
      const handlers = [];
      const channel = {
        on(_type, filter, callback) {
          handlers.push({ filter, callback });
          return channel;
        },
        subscribe(callback) {
          handlers.forEach((handler) => realtimeHandlers.add(handler));
          if (typeof callback === 'function') queueMicrotask(() => callback('SUBSCRIBED'));
          return channel;
        },
        unsubscribe() {
          handlers.forEach((handler) => realtimeHandlers.delete(handler));
        },
      };
      return channel;
    },
    removeChannel(channel) {
      channel?.unsubscribe?.();
      return 'ok';
    },
    functions: {
      async invoke(name, options = {}) {
        if (name !== 'send-job-protocol-email') {
          return { data: null, error: { message: `Mock Edge Function nie obsługuje funkcji: ${name}` } };
        }
        const body = options?.body || {};
        const session = restoreSession(store.users);
        const job = store.jobs.find((item) => String(item.id) === String(body.jobId));
        const protocol = store.job_protocols.find((item) => String(item.id) === String(body.protocolId) && String(item.job_id) === String(body.jobId));
        if (!session?.user) return { data: null, error: { message: 'Sesja wygasła. Zaloguj się ponownie.' } };
        if (!job || !protocol || job.status !== 'Zakończone') return { data: null, error: { message: 'Nie znaleziono zakończonego zlecenia z protokołem.' } };
        if (normalizeEmail(body.recipientEmail) !== normalizeEmail(job.email)) {
          return { data: null, error: { message: 'Protokół można wysłać wyłącznie na adres klienta zapisany w zleceniu.' } };
        }
        const sentAt = nowIso();
        store.job_protocol_email_log.push({
          id: `mock-protocol-email-${Date.now()}`,
          request_key: body.requestKey,
          job_id: job.id,
          protocol_id: protocol.id,
          recipient_email: normalizeEmail(job.email),
          sender_email: 'biuro@wawis.pl',
          provider: 'mock-resend',
          provider_message_id: `mock-email-${Date.now()}`,
          status: 'sent',
          sent_by: session.user.id,
          sent_at: sentAt,
          created_at: sentAt,
        });
        persistSharedStore({ table: 'job_protocol_email_log', event: 'INSERT', newRows: [store.job_protocol_email_log.at(-1)], oldRows: [] });
        return {
          data: {
            ok: true,
            recipientEmail: normalizeEmail(job.email),
            senderEmail: 'biuro@wawis.pl',
            sentAt,
          },
          error: null,
        };
      },
    },
    storage: {
      from(bucket) {
        return {
          getPublicUrl(path) { return { data: { publicUrl: `mock://${bucket}/${path}` } }; },
          async createSignedUrl() { return { data: { signedUrl: MOCK_SIGNED_PIXEL }, error: null }; },
          async upload(path, body) {
            storageObjects.set(`${bucket}/${path}`, body);
            return { data: { path }, error: null };
          },
          async download(path) {
            const stored = storageObjects.get(`${bucket}/${path}`);
            if (stored instanceof Blob) return { data: stored, error: null };
            return { data: new Blob(['%PDF-1.4 mock protocol'], { type: 'application/pdf' }), error: null };
          },
          async remove(paths = []) {
            for (const path of paths) storageObjects.delete(`${bucket}/${path}`);
            return { data: {}, error: null };
          },
        };
      },
    },
    __mock: { get store() { return store; }, reset: resetMockData },
  };

  return client;
}

export const MOCK_SUPABASE_CREDENTIALS = {
  admin: { email: 'admin@wawis.test', password: 'test1234' },
  worker: { email: 'pracownik@wawis.test', password: 'test1234' },
};
