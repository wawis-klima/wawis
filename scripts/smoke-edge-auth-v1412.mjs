// WAWIS 14.12 — uprawnienia funkcji Edge (audyt bezpieczeństwa 03.11.2026).
// Uruchamia PRAWDZIWE handlery Edge (vm + atrapy Supabase/fetch), bez sieci i bez produkcji.
// RED na 14.11: tryb „x-wawis-dry” cen paliwa działał bez logowania (do 40 PDF-ów z API Sejmu na żądanie),
// a wyszukiwarka GUS przyjmowała każde zalogowane konto, także „Oczekujący” bez roli.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import * as fuelParse from '../supabase/functions/fuel-reference-prices/parse.js';

function loadHandler(file, extraContext) {
  const source = fs.readFileSync(new URL(`../supabase/functions/${file}`, import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?;\s*$/gm, '');
  let handler = null;
  const context = {
    Deno: { env: { get: (name) => (name === 'SUPABASE_PUBLISHABLE_KEYS' || name === 'SUPABASE_SECRET_KEYS' ? '' : `fixture-${name}`) }, serve: (fn) => { handler = fn; } },
    Response, Request, URL, URLSearchParams, AbortController, DOMException, TextEncoder, Uint8Array,
    setTimeout, clearTimeout, console, Intl, Date, JSON, Math, Number, String, Array, Object, Promise, Error,
    ...extraContext,
  };
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(source), context);
  assert.equal(typeof handler, 'function', `${file}: Deno.serve nie zarejestrował handlera`);
  return handler;
}

// Atrapa sesji: rola decyduje o wyniku RPC current_user_is_staff / current_user_is_admin.
let role = null; // null = brak sesji, 'Oczekujący', 'Pracownik', 'Administrator'
const rpcCalls = [];
function fakeCreateClient() {
  return {
    auth: { getUser: async () => (role ? { data: { user: { id: 'u-1' } }, error: null } : { data: { user: null }, error: { message: 'no session' } }) },
    rpc: async (name) => {
      rpcCalls.push(name);
      if (name === 'current_user_is_staff') return { data: ['Pracownik', 'Administrator'].includes(role), error: null };
      if (name === 'current_user_is_admin') return { data: role === 'Administrator', error: null };
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
    from: () => {
      const query = {
        select() { return query; }, gte() { return query; }, eq() { return query; }, in() { return query; },
        order() { return query; }, limit() { return query; }, maybeSingle() { return query; }, upsert: async () => ({ error: null }),
        then(resolve) { resolve({ data: [], error: null }); },
      };
      return query;
    },
  };
}

const post = (headers = {}, body = {}) => new Request('https://local.invalid/fn', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

// ---------- fuel-reference-prices: tryb diagnostyczny tylko dla administratora ----------
let fuelFetches = 0;
const fuelHandler = loadHandler('fuel-reference-prices/index.ts', {
  ...fuelParse,
  createClient: fakeCreateClient,
  extractText: async () => ({ text: '' }),
  getDocumentProxy: async () => ({}),
  fetch: async () => { fuelFetches += 1; return new Response(JSON.stringify({ items: [] }), { status: 200 }); },
});

for (const [label, current, headers] of [
  ['bez sesji', null, {}],
  ['Oczekujący', 'Oczekujący', { Authorization: 'Bearer fixture' }],
  ['Pracownik', 'Pracownik', { Authorization: 'Bearer fixture' }],
]) {
  role = current; fuelFetches = 0;
  for (const body of [{ limit: 40 }, { action: 'market' }]) {
    const response = await fuelHandler(post({ 'x-wawis-dry': '1', ...headers }, body));
    assert.equal(response.status, 403, `fuel dry (${label}, ${JSON.stringify(body)}): wymagany administrator`);
  }
  assert.equal(fuelFetches, 0, `fuel dry (${label}): żadnego pobierania z zewnętrznych serwisów przed sprawdzeniem uprawnień`);
}

role = 'Administrator'; fuelFetches = 0;
const adminDry = await fuelHandler(post({ 'x-wawis-dry': '1', Authorization: 'Bearer fixture' }, { limit: 3 }));
assert.equal(adminDry.status, 200, 'fuel dry: administrator nadal może uruchomić diagnostykę');
assert.equal((await adminDry.json()).dry, true);
assert.ok(fuelFetches >= 1, 'fuel dry administratora faktycznie czyta obwieszczenia');

// Zadanie pg_cron (x-wawis-snapshot) działa bez sesji jak dotąd: zapis wyłącznie publicznych średnich,
// z limitem częstotliwości w funkcji. Zmiana nie może zatrzymać codziennego zadania.
role = null; fuelFetches = 0;
const snapshot = await fuelHandler(post({ 'x-wawis-snapshot': '1' }, {}));
assert.equal(snapshot.status, 200, 'codzienne zadanie cen rynkowych nadal działa');
assert.equal((await snapshot.json()).snapshot, true);

// ---------- gus-bir-lookup: tylko pracownik lub administrator ----------
let gusFetches = 0;
const gusHandler = loadHandler('gus-bir-lookup/index.ts', {
  createClient: fakeCreateClient,
  fetch: async (_url, options) => {
    gusFetches += 1;
    const isLogin = String(options?.headers?.SOAPAction || '').endsWith('/Zaloguj');
    const xml = isLogin ? '<ZalogujResult>sid-fixture</ZalogujResult>' : '<DaneSzukajPodmiotyResult></DaneSzukajPodmiotyResult>';
    return new Response(xml, { status: 200 });
  },
});
const VALID_NIP = '5260250995';

role = null; gusFetches = 0;
assert.equal((await gusHandler(post({}, { nip: VALID_NIP }))).status, 401, 'GUS bez sesji: 401');

role = 'Oczekujący'; gusFetches = 0; rpcCalls.length = 0;
const pending = await gusHandler(post({ Authorization: 'Bearer fixture' }, { nip: VALID_NIP }));
assert.equal(pending.status, 403, 'GUS: konto bez roli (Oczekujący) nie może używać klucza firmy');
assert.equal(gusFetches, 0, 'GUS: brak zapytania do GUS dla konta bez roli');
assert.ok(rpcCalls.includes('current_user_is_staff'), 'GUS sprawdza rolę w bazie (current_user_is_staff)');

for (const allowed of ['Pracownik', 'Administrator']) {
  role = allowed; gusFetches = 0;
  const response = await gusHandler(post({ Authorization: 'Bearer fixture' }, { nip: VALID_NIP }));
  assert.equal(response.status, 200, `GUS: ${allowed} nadal wyszukuje firmę po NIP`);
  assert.equal((await response.json()).found, false);
  assert.equal(gusFetches, 2, `GUS: ${allowed} — logowanie i wyszukiwanie w BIR`);
}

console.log('PASS WAWIS 14.12 — fuel dry tylko administrator (bez pobierania przed autoryzacją), cron cen rynkowych bez zmian, GUS tylko pracownik/administrator.');
