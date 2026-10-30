#!/usr/bin/env bash
# WAWIS 13.99: wykonanie PRAWDZIWYCH migracji modułu serwisowego + test zachowania na jednorazowym PostgreSQL 16.
# CI: kontener Docker (jak codex-postgres-two-sessions-v1269.sh). Lokalnie: WAWIS_SERVICE_PG_SOCKET=<katalog gniazda>.
# Nigdy nie wskazywać produkcji ani bazy z danymi klientów (scaffold przerywa, jeśli istnieje schemat storage).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="wawis_service_v1399"

if [[ -n "${WAWIS_SERVICE_PG_SOCKET:-}" ]]; then
  PORT="${WAWIS_SERVICE_PG_PORT:-5432}"
  admin() { psql -X -q -v ON_ERROR_STOP=1 -At -h "$WAWIS_SERVICE_PG_SOCKET" -p "$PORT" -U postgres -d postgres "$@"; }
  pg() { psql -X -q -v ON_ERROR_STOP=1 -At -h "$WAWIS_SERVICE_PG_SOCKET" -p "$PORT" -U postgres -d "$DB" "$@"; }
elif [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  command -v docker >/dev/null || { echo "NO-GO: Docker required" >&2; exit 13; }
  image="public.ecr.aws/docker/library/postgres:16"
  docker pull -q "$image" >/dev/null || { image="mirror.gcr.io/library/postgres:16"; docker pull -q "$image" >/dev/null; } \
    || { echo "NO-GO: PostgreSQL 16 cannot be pulled" >&2; exit 16; }
  container="$(docker run --rm -d --env POSTGRES_USER=postgres --env POSTGRES_PASSWORD="$(openssl rand -hex 18)" "$image")"
  trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
  for _ in $(seq 1 40); do
    docker exec "$container" psql -X -qAt -U postgres -d postgres -c 'select 1' 2>/dev/null | grep -qx 1 && break
    sleep 1
  done
  admin() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -At -U postgres -d postgres "$@"; }
  pg() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -At -U postgres -d "$DB" "$@"; }
else
  echo "NO-GO: run in GitHub Actions or set WAWIS_SERVICE_PG_SOCKET to a disposable local cluster" >&2
  exit 12
fi

admin -c "drop database if exists $DB" -c "create database $DB" >/dev/null
pg < "$ROOT/scripts/sql/service-visit-scaffold-v1399.sql"
count=0
for file in $(ls "$ROOT"/supabase/migrations/*service_visit*.sql | sort); do
  # pg_net istnieje tylko w Supabase; net.http_post jest podstawione w scaffold. Reszta pliku bez zmian.
  sed 's/^create extension if not exists pg_net with schema extensions;$/-- pg_net: stub w scaffold/' "$file" | pg >/dev/null
  count=$((count + 1))
done
[[ "$count" -ge 9 ]] || { echo "NO-GO: oczekiwano co najmniej 9 migracji serwisu, wykonano $count" >&2; exit 17; }
pg < "$ROOT/scripts/sql/service-visit-test-v1399.sql"
echo "WAWIS 13.99 service SQL (migracje: $count) — trash guard, photo delete, regresja wykonania: PASS"
