#!/usr/bin/env bash
# WAWIS backup — rzeczywista próba odtworzenia ostatniej kopii bazy w izolowanym kontenerze.
# Nigdy nie łączy się z produkcją: pobiera zaszyfrowaną kopię z R2, sprawdza sumy, odszyfrowuje,
# odtwarza w świeżym kontenerze Postgres na maszynie CI i porównuje liczby wierszy z manifestem.
#
# Wymagane zmienne:
#   BACKUP_DEST                   zdalny katalog rclone z kopiami (np. "r2:wawis-backup")
#   BACKUP_ENCRYPTION_PASSPHRASE  hasło szyfrowania
# Opcjonalne:
#   RESTORE_PREFIX     konkretna kopia (domyślnie wskazana w db/LATEST)
#   RESTORE_MODE       "supabase" (obraz supabase/postgres, schematy auth/storage z kopii) lub "plain"
#   RESTORE_IMAGE      obraz kontenera
#   RESTORE_DB_USER    użytkownik w kontenerze
#   WORK_DIR           katalog roboczy
set -euo pipefail

: "${BACKUP_DEST:?Brak BACKUP_DEST}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?Brak BACKUP_ENCRYPTION_PASSPHRASE}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${WORK_DIR:-./backup-work}/restore"
MODE="${RESTORE_MODE:-supabase}"
if [ "$MODE" = "supabase" ]; then
  IMAGE="${RESTORE_IMAGE:-supabase/postgres:17.6.1.084}"
  DB_USER="${RESTORE_DB_USER:-supabase_admin}"
else
  IMAGE="${RESTORE_IMAGE:-postgres:17}"
  DB_USER="${RESTORE_DB_USER:-postgres}"
fi
CONTAINER="wawis-restore-$$"
PORT="${RESTORE_PORT:-54329}"
KNOWN_ERRORS="$SCRIPT_DIR/restore-known-errors.txt"
mkdir -p "$WORK_DIR"

log() { printf '[restore-verify] %s\n' "$*"; }
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
sha() { sha256sum "$1" | cut -d' ' -f1; }

PREFIX="${RESTORE_PREFIX:-$(rclone cat "$BACKUP_DEST/db/LATEST" | tr -d '[:space:]')}"
[ -n "$PREFIX" ] || { echo "::error::Brak wskazania ostatniej kopii (db/LATEST)"; exit 1; }
log "Kopia: $PREFIX (tryb $MODE, obraz $IMAGE)"

rclone copyto "$BACKUP_DEST/$PREFIX/manifest.json" "$WORK_DIR/manifest.json"
rclone copyto "$BACKUP_DEST/$PREFIX/wawis-db.dump.gpg" "$WORK_DIR/wawis-db.dump.gpg"

expected_enc="$(node -p 'require(process.argv[1]).files.dump.encrypted_sha256' "$WORK_DIR/manifest.json")"
expected_plain="$(node -p 'require(process.argv[1]).files.dump.plaintext_sha256' "$WORK_DIR/manifest.json")"
[ "$(sha "$WORK_DIR/wawis-db.dump.gpg")" = "$expected_enc" ] || { echo "::error::Suma zaszyfrowanej kopii niezgodna z manifestem"; exit 1; }

gpg --batch --yes --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 \
  --output "$WORK_DIR/wawis-db.dump" "$WORK_DIR/wawis-db.dump.gpg" 3<<<"$BACKUP_ENCRYPTION_PASSPHRASE"
[ "$(sha "$WORK_DIR/wawis-db.dump")" = "$expected_plain" ] || { echo "::error::Suma odszyfrowanej kopii niezgodna z manifestem"; exit 1; }
log "Sumy SHA-256 zgodne (zaszyfrowana i odszyfrowana kopia)"

if [ -n "${RESTORE_TARGET_URL:-}" ]; then
  # Gotowa, pusta baza testowa (np. lokalny test skryptu). Nigdy adres produkcji.
  case "$RESTORE_TARGET_URL" in *supabase.co*|*supabase.com*|*pooler*) echo "::error::RESTORE_TARGET_URL wskazuje Supabase — odtwarzanie dozwolone tylko lokalnie"; exit 1;; esac
  RESTORE_URL="$RESTORE_TARGET_URL"
else
  log "Start izolowanego kontenera $IMAGE"
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=restore-only -p "127.0.0.1:${PORT}:5432" "$IMAGE" >/dev/null
  export PGPASSWORD=restore-only
  for _ in $(seq 1 90); do
    if pg_isready -h 127.0.0.1 -p "$PORT" -U "$DB_USER" >/dev/null 2>&1 \
       && psql -h 127.0.0.1 -p "$PORT" -U "$DB_USER" -d postgres -tAc 'select 1' >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  RESTORE_URL="postgresql://${DB_USER}@127.0.0.1:${PORT}/postgres"
fi
psql "$RESTORE_URL" -tAc 'select 1' >/dev/null

# Świeża baza testowa ma własne (puste lub inne) wersje tych schematów — zastępujemy je stanem z kopii.
# Dotyczy wyłącznie izolowanego kontenera / lokalnej bazy testowej (sprawdzone wyżej).
psql "$RESTORE_URL" --set ON_ERROR_STOP=1 -q -c "
  set client_min_messages = warning;
  drop schema if exists auth cascade;
  drop schema if exists storage cascade;
  drop schema if exists supabase_migrations cascade;
  drop schema if exists private cascade;
  drop schema if exists public cascade;"

log "pg_restore"
set +e
pg_restore --dbname "$RESTORE_URL" --no-owner --no-privileges "$WORK_DIR/wawis-db.dump" 2> "$WORK_DIR/restore.log"
set -e
grep -E '^pg_restore: (error|błąd)' "$WORK_DIR/restore.log" > "$WORK_DIR/restore-errors.txt" || true
if [ -f "$KNOWN_ERRORS" ]; then
  grep -vEf <(grep -vE '^\s*(#|$)' "$KNOWN_ERRORS" || echo '^$^') "$WORK_DIR/restore-errors.txt" > "$WORK_DIR/restore-unexpected.txt" || true
else
  cp "$WORK_DIR/restore-errors.txt" "$WORK_DIR/restore-unexpected.txt"
fi

log "Porównanie liczby wierszy z manifestem"
psql "$RESTORE_URL" --no-psqlrc --set ON_ERROR_STOP=1 -tA -f "$SCRIPT_DIR/table-counts.sql" | tail -n 1 > "$WORK_DIR/restored-counts.json"
node -e '
const fs = require("node:fs");
const [manifestPath, restoredPath, unexpectedPath, reportPath] = process.argv.slice(1);
const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const restored = JSON.parse(fs.readFileSync(restoredPath, "utf8") || "{}");
const unexpected = fs.readFileSync(unexpectedPath, "utf8").split("\n").filter(Boolean);
const problems = [];
for (const [table, after] of Object.entries(m.counts_after)) {
  const before = m.counts_before[table] ?? after;
  const lo = Math.min(before, after), hi = Math.max(before, after);
  const got = restored[table];
  if (got === undefined) problems.push(`${table}: brak tabeli po odtworzeniu`);
  else if (got < lo || got > hi) problems.push(`${table}: odtworzono ${got}, oczekiwano ${lo === hi ? lo : lo + "–" + hi}`);
}
const report = {
  prefix: m.prefix, run_id: m.run_id, tables_checked: Object.keys(m.counts_after).length,
  rows_restored: Object.values(restored).reduce((a, b) => a + Number(b || 0), 0),
  count_problems: problems, unexpected_restore_errors: unexpected.slice(0, 50), unexpected_restore_error_count: unexpected.length,
  status: problems.length || unexpected.length ? "FAILED" : "OK",
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
for (const p of problems) console.log(`::error::Odtworzenie: ${p}`);
for (const e of unexpected.slice(0, 10)) console.log(`::error::pg_restore: ${e.replace(/%/g, "%25").slice(0, 300)}`);
process.exit(report.status === "OK" ? 0 : 1);
' "$WORK_DIR/manifest.json" "$WORK_DIR/restored-counts.json" "$WORK_DIR/restore-unexpected.txt" "$WORK_DIR/restore-report.json"

# Nie zostawiamy odszyfrowanych danych klientów na dysku maszyny CI.
rm -f "$WORK_DIR/wawis-db.dump"
log "OK — kopia $PREFIX odtwarza się poprawnie"
