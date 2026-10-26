#!/usr/bin/env bash
# WAWIS backup — zrzut bazy (tylko odczyt produkcji), szyfrowanie, wysyłka do R2, kontrola zapisu.
#
# Wymagane zmienne:
#   BACKUP_DB_URL                 połączenie Postgres (użytkownik tylko do odczytu, sesyjny pooler Supabase)
#   BACKUP_ENCRYPTION_PASSPHRASE  hasło szyfrowania (to samo przechowuje właściciel w menedżerze haseł)
#   BACKUP_DEST                   zdalny katalog rclone, np. "r2:wawis-backup"
# Opcjonalne:
#   BACKUP_RUN_ID                 znacznik przebiegu (domyślnie UTC YYYYMMDDTHHMMSSZ)
#   BACKUP_DUMP_SCHEMAS           schematy do zrzutu
#   WORK_DIR                      katalog roboczy (domyślnie ./backup-work)
#
# Skrypt nigdy nie zapisuje do bazy źródłowej: używa wyłącznie psql (SELECT w transakcji tylko do odczytu)
# i pg_dump (który sam działa w transakcji READ ONLY). Docelowo konto bazy ma tylko prawo odczytu.
set -euo pipefail

: "${BACKUP_DB_URL:?Brak BACKUP_DB_URL}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?Brak BACKUP_ENCRYPTION_PASSPHRASE}"
: "${BACKUP_DEST:?Brak BACKUP_DEST}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_ID="${BACKUP_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
WORK_DIR="${WORK_DIR:-./backup-work}"
SCHEMAS="${BACKUP_DUMP_SCHEMAS:-public private auth storage supabase_migrations}"
YEAR="${RUN_ID:0:4}"
MONTH="${RUN_ID:4:2}"
DAY="${RUN_ID:6:2}"
DAILY_PREFIX="db/daily/${YEAR}/${MONTH}/${RUN_ID}"

mkdir -p "$WORK_DIR"
DUMP="$WORK_DIR/wawis-db.dump"
SCHEMA_SQL="$WORK_DIR/wawis-schema.sql"
MANIFEST="$WORK_DIR/db-manifest.json"

log() { printf '[backup-db] %s\n' "$*"; }

encrypt() {
  # AES-256, hasło przez deskryptor (nie trafia do listy procesów ani logów).
  gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 \
    --passphrase-fd 3 --output "$2" "$1" 3<<<"$BACKUP_ENCRYPTION_PASSPHRASE"
}

count_tables() {
  psql "$BACKUP_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --command "set default_transaction_read_only = on;" --file "$SCRIPT_DIR/table-counts.sql" | tail -n 1
}

log "Przebieg $RUN_ID — liczby wierszy przed zrzutem"
COUNTS_BEFORE="$(count_tables)"
SERVER_VERSION="$(psql "$BACKUP_DB_URL" --no-psqlrc -tA -c 'show server_version')"

schema_args=()
for schema in $SCHEMAS; do schema_args+=(--schema "$schema"); done

log "pg_dump (format custom) schematów: $SCHEMAS"
pg_dump "$BACKUP_DB_URL" --format=custom --compress=9 --no-password "${schema_args[@]}" --file "$DUMP"

log "Schemat (tylko struktura) public + private"
pg_dump "$BACKUP_DB_URL" --schema-only --no-password --schema public --schema private --file "$SCHEMA_SQL"

log "Liczby wierszy po zrzucie"
COUNTS_AFTER="$(count_tables)"

# Zrzut musi dać się odczytać, zanim go zaszyfrujemy i wyślemy.
pg_restore --list "$DUMP" > "$WORK_DIR/dump-toc.txt"
TOC_ENTRIES="$(grep -cv '^;' "$WORK_DIR/dump-toc.txt" || true)"
[ "${TOC_ENTRIES:-0}" -gt 0 ] || { echo "::error::Pusty spis zrzutu — kopia przerwana"; exit 1; }

encrypt "$DUMP" "$DUMP.gpg"
encrypt "$SCHEMA_SQL" "$SCHEMA_SQL.gpg"

sha() { sha256sum "$1" | cut -d' ' -f1; }
node -e '
const [manifest, runId, serverVersion, before, after, dumpSha, dumpEncSha, dumpSize, schemaEncSha, toc, prefix] = process.argv.slice(1);
const fs = require("node:fs");
fs.writeFileSync(manifest, JSON.stringify({
  kind: "wawis-db-backup",
  run_id: runId,
  created_at: new Date().toISOString(),
  server_version: serverVersion,
  prefix,
  files: {
    dump: { name: "wawis-db.dump.gpg", plaintext_sha256: dumpSha, encrypted_sha256: dumpEncSha, plaintext_bytes: Number(dumpSize), toc_entries: Number(toc) },
    schema: { name: "wawis-schema.sql.gpg", encrypted_sha256: schemaEncSha },
  },
  counts_before: JSON.parse(before),
  counts_after: JSON.parse(after),
}, null, 2));
' "$MANIFEST" "$RUN_ID" "$SERVER_VERSION" "$COUNTS_BEFORE" "$COUNTS_AFTER" \
  "$(sha "$DUMP")" "$(sha "$DUMP.gpg")" "$(stat -c %s "$DUMP")" "$(sha "$SCHEMA_SQL.gpg")" "$TOC_ENTRIES" "$DAILY_PREFIX"

log "Wysyłka do $BACKUP_DEST/$DAILY_PREFIX"
rclone copyto "$DUMP.gpg" "$BACKUP_DEST/$DAILY_PREFIX/wawis-db.dump.gpg" --s3-no-check-bucket
rclone copyto "$SCHEMA_SQL.gpg" "$BACKUP_DEST/$DAILY_PREFIX/wawis-schema.sql.gpg" --s3-no-check-bucket
rclone copyto "$MANIFEST" "$BACKUP_DEST/$DAILY_PREFIX/manifest.json" --s3-no-check-bucket

log "Kontrola zapisu: ponowne pobranie i porównanie sumy SHA-256"
rclone copyto "$BACKUP_DEST/$DAILY_PREFIX/wawis-db.dump.gpg" "$WORK_DIR/roundtrip.dump.gpg"
if [ "$(sha "$WORK_DIR/roundtrip.dump.gpg")" != "$(sha "$DUMP.gpg")" ]; then
  echo "::error::Kopia w R2 różni się od wysłanego pliku (SHA-256)"
  exit 1
fi

# Kopia miesięczna (1. dzień miesiąca) — przechowywana dłużej regułą cyklu życia R2.
if [ "$DAY" = "01" ]; then
  log "Kopia miesięczna db/monthly/${YEAR}-${MONTH}"
  rclone copy "$BACKUP_DEST/$DAILY_PREFIX" "$BACKUP_DEST/db/monthly/${YEAR}-${MONTH}" --s3-no-check-bucket
fi

# Wskaźnik ostatniej kopii (do odtwarzania i kontroli).
printf '%s\n' "$DAILY_PREFIX" > "$WORK_DIR/LATEST"
rclone copyto "$WORK_DIR/LATEST" "$BACKUP_DEST/db/LATEST" --s3-no-check-bucket

log "OK — $DAILY_PREFIX ($(stat -c %s "$DUMP.gpg") B zaszyfrowane, $TOC_ENTRIES obiektów w spisie)"
