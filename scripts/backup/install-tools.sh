#!/usr/bin/env bash
# Instalacja narzędzi kopii na maszynie GitHub Actions (ubuntu-24.04): klient PostgreSQL 17 i rclone.
set -euo pipefail
RCLONE_VERSION="${RCLONE_VERSION:-v1.68.2}"

if ! pg_dump --version 2>/dev/null | grep -q ' 17\.'; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq postgresql-common >/dev/null
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
  sudo apt-get install -y -qq postgresql-client-17 >/dev/null
  sudo update-alternatives --install /usr/bin/pg_dump pg_dump /usr/lib/postgresql/17/bin/pg_dump 200 >/dev/null 2>&1 || true
fi
export PATH="/usr/lib/postgresql/17/bin:$PATH"
echo "/usr/lib/postgresql/17/bin" >> "${GITHUB_PATH:-/dev/null}"
pg_dump --version

if ! command -v rclone >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  base="https://github.com/rclone/rclone/releases/download/${RCLONE_VERSION}"
  curl -fsSL -o "$tmp/rclone.zip" "$base/rclone-${RCLONE_VERSION}-linux-amd64.zip"
  curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS"
  (cd "$tmp" && grep "rclone-${RCLONE_VERSION}-linux-amd64.zip" SHA256SUMS | sed "s#rclone-${RCLONE_VERSION}-linux-amd64.zip#rclone.zip#" | sha256sum -c -)
  unzip -q "$tmp/rclone.zip" -d "$tmp"
  sudo install -m 0755 "$tmp/rclone-${RCLONE_VERSION}-linux-amd64/rclone" /usr/local/bin/rclone
fi
rclone version | head -n 1
