#!/usr/bin/env bash
# WAWIS 14.80 — lokalny test funkcji PUSH (nowe klucze dla tego samego adresu) na PostgreSQL.
# Użycie: sudo -u postgres bash scripts/pg-test-push-rekey-v1480/run.sh
set -euo pipefail
cd "$(dirname "$0")"; ROOT="$(cd ../.. && pwd)"; DB=wawis_push_rekey_test
psql -q -X -c "drop database if exists $DB" -c "create database $DB" >/dev/null
q() { psql -q -X -At -d "$DB" "$@"; }
q -v ON_ERROR_STOP=1 -f setup.sql >/dev/null
# RED: definicje sprzed 14.80 — telefon z nowymi kluczami zablokowany
q -v ON_ERROR_STOP=1 -f "$ROOT/docs/push-rekey-rollback-v1480.sql" >/dev/null
q -c "select reason from public.push_subscription_sync_atomic('00000000-0000-0000-0000-00000000000a','https://x/r','K1','a1','T1')" >/dev/null
red="$(q -c "select reason from public.push_subscription_sync_atomic('00000000-0000-0000-0000-00000000000a','https://x/r','K2','a2','T2')" 2>&1 || true)"
[[ "$red" == *push_credentials_mismatch* ]] || { echo "NIE: brak RED na starych definicjach: $red"; exit 1; }
q -c "delete from public.push_subscriptions" >/dev/null
# GREEN: 14.80 (2× — powtarzalna)
q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261122130000_push_rekey_v1480.sql" >/dev/null
q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261122130000_push_rekey_v1480.sql" >/dev/null
got="$(q -v ON_ERROR_STOP=1 -f check.sql | tr '\n' ' ')"
for pair in "c1|created" "rekey_same|rekeyed|2" "keys_now|K2a2T2true" "refresh|refreshed" "disable_same|disabled-rekeyed" "after_disable|false" "claim_other_inactive|rekeyed|true"; do
  [[ " $got " == *" $pair "* ]] || { echo "NIE: brak $pair w: $got"; exit 1; }
done
neg="$(q -f neg.sql 2>&1)"
[[ "$(grep -c 'push_credentials_mismatch' <<<"$neg")" == "2" ]] || { echo "NIE: ochrona cudzego aktywnego PUSH: $neg"; exit 1; }
[[ "$(q -c "select p256dh||user_id from public.push_subscriptions where endpoint='https://web.push.apple.com/e1'")" == "K400000000-0000-0000-0000-00000000000b" ]] || { echo "NIE: cudzy wpis zmieniony"; exit 1; }
tomb="$(q -c "select public.push_subscription_sync_atomic('00000000-0000-0000-0000-00000000000a','https://web.push.apple.com/e1','K3','a3','T3')" 2>&1 || true)"
[[ "$tomb" == *push_lifecycle_disabled* || "$tomb" == *push_credentials_mismatch* ]] || { echo "NIE: tombstone/ochrona: $tomb"; exit 1; }
psql -q -X -c "drop database $DB" >/dev/null
echo "PASS WAWIS 14.80 — PostgreSQL: RED na starych definicjach; ten sam użytkownik z nowymi kluczami → rekeyed/disabled-rekeyed, wpis wyłączony → przejęcie; aktywny PUSH innego użytkownika nadal chroniony; powtarzalna."
