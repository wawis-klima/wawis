import assert from 'node:assert/strict';
import {
  logDiagnostic as logDesktop, buildDiagnosticReportImmediate as desktopReport,
  getDiagnosticEntries as desktopEntries, flushDiagnosticsToServer as desktopFlush,
} from '../src/modules/diagnostics.js';
import {
  logDiagnostic as logMobile, buildDiagnosticReportImmediate as mobileReport,
  getDiagnosticEntries as mobileEntries, flushDiagnosticsToServer as mobileFlush,
} from '../src/mobile791/modules/diagnostics.js';
import { setDiagnosticUser, getDiagnosticSession, readDiagnosticEntries } from '../src/modules/diagnostic-privacy.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => data.has(k) ? data.get(k) : null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    key: (n) => [...data.keys()][n] || null,
    get length() { return data.size; },
    dump: () => [...data.values()].join('\n'),
  };
}
const storage = fakeStorage();
globalThis.window = {
  localStorage: storage, location: { pathname: '/montaze/SECRET_CLIENT_123' },
  screen: { width: 390, height: 844 }, innerWidth: 390, innerHeight: 844,
  devicePixelRatio: 3,
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  onLine: true, language: 'pl-PL', platform: 'Jan Testowy', userAgent: 'iPhone Jan Testowy secret',
  storage: { estimate: async () => ({ usage: 20, quota: 100 }) },
  serviceWorker: {},
} });
globalThis.document = { visibilityState: 'visible' };

const PERSON = 'Jan Testowy';
const ADDRESS = 'ul. Testowa 7';
const SECRET = 'SYNTHETIC_SECRET_987';
const EMAIL = 'jan.testowy@example.test';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEGACY = 'klima_app_diagnostic_log';
const STORE = 'klima_app_diagnostic_log_v1273';

// RED D1: legacy storage contains raw customer data. It must be discarded,
// never adopted under the identity of the first user who happens to log in.
storage.setItem(LEGACY, JSON.stringify([{
  type: 'window.error', time: new Date().toISOString(),
  payload: { message: PERSON + ' ' + ADDRESS, password: SECRET }
}]));
assert.equal(getDiagnosticSession().userId, '');
setDiagnosticUser(USER_A);
assert.equal(storage.getItem(LEGACY), null);
assert.deepEqual(desktopEntries(), []);

const error = new Error('Authorization: Bearer ' + SECRET + '; ' + PERSON + ', ' + ADDRESS + ', ' + EMAIL);
error.code = '57014';
error.stack = 'Error\n  at ' + PERSON + ', ' + ADDRESS + ', ' + SECRET;
const cyclic = { customer: PERSON, message: ADDRESS };
cyclic.self = cyclic;
logDesktop('console.error', { args: ['refreshAll failed', error, cyclic], error, clientName: PERSON });
logMobile('window.error', {
  message: 'Failed to fetch; client=' + PERSON + ' ' + EMAIL,
  error: new Error('Authorization: Bearer ' + SECRET + ' at ' + ADDRESS),
  filename: 'https://example.test/' + PERSON, notes: ADDRESS,
});
assert.equal(desktopEntries().length, 2);
assert.equal(mobileEntries().length, 2);
assert.equal(desktopEntries()[0].payload.error.code, 'DB_STATEMENT_TIMEOUT');
for (const report of [
  desktopReport({ appVersion: '12.73', role: 'Administrator', currentJobId: 'SECRET_CLIENT_123',
    extra: { clientName: PERSON, count: 2 }, queueSummary: { total: 1, client: PERSON, file_name: SECRET } }),
  mobileReport({ appVersion: '12.73', role: 'Pracownik', currentJobId: 'SECRET_CLIENT_123',
    extra: { notes: ADDRESS, pending: 2 } }),
]) {
  assert.equal(report.currentJobId, '');
  assert.equal(report.runtime.path, '/');
  assert(report.entries.length >= 2);
  assert.equal(report.privacy.customerDataIncluded, false);
  const json = JSON.stringify(report);
  for (const secret of [PERSON, ADDRESS, SECRET, EMAIL, 'SECRET_CLIENT_123', 'Bearer', 'example.test']) {
    assert(!json.includes(secret), 'PII leaked to report: ' + secret);
  }
}
for (const secret of [PERSON, ADDRESS, SECRET, EMAIL, 'SECRET_CLIENT_123', 'Bearer', 'example.test']) {
  assert(!storage.dump().includes(secret), 'PII leaked to localStorage: ' + secret);
}

// RED D3: direct account switch and logout/login must not mix event owners.
let sentA = [];
const pending = {};
const wait = new Promise((resolve) => { pending.resolve = resolve; });
const supabase = { from(name) {
  assert.equal(name, 'app_diagnostic_events');
  return { upsert: async (rows) => { sentA = rows; await wait; return { error: null }; } };
} };
const flush = desktopFlush({ supabase, userId: USER_A });
assert(sentA.length >= 1);
assert(sentA.every((row) => row.user_id === USER_A));
setDiagnosticUser(USER_B);
assert.deepEqual(readDiagnosticEntries(), []);
logMobile('console.warn', { args: ['Failed to fetch', PERSON], password: SECRET });
const recordB = mobileEntries();
assert.equal(recordB.length, 1);
assert.equal(recordB[0].type, 'console.warn');
pending.resolve();
const stale = await flush;
assert.equal(stale.ignoredStaleSession, true);
assert.equal(desktopEntries().length, 1);
assert(storage.dump().includes(USER_B));
assert(!storage.dump().includes(USER_A));
assert(!storage.dump().includes(SECRET));

const rowsB = [];
const mock = { from() { return { upsert: async (rows) => { rowsB.push(...rows); return { error: null }; } }; } };
await mobileFlush({ supabase: mock, userId: USER_B });
assert(rowsB.length === 1 && rowsB[0].user_id === USER_B);
const mismatch = await desktopFlush({ supabase: mock, userId: USER_A });
assert.equal(mismatch.sessionMismatch, true);
assert.equal(rowsB.length, 1);

setDiagnosticUser('');
assert.deepEqual(readDiagnosticEntries(), []);
assert.equal(storage.getItem(STORE), null);
logDesktop('console.warn', { args: ['Failed to fetch'] });
assert.equal(storage.getItem(STORE), null);
setDiagnosticUser(USER_A);
assert.deepEqual(mobileEntries(), []);

// Another tab with a different account must never be readable by this session.
storage.setItem(STORE, JSON.stringify({ version: 3, owner: USER_B, entries: [
  { id: 'test-12345', time: new Date().toISOString(), type: 'console.error',
    payload: { error: { message: PERSON } } }
] }));
assert.deepEqual(desktopEntries(), []);
assert.equal(storage.getItem(STORE), null);

console.log('PASS: P0 D1/D3 privacy + shared-account isolation (desktop/mobile, legacy, signed-out, pending ACK).');
