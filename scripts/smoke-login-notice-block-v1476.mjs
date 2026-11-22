// WAWIS 14.76 — powiadomienie o nowym logowaniu i blokada kont (Diagnostyka administratora).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const read = (path) => readFileSync(path, 'utf8');
let checks = 0;
const ok = (cond, message) => { assert.ok(cond, message); checks += 1; };

// ---------- Migracja ----------
const sql = read('supabase/migrations/20261122090000_login_notice_block_v1476.sql');
const code = sql.replace(/--[^\n]*/g, '');
ok(/banned_until is not null and u\.banned_until > now\(\)/.test(code), 'mfa_ok: zablokowane konto bez dostępu');
ok(/coalesce\(auth\.jwt\(\) ->> 'aal', ''\) = 'aal2'/.test(code), 'mfa_ok: zachowany warunek aal2 z 14.74');
ok(/insert into private\.login_session_notices_v1476[\s\S]*?notified_at, baseline\)[\s\S]*?now\(\), true/.test(code), 'stare sesje zapisane jako zgłoszone');
ok(/claim_login_notices_v1476[\s\S]*?auth\.role\(\), ''\) <> 'service_role'/.test(code), 'przyjęcie zadania tylko service_role');
ok(/grant execute on function public\.claim_login_notices_v1476\(uuid, text\) to service_role;/.test(code), 'claim: grant tylko service_role');
ok(/revoke all on function public\.claim_login_notices_v1476\(uuid, text\) from public, anon, authenticated;/.test(code), 'claim: brak dostępu z aplikacji');
ok(/admin_set_user_blocked_v1476[\s\S]*?current_user_is_admin\(\)/.test(code), 'blokada: tylko administrator (z kodem, gdy go ma)');
ok(/p_user_id = auth\.uid\(\)[\s\S]*?Nie można zablokować własnego konta/.test(code), 'blokada: nie własnego konta');
ok(/delete from auth\.sessions where user_id = p_user_id/.test(code), 'blokada: koniec wszystkich sesji');
ok(/now\(\) \+ interval '100 years'/.test(code), 'blokada: banned_until jak ban w Supabase (bez infinity)');
ok(!/delete from (public\.|auth\.users)/i.test(code), 'bez usuwania kont i danych');
ok(/admin_list_user_logins_v1476[\s\S]*?current_user_is_admin\(\)/.test(code), 'lista logowań: tylko administrator');
ok(/revoke all on function public\.admin_list_user_logins_v1476\(\) from public, anon;/.test(code), 'lista: bez anon');
ok(/cron\.schedule\('wawis-login-notify-v1476', '\* \* \* \* \*'/.test(code), 'zadanie co minutę');
ok(/functions\/v1\/notify-new-login/.test(code), 'zadanie wywołuje notify-new-login');
ok(/created_at > now\(\) - interval '2 minutes'/.test(code), 'najwyżej jedno wywołanie na 2 min');
const manifest = JSON.parse(read('supabase/rebuild/manifest-v1089.json'));
ok(manifest.files.includes('supabase/migrations/20261122090000_login_notice_block_v1476.sql'), 'migracja w manifeście odbudowy');
const rollback = read('docs/login-notice-block-rollback-v1476.sql');
ok(/cron\.unschedule/.test(rollback) && !/banned_until/.test(rollback.replace(/--[^\n]*/g, '')), 'wycofanie: wyłącza zadanie, nie odblokowuje kont w ciemno');

// ---------- Funkcja Edge ----------
const edge = read('supabase/functions/notify-new-login/index.ts');
ok(/claim_login_notices_v1476/.test(edge) && /finish_login_notify_run_v1476/.test(edge), 'funkcja przyjmuje zadanie przez bazę');
ok(/push_claim_delivery_v1268/.test(edge) && /login_notice:\$\{notice\.sessionId\}/.test(edge), 'jedno powiadomienie na logowanie i subskrypcję');
ok(/recipientUserId/.test(edge) && /subscriptionGeneration/.test(edge), 'payload zgodny z push-safety');
ok(/\.in\("role", \["Administrator", "admin"\]\)/.test(edge), 'tylko administratorzy dostają powiadomienie');
const noticeSrc = stripTypeScriptTypes(read('supabase/functions/notify-new-login/notice.ts'), { mode: 'transform' })
  .replace(/^export /gm, '');
const ctx = { Intl, Date, String, Number, JSON, RegExp, Object };
vm.createContext(ctx);
vm.runInContext(`${noticeSrc}\nglobalThis.__n = { describeDevice, buildLoginNoticePush, parseLoginNoticeRun };`, ctx);
const n = ctx.__n;
assert.equal(n.describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1'), 'iPhone, Safari');
assert.equal(n.describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'), 'komputer z Windows, Chrome');
assert.equal(n.describeDevice('curl/8.4.0'), 'komputer, program (nie przeglądarka)');
assert.equal(n.describeDevice(''), 'nieznane urządzenie');
checks += 4;
const push = n.buildLoginNoticePush({ sessionId: 's1', userId: 'u1', fullName: 'Kacper Wydmański', userAgent: 'iPhone Safari/604.1', createdAt: '2026-11-22T06:45:00Z' });
ok(push.title === 'Nowe logowanie' && /^Kacper Wydmański — iPhone, Safari, 22\.11, 07:45\. /.test(push.body) && push.tag === 'login-notice-s1', `treść PUSH: ${push.body}`);
ok(n.parseLoginNoticeRun({ eventType: 'login_notice_v1476', runId: '00000000-0000-4000-8000-000000000001', token: 'a'.repeat(64) }) !== null, 'zadanie poprawne');
ok(n.parseLoginNoticeRun({ eventType: 'login_notice_v1476', runId: 'x', token: 'a'.repeat(64) }) === null, 'zadanie bez UUID odrzucone');
ok(n.parseLoginNoticeRun({ eventType: 'other', runId: '00000000-0000-4000-8000-000000000001', token: 'a'.repeat(64) }) === null, 'inne zdarzenie odrzucone');

// ---------- Aplikacja ----------
const access = await import('../src/modules/user-access.js');
ok(access.describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.1 Safari/605.1.15') === 'Mac, Safari', 'opis urządzenia w aplikacji');
ok(access.isUserBannedError({ message: 'User is banned' }) && access.isUserBannedError({ code: 'user_banned' }) && !access.isUserBannedError({ message: 'Invalid login credentials' }), 'rozpoznanie blokady');
for (const path of ['src/modules/supabase-errors.js', 'src/mobile791/modules/supabase-errors.js']) {
  const mod = await import(`../${path}`);
  ok(mod.getSupabaseUserMessage({ message: 'User is banned', code: 'user_banned' }, 'x') === access.USER_BLOCKED_MESSAGE, `${path}: komunikat blokady przy logowaniu`);
  ok(mod.getSupabaseUserMessage({ message: 'Invalid login credentials' }, 'x') === 'Invalid login credentials', `${path}: inne błędy bez zmian`);
}
let rpcCalls = [];
const fake = (result) => ({ rpc: async (name, args) => { rpcCalls.push([name, args]); return result; } });
const listed = await access.listUserLogins(fake({ data: [{ userId: 'u1', fullName: 'A', role: 'Pracownik', blocked: false, sessions: [{ createdAt: '2026-11-22T06:45:00Z', userAgent: 'iPhone Safari/1' }] }], error: null }));
ok(listed.length === 1 && listed[0].sessions[0].device === 'iPhone, Safari', 'lista logowań');
rpcCalls = [];
const blocked = await access.setUserBlocked(fake({ data: { userId: 'u1', blocked: true, sessionsEnded: 2 }, error: null }), 'u1', true);
ok(blocked.sessionsEnded === 2 && rpcCalls[0][0] === 'admin_set_user_blocked_v1476' && rpcCalls[0][1].p_blocked === true, 'blokada przez RPC');
await assert.rejects(access.setUserBlocked(fake({ data: { blocked: false }, error: null }), 'u1', true), /nie potwierdziła/);
await assert.rejects(access.setUserBlocked(fake({ data: null, error: { message: 'Nie można zablokować własnego konta.' } }), 'u1', true), /własnego konta/);
checks += 2;
for (const [path, rel] of [['src/components/diagnostics/DiagnosticsPanel.jsx', '../auth/UserAccessCard.jsx'], ['src/mobile791/components/diagnostics/MobileDiagnosticsPanel.jsx', '../../../components/auth/UserAccessCard.jsx']]) {
  const src = read(path);
  ok(src.includes(`import UserAccessCard from '${rel}';`) && /profile\?\.role === 'Administrator' \? <UserAccessCard/.test(src), `${path}: karta tylko dla administratora`);
}
const card = read('src/components/auth/UserAccessCard.jsx');
ok(/window\.confirm/.test(card) && /Wyloguj i zablokuj/.test(card) && /Odblokuj/.test(card), 'karta: potwierdzenie, blokada, odblokowanie');
ok(/user\.isSelf \? null/.test(card), 'karta: bez przycisku dla własnego konta');
for (const path of ['src/lib/mockSupabaseClient.js', 'src/mobile791/lib/mockSupabaseClient.js']) {
  ok(read(path).includes("name === 'admin_set_user_blocked_v1476'"), `${path}: atrapa RPC (tylko tryb testowy)`);
}

console.log(`smoke-login-notice-block-v1476: OK (${checks} checks)`);
