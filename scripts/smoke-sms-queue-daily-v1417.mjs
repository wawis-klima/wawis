// WAWIS 14.17 — codzienne odświeżenie kolejki SMS (pg_cron → generate-service-sms-queue) i push do administratora.
// Uruchamia PRAWDZIWY handler Edge (vm + atrapy Supabase/web-push) oraz moduł daily-run.ts wprost (Node strip-types).
// RED na 14.16: brak trybu dziennego — wywołanie z bazy bez sesji kończyło się 401, nikt nie dostawał powiadomienia.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import * as daily from '../supabase/functions/generate-service-sms-queue/daily-run.ts';

const RUN_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'a'.repeat(64);
const ADMIN = { id: 'admin-1', role: 'Administrator', created_at: '2026-03-31' };

function makeAdminClient({ claim = true, pending = 2, subscriptions = 1 } = {}) {
  const calls = { rpc: [], inserts: [], updates: [] };
  const client = {
    calls,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'claim_sms_queue_daily_run_v1417') return { data: claim && args.p_run_id === RUN_ID && args.p_token === TOKEN, error: null };
      if (name === 'count_pending_sms_groups_v1417') return { data: pending, error: null };
      if (name === 'push_claim_delivery_v1268') return { data: true, error: null };
      if (name === 'finish_sms_queue_daily_run_v1417') return { data: true, error: null };
      return { data: null, error: null };
    },
    from(table) {
      const state = { table, filters: [] };
      const q = {
        select() { return q; }, eq(k, v) { state.filters.push([k, v]); return q; }, in() { return q; },
        not() { return q; }, is() { return q; }, gte() { return q; }, order() { return q; }, limit() { return q; },
        range() { return q; }, single() { state.single = true; return q; }, maybeSingle() { state.single = true; return q; },
        insert(row) { calls.inserts.push({ table, row }); state.insert = row; return q; },
        update(patch) { calls.updates.push({ table, patch }); return q; },
        upsert() { return q; },
        then(resolve) {
          if (state.insert && table === 'push_delivery_log') return resolve({ data: { id: `log-${calls.inserts.length}` }, error: null });
          if (table === 'profiles') return resolve({ data: state.single ? ADMIN : [ADMIN], error: null });
          if (table === 'push_subscriptions') {
            return resolve({ data: Array.from({ length: subscriptions }, (_, i) => ({ id: `sub-${i}`, user_id: ADMIN.id, endpoint: `https://push.example/${i}`, p256dh: 'k', auth: 'a', ownership_generation: 1 })), error: null });
          }
          if (table === 'sms_settings') return resolve({ data: { is_enabled: true }, error: null });
          return resolve({ data: state.single ? null : [], error: null });
        },
      };
      return q;
    },
  };
  return client;
}

function makeWebpush() {
  const sent = [];
  return { sent, setVapidDetails() {}, sendNotification: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); } };
}

// ---------- 1. Moduł daily-run.ts ----------
assert.deepEqual(await daily.authorizeDailyRun(makeAdminClient(), {}), { isDaily: false }, 'zwykłe wywołanie z aplikacji');
assert.equal((await daily.authorizeDailyRun(makeAdminClient(), { eventType: daily.DAILY_EVENT_TYPE, runId: RUN_ID, token: 'krótki' })).status, 403);
assert.equal((await daily.authorizeDailyRun(makeAdminClient({ claim: false }), { eventType: daily.DAILY_EVENT_TYPE, runId: RUN_ID, token: TOKEN })).status, 403, 'kod niepotwierdzony w bazie');
const authorized = await daily.authorizeDailyRun(makeAdminClient(), { eventType: daily.DAILY_EVENT_TYPE, runId: RUN_ID, token: TOKEN });
assert.deepEqual(authorized, { isDaily: true, ok: true, runId: RUN_ID, token: TOKEN, adminId: ADMIN.id });

const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:test@example.invalid' };
for (const [pending, word] of [[1, '1 SMS czeka'], [3, '3 SMS-y czekają'], [7, '7 SMS-ów czeka']]) {
  const client = makeAdminClient({ pending });
  const webpush = makeWebpush();
  const result = await daily.finishDailyRun({ adminClient: client, run: authorized, summary: { ok: true }, webpush, vapid, receiptEndpoint: 'https://x/receipt' });
  assert.equal(result.pending, pending);
  assert.equal(result.pushDelivered, 1);
  assert.equal(webpush.sent.length, 1);
  assert.equal(webpush.sent[0].payload.title, 'SMS-y do zatwierdzenia');
  assert.ok(webpush.sent[0].payload.body.startsWith(word), webpush.sent[0].payload.body);
  assert.ok(client.calls.rpc.some((c) => c.name === 'push_claim_delivery_v1268' && c.args.p_event_key === `sms_queue_daily:${RUN_ID}`), 'jedno powiadomienie na zadanie (claim)');
  assert.ok(client.calls.rpc.some((c) => c.name === 'finish_sms_queue_daily_run_v1417' && c.args.p_result.pending === pending), 'zadanie oznaczone jako wykonane');
}
{
  const client = makeAdminClient({ pending: 0 });
  const webpush = makeWebpush();
  const result = await daily.finishDailyRun({ adminClient: client, run: authorized, summary: { ok: true }, webpush, vapid, receiptEndpoint: '' });
  assert.equal(result.pending, 0);
  assert.equal(webpush.sent.length, 0, 'brak SMS-ów do zatwierdzenia = brak powiadomienia');
  assert.ok(client.calls.rpc.some((c) => c.name === 'finish_sms_queue_daily_run_v1417'));
}

// ---------- 2. Prawdziwy handler generate-service-sms-queue ----------
function loadHandler({ adminClient, webpush, userAuthorized }) {
  const source = fs.readFileSync(new URL('../supabase/functions/generate-service-sms-queue/index.ts', import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?;\s*$/gm, '');
  let handler = null;
  const userClient = { auth: { getUser: async () => (userAuthorized ? { data: { user: { id: ADMIN.id } }, error: null } : { data: { user: null }, error: { message: 'no session' } }) } };
  const context = {
    Deno: { env: { get: (name) => `fixture-${name}` }, serve: (fn) => { handler = fn; } },
    createClient: (_url, key) => (key === 'fixture-SUPABASE_SERVICE_ROLE_KEY' ? adminClient : userClient),
    webpush,
    authorizeDailyRun: daily.authorizeDailyRun,
    finishDailyRun: daily.finishDailyRun,
    Response, Request, URL, Intl, Date, JSON, Math, Number, String, Array, Object, Promise, Error, Map, Set, console, crypto,
  };
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(source), context);
  return handler;
}
const post = (body, headers = {}) => new Request('https://local.invalid/fn', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

{ // zadanie z poprawnym kodem: odświeżenie + push + zakończenie
  const adminClient = makeAdminClient({ pending: 2 });
  const webpush = makeWebpush();
  const handler = loadHandler({ adminClient, webpush, userAuthorized: false });
  const response = await handler(post({ eventType: daily.DAILY_EVENT_TYPE, runId: RUN_ID, token: TOKEN }));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.daily.pending, 2);
  assert.equal(webpush.sent.length, 1, 'administrator dostaje jedno powiadomienie');
  assert.ok(adminClient.calls.rpc.some((c) => c.name === 'finish_sms_queue_daily_run_v1417'));
}
{ // zadanie z kodem niepotwierdzonym: odmowa, bez odświeżania i bez push
  const adminClient = makeAdminClient({ claim: false });
  const webpush = makeWebpush();
  const handler = loadHandler({ adminClient, webpush, userAuthorized: false });
  const response = await handler(post({ eventType: daily.DAILY_EVENT_TYPE, runId: RUN_ID, token: TOKEN }));
  assert.equal(response.status, 403);
  assert.equal(webpush.sent.length, 0);
  assert.ok(!adminClient.calls.rpc.some((c) => c.name === 'count_pending_sms_groups_v1417'), 'bez dalszych kroków po odmowie');
}
{ // zwykłe wywołanie z aplikacji bez sesji: jak dotąd 401, bez push i bez zadania dziennego
  const adminClient = makeAdminClient();
  const webpush = makeWebpush();
  const handler = loadHandler({ adminClient, webpush, userAuthorized: false });
  const response = await handler(post({}));
  assert.equal(response.status, 401);
  assert.equal(webpush.sent.length, 0);
  assert.ok(!adminClient.calls.rpc.some((c) => c.name.endsWith('_v1417')));
}
{ // zwykłe wywołanie administratora z aplikacji: odświeżenie bez push (jak dotąd)
  const adminClient = makeAdminClient({ pending: 5 });
  const webpush = makeWebpush();
  const handler = loadHandler({ adminClient, webpush, userAuthorized: true });
  const response = await handler(post({}, { Authorization: 'Bearer fixture' }));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.daily, undefined, 'odświeżenie z ekranu SMS nie wysyła powiadomienia');
  assert.equal(webpush.sent.length, 0);
}

// ---------- 3. Migracja: tylko service_role, raz dziennie, bez zmian danych ----------
const sql = fs.readFileSync('supabase/migrations/20261103140000_sms_queue_daily_v1417.sql', 'utf8');
for (const fn of ['claim_sms_queue_daily_run_v1417(uuid, text)', 'finish_sms_queue_daily_run_v1417(uuid, text, jsonb)', 'count_pending_sms_groups_v1417()']) {
  assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated;`), `${fn}: brak dostępu z aplikacji`);
  assert.ok(sql.includes(`grant execute on function public.${fn} to service_role;`), `${fn}: tylko service_role`);
}
assert.match(sql, /run_date date not null unique/, 'jedno zadanie na dzień');
assert.match(sql, /'17 6,7,8 \* \* \*'/, 'harmonogram: rano, z dwiema próbami zapasowymi');
assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /\b(delete from|drop table|truncate|update public\.)/i, 'nie zmienia istniejących danych');
const manifest = JSON.parse(fs.readFileSync('supabase/rebuild/manifest-v1089.json', 'utf8'));
assert.ok(manifest.files.includes('supabase/migrations/20261103140000_sms_queue_daily_v1417.sql'), 'migracja w manifeście odtworzenia bazy');

console.log('PASS WAWIS 14.17 — dzienna kolejka SMS: kod potwierdzany w bazie, odświeżenie, jedno powiadomienie gdy są SMS-y, zwykłe odświeżanie bez zmian.');
