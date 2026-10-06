#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -f .env.production ]]; then
  echo "Run this from the deployment directory containing .env.production." >&2
  exit 2
fi

set -a
. ./.env.production
set +a
: "${POSTGRES_DB:?Set POSTGRES_DB in .env.production}"
: "${POSTGRES_MIGRATION_USER:?Set POSTGRES_MIGRATION_USER in .env.production}"
: "${POSTGRES_MIGRATION_PASSWORD:?Set POSTGRES_MIGRATION_PASSWORD in .env.production}"

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required to back up the private production database." >&2
  exit 2
fi
if ! command -v pg_restore >/dev/null || ! command -v sha256sum >/dev/null; then
  echo "Install PostgreSQL client tools and sha256sum first." >&2
  exit 2
fi

backup_dir="${NUDRA_BACKUP_DIR:-$PWD/backups}"
retention_days="${NUDRA_BACKUP_RETENTION_DAYS:-30}"
if [[ ! "$retention_days" =~ ^[1-9][0-9]{0,3}$ ]]; then
  echo "NUDRA_BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 2
fi
umask 077
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
dump_file="$backup_dir/nudra-vps-$(date -u +%Y%m%dT%H%M%SZ).dump"
compose=(docker compose --env-file .env.production -f compose.production.yml)

"${compose[@]}" exec -T postgres sh -ec \
  'export PGPASSWORD="$POSTGRES_MIGRATION_PASSWORD"; pg_dump --format=custom --no-owner --no-acl --schema=public --username "$POSTGRES_MIGRATION_USER" --host 127.0.0.1 "$POSTGRES_DB"' \
  > "$dump_file"
if [[ ! -s "$dump_file" ]]; then
  rm -f "$dump_file"
  echo "PostgreSQL returned an empty backup; refusing to keep it." >&2
  exit 1
fi
pg_restore --list "$dump_file" >/dev/null
sha256sum "$dump_file" > "$dump_file.sha256"
chmod 600 "$dump_file" "$dump_file.sha256"

find "$backup_dir" -maxdepth 1 -type f -name 'nudra-vps-*.dump' -mtime "+$retention_days" -delete
find "$backup_dir" -maxdepth 1 -type f -name 'nudra-vps-*.dump.sha256' -mtime "+$retention_days" -delete

printf 'Database backup complete: %s\n' "$dump_file"
printf 'Archive listing and SHA-256 checks passed. Copy both files to encrypted offsite storage.\n'
