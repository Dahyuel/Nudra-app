#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${SOURCE_DATABASE_URL:-}" ]]; then
  echo "Set SOURCE_DATABASE_URL to the current PostgreSQL connection string." >&2
  exit 2
fi
if ! command -v pg_dump >/dev/null || ! command -v pg_restore >/dev/null; then
  echo "Install PostgreSQL client tools (pg_dump and pg_restore) first." >&2
  exit 2
fi

backup_dir="${NUDRA_BACKUP_DIR:-$PWD/backups}"
umask 077
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
dump_file="$backup_dir/nudra-public-$(date -u +%Y%m%dT%H%M%SZ).dump"

# The application uses its own public schema, not Supabase Auth/Storage.
# Custom-format dumps can be inspected and restored into the pgvector image.
pg_dump --format=custom --no-owner --no-acl --schema=public \
  --file="$dump_file" "$SOURCE_DATABASE_URL"
pg_restore --list "$dump_file" >/dev/null
(cd "$(dirname "$dump_file")" && sha256sum "$(basename "$dump_file")") > "$dump_file.sha256"
chmod 600 "$dump_file" "$dump_file.sha256"
printf 'Export complete: %s\n' "$dump_file"
printf 'Copy this file and its .sha256 companion to the VPS over SSH.\n'
