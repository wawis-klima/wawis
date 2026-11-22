#!/usr/bin/env bash
# WAWIS 14.76 — lokalny test migracji (powiadomienie o logowaniu + blokada) na prawdziwym PostgreSQL.
# Użycie: sudo -u postgres bash scripts/pg-test-login-block-v1476/run.sh   (tworzy i usuwa bazę wawis_mfa_test)
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
psql -q -X -v ON_ERROR_STOP=1 -f "$ROOT/scripts/pg-test-mfa-v1474/setup.sql" >/dev/null
q() { psql -q -X -At -d wawis_mfa_test "$@"; }
q -v ON_ERROR_STOP=1 -f setup-extra.sql >/dev/null
q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261121200000_mfa_aal2_required_v1474.sql" >/dev/null 2>&1
# pg_net istnieje tylko w Supabase — w atrapie net.http_post zapisuje wywołania do net.calls.
MIG="$(mktemp)"; sed '/create extension if not exists pg_net/d' "$ROOT/supabase/migrations/20261122090000_login_notice_block_v1476.sql" > "$MIG"
q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null
q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null   # powtórne uruchomienie
rm -f "$MIG"
got="$(q -v ON_ERROR_STOP=1 -f check.sql | grep '|' | grep -v '^{' | tr '\n' ' ')"
for pair in "baseline|1" "cron|1" "run_idle|0" "run_new|1" "run_again|0" "net_calls|1" "claim_bad|null" "claim_ok|1" "claim_who|Kacper_Pracownik" "claim_replay|true" \
  "pending_after|0" "list_users|3" "list_worker_sessions|2" "block|2" "list_blocked|true" "banned|true" "worker_sessions|0" "block_log|1" \
  "W_blocked_mfa_ok|false" "W_blocked_jobs|0" "W_blocked_staff|false" "unblock|false" "W_after_jobs|1" "unbanned|true"; do
  [[ " $got " == *" $pair "* ]] || { echo "NIE: brak $pair w: $got"; exit 1; }
done
neg="$(q -f neg.sql 2>&1 | grep -c 'ERROR' || true)"; [[ "$neg" == "4" ]] || { echo "NIE: kontrole negatywne $neg/4"; q -f neg.sql 2>&1 | grep ERROR; exit 1; }
q -v ON_ERROR_STOP=1 -f "$ROOT/docs/login-notice-block-rollback-v1476.sql" >/dev/null
[[ "$(q -c "select count(*) from cron.job where jobname='wawis-login-notify-v1476'")" == "0" ]] || { echo "NIE: zadanie po wycofaniu"; exit 1; }
[[ "$(q -c "select count(*) from pg_proc where proname like '%_v1476'")" == "0" ]] || { echo "NIE: funkcje po wycofaniu"; exit 1; }
[[ "$(q -c "select pg_get_functiondef('public.current_user_mfa_ok'::regproc) like '%banned_until%'")" == "f" ]] || { echo "NIE: mfa_ok po wycofaniu"; exit 1; }
psql -q -X -c "drop database wawis_mfa_test" >/dev/null
echo "PASS WAWIS 14.76 — PostgreSQL: nowe logowanie zgłaszane raz (stare sesje nie), kod zadania jednorazowy; blokada kończy sesje i odcina dane od razu, odblokowanie przywraca; bez własnego konta, bez sesji aal1 administratora, pracownik bez dostępu; migracja powtarzalna; wycofanie."
