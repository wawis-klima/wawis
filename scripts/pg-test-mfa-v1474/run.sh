#!/usr/bin/env bash
# WAWIS 14.74 — lokalny test migracji MFA etap 2 na prawdziwym PostgreSQL (atrapa schematu auth/storage Supabase).
# Użycie: sudo -u postgres bash scripts/pg-test-mfa-v1474/run.sh   (tworzy i usuwa bazę wawis_mfa_test)
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
psql -q -X -v ON_ERROR_STOP=1 -f setup.sql >/dev/null
q() { psql -q -X -At -d wawis_mfa_test "$@"; }
expect() { local got; got="$( (q -f check.sql 2>&1 || true) | grep '|' | tr '\n' ' ')"; for pair in "$@"; do [[ " $got " == *" $pair "* ]] || { echo "NIE: brak $pair w: $got"; exit 1; }; done; }
q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261121200000_mfa_aal2_required_v1474.sql" >/dev/null 2>&1
q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261121200000_mfa_aal2_required_v1474.sql" >/dev/null 2>&1   # powtórne uruchomienie
expect "A_is_admin|false" "A_jobs|0" "A_own_push|0" "A_storage|0" "B_is_admin|true" "B_jobs|1" "B_own_push|1" "B_storage|1" \
  "B_nip|1234567890" "B_new_client|Klient" "C_is_staff|true" "C_jobs|1" "C_own_push|1" "E_unverified_admin_is_admin|true" "D_service_mfa_ok|true"
neg="$(q -f neg.sql 2>&1 | grep -c 'ERROR' || true)"; [[ "$neg" == "3" ]] || { echo "NIE: kontrole negatywne $neg/3"; exit 1; }
q -v ON_ERROR_STOP=1 -f "$ROOT/docs/mfa-etap2-rollback-v1474.sql" >/dev/null 2>&1
got="$( (q -f check.sql 2>&1 || true) | grep '|' | awk 'NR<=4' | tr '\n' ' ')"; [[ "$got" == *"A_is_admin|true"*"A_jobs|1"* ]] || { echo "NIE: wycofanie: $got"; exit 1; }
[[ "$(q -c "select count(*) from pg_policy where polname='mfa_aal2_required_v1474'")" == "0" ]] || { echo "NIE: polityki po wycofaniu"; exit 1; }
psql -q -X -c "drop database wawis_mfa_test" >/dev/null
echo "PASS WAWIS 14.74 — PostgreSQL: admin z kodem aal1 zablokowany (tabele, pliki, RPC), aal2 / pracownik / usługi bez zmian; migracja powtarzalna; wycofanie przywraca stan."
