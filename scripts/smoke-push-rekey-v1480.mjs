// WAWIS 14.80 — nowe klucze PUSH dla tego samego adresu (iPhone po ponownym logowaniu) nie blokują telefonu.
// Pełny test wykonywalny: scripts/pg-test-push-rekey-v1480/run.sh (PostgreSQL, RED na definicjach sprzed 14.80).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const sql = readFileSync('supabase/migrations/20261122130000_push_rekey_v1480.sql', 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const sync = code.slice(code.indexOf('function public.push_subscription_sync_atomic'), code.indexOf('function public.push_subscription_disable_atomic'));
const disable = code.slice(code.indexOf('function public.push_subscription_disable_atomic'));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

ok(/if v_row\.is_active and v_row\.user_id <> p_user_id then\s+raise exception 'push_credentials_mismatch'/.test(sync), 'sync: aktywny PUSH innego użytkownika chroniony');
ok(/set user_id=p_user_id, p256dh=p_p256dh, auth=p_auth, lifecycle_token=p_lifecycle_token,\s+ownership_generation=v_row\.ownership_generation\+1/.test(sync), 'sync: nowe klucze + nowa generacja');
ok(/'rekeyed'::text/.test(sync), 'sync: wynik rekeyed');
ok(sync.indexOf('push_subscription_lifecycle_tombstones') < sync.indexOf("'rekeyed'"), 'sync: tombstone sprawdzany przed przyjęciem kluczy');
ok(/if v_row\.user_id<>p_request_user_id then raise exception 'push_credentials_mismatch'/.test(disable), 'disable: PUSH innego użytkownika chroniony');
ok(/'disabled-rekeyed'::text/.test(disable), 'disable: ten sam użytkownik wyłącza');
ok((code.match(/pg_advisory_xact_lock\(hashtextextended\(p_endpoint, ?0\)\)/g) || []).length === 2, 'blokada adresu w obu funkcjach');
ok(!/grant |revoke /i.test(code), 'uprawnienia bez zmian (service_role)');
const manifest = JSON.parse(readFileSync('supabase/rebuild/manifest-v1089.json', 'utf8'));
ok(manifest.files.includes('supabase/migrations/20261122130000_push_rekey_v1480.sql'), 'migracja w manifeście odbudowy');
const rollback = readFileSync('docs/push-rekey-rollback-v1480.sql', 'utf8');
ok(!rollback.includes("'rekeyed'") && (rollback.match(/push_credentials_mismatch/g) || []).length === 2, 'wycofanie = definicje sprzed 14.80');
console.log(`smoke-push-rekey-v1480: OK (${checks} checks)`);
