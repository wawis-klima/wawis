#!/usr/bin/env bash
# WAWIS 14.28: dane prób szczelności — PRAWDZIWA migracja 14.28 (scaffold 14.08)
# na jednorazowym PostgreSQL 16. CI: kontener Docker. Lokalnie: WAWIS_SERVICE_PG_SOCKET=<katalog gniazda>.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="wawis_leak_v1428"
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
pg < "$ROOT/scripts/sql/qr-stickers-scaffold-v1408.sql"
pg < "$ROOT/scripts/sql/leak-tests-scaffold-v1428.sql"
pg < "$ROOT/supabase/migrations/20261106130000_leak_tests_v1428.sql" >/dev/null
pg < "$ROOT/supabase/migrations/20261106130000_leak_tests_v1428.sql" >/dev/null
pg < "$ROOT/scripts/sql/leak-tests-test-v1428.sql"
