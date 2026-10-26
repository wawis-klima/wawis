#!/usr/bin/env bash
# WAWIS backup — przyrostowa kopia plików (zdjęcia, protokoły, podpisy) do zaszyfrowanego R2.
#
#   rclone copy  — wysyła tylko nowe pliki; NIGDY nie usuwa w kopii (usunięte w Supabase zostają w kopii).
#   --immutable  — istniejący w kopii plik nie może zostać nadpisany innym; zmiana = błąd (alarm integralności).
#   cryptcheck   — każdy plik źródłowy porównany z kopią po sumie kontrolnej (w razie braku sumy po stronie
#                  źródła: kontrola rozmiaru, oznaczona w raporcie).
#
# Wymagane zmienne:
#   BACKUP_SOURCE       zdalne źródło rclone (Supabase Storage S3), np. "sb:"
#   BACKUP_FILES_DEST   zaszyfrowany cel rclone (crypt na R2), np. "r2crypt:"
# Opcjonalne:
#   BACKUP_BUCKETS      lista bucketów (domyślnie: zdjęcia, protokoły, podpisy, liczniki paliwa)
#   WORK_DIR            katalog roboczy
set -euo pipefail

: "${BACKUP_SOURCE:?Brak BACKUP_SOURCE}"
: "${BACKUP_FILES_DEST:?Brak BACKUP_FILES_DEST}"
BUCKETS="${BACKUP_BUCKETS:-job-photos job-protocols job-protocol-signatures fuel-odometer-photos}"
WORK_DIR="${WORK_DIR:-./backup-work}"
mkdir -p "$WORK_DIR"
REPORT="$WORK_DIR/storage-report.jsonl"
: > "$REPORT"

log() { printf '[backup-storage] %s\n' "$*"; }
failures=0

for bucket in $BUCKETS; do
  src="${BACKUP_SOURCE}${bucket}"
  dst="${BACKUP_FILES_DEST}${bucket}"
  log "Bucket $bucket: kopia przyrostowa"
  copy_log="$WORK_DIR/copy-$bucket.log"
  if ! rclone copy "$src" "$dst" --immutable --transfers 8 --checkers 16 --retries 5 \
      --low-level-retries 10 --stats-one-line --stats 30s --log-file "$copy_log" --log-level NOTICE; then
    echo "::error::Kopia bucketu $bucket nieudana (szczegóły w artefakcie copy-$bucket.log)"
    failures=$((failures + 1))
    continue
  fi

  log "Bucket $bucket: weryfikacja zawartości"
  verification="hash"
  check_log="$WORK_DIR/check-$bucket.log"
  if ! rclone cryptcheck "$src" "$dst" --one-way --log-file "$check_log" --log-level NOTICE; then
    if grep -qiE "differ|not found|missing|error reading" "$check_log" \
        && ! grep -qiE "hash.*(unsupported|not supported|no hashes|unknown)" "$check_log"; then
      echo "::error::Weryfikacja bucketu $bucket: pliki w kopii różnią się od źródła lub ich brakuje"
      failures=$((failures + 1))
      verification="failed"
    else
      verification="size"
      if ! rclone check "$src" "$dst" --one-way --size-only --log-file "$check_log" --log-level NOTICE; then
        echo "::error::Weryfikacja rozmiarów bucketu $bucket nieudana"
        failures=$((failures + 1))
        verification="failed"
      fi
    fi
  fi

  src_json="$(rclone size "$src" --json)"
  dst_json="$(rclone size "$dst" --json)"
  zero="$(rclone lsjson "$src" --recursive --files-only | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d||"[]").filter(f=>Number(f.Size)===0).length))')"
  node -e '
const [bucket, src, dst, zero, verification] = process.argv.slice(1);
const s = JSON.parse(src), d = JSON.parse(dst);
console.log(JSON.stringify({ bucket, source_files: s.count, source_bytes: s.bytes, backup_files: d.count, backup_bytes: d.bytes, source_zero_byte_files: Number(zero), verification }));
' "$bucket" "$src_json" "$dst_json" "$zero" "$verification" >> "$REPORT"
  if [ "$zero" != "0" ]; then
    echo "::warning::Bucket $bucket zawiera $zero plików 0 B w źródle (znane uszkodzone zdjęcia historyczne — patrz audyt P1-5)"
  fi
done

cat "$REPORT"
if [ "$failures" -gt 0 ]; then
  echo "::error::Kopia plików: $failures błędów"
  exit 1
fi
log "OK"
