#!/usr/bin/env bash
# WAWIS 14.24: naklejka QR przy zakończeniu montażu — PRAWDZIWE migracje (14.08 naklejki, 10.88 tabliczki, 14.24)
# na jednorazowym PostgreSQL 16. CI: kontener Docker. Lokalnie: WAWIS_SERVICE_PG_SOCKET=<katalog gniazda>.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="wawis_job_qr_v1424"
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
pg < "$ROOT/supabase/migrations/20261102160000_qr_stickers_v1408.sql" >/dev/null
pg < "$ROOT/scripts/sql/job-completion-qr-scaffold-v1424.sql"
# Funkcje tabliczek z 10.88 (bez wyzwalaczy zdjęć — nie są przedmiotem testu); wyzwalacz zakończenia jak w produkcji.
awk 'NR>=4 && /^create or replace function private.guard_job_completion_nameplates/{exit} NR>=4{print}' \
  "$ROOT/supabase/migrations/20260916201000_job_completion_nameplate_guard_v1088.sql" | pg >/dev/null
pg < "$ROOT/supabase/migrations/20261106120000_job_completion_qr_sticker_v1424.sql" >/dev/null
pg < "$ROOT/supabase/migrations/20261106120000_job_completion_qr_sticker_v1424.sql" >/dev/null
pg -c "create trigger trg_jobs_nameplate_completion_guard before insert or update on public.jobs for each row execute function private.guard_job_completion_nameplates();" >/dev/null
pg < "$ROOT/scripts/sql/job-completion-qr-test-v1424.sql"
