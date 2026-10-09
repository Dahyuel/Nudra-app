#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "Usage: $0 /secure/path/nudra-public.dump" >&2
  exit 2
fi
if [[ -z "${POSTGRES_DB:-}" || -z "${POSTGRES_MIGRATION_USER:-}" || -z "${POSTGRES_MIGRATION_PASSWORD:-}" ]]; then
  echo "Load .env.production first; migration-role database settings are required." >&2
  exit 2
fi
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required; the production database is intentionally private." >&2
  exit 2
fi

dump_file="$1"
if [[ -f "$dump_file.sha256" ]]; then
  (cd "$(dirname "$dump_file")" && sha256sum --check "$(basename "$dump_file").sha256")
else
  echo "Missing SHA-256 companion file; refusing to restore an unchecked archive." >&2
  exit 2
fi

compose=(docker compose --env-file .env.production -f compose.production.yml)
table_count="$("${compose[@]}" exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_MIGRATION_PASSWORD"; psql --no-psqlrc --username "$POSTGRES_MIGRATION_USER" --host 127.0.0.1 --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 --tuples-only --no-align -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname = \$\$public\$\$ AND c.relkind IN (\$\$r\$\$, \$\$p\$\$)"')"
if [[ "$table_count" != "0" ]]; then
  echo "Target database is not empty ($table_count public tables found); refusing to overwrite it." >&2
  exit 2
fi

"${compose[@]}" exec -T postgres sh -ec '
  export PGPASSWORD="$POSTGRES_MIGRATION_PASSWORD"
  umask 077
  archive=$(mktemp)
  contents=$(mktemp)
  trap '\''rm -f "$archive" "$contents"'\'' EXIT
  cat > "$archive"
  # The bootstrap already owns public and installs pgvector there. Restore
  # its contents, without trying to recreate or drop that existing schema.
  pg_restore --list "$archive" | grep -v -E '\''^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public '\'' > "$contents"
  pg_restore --no-owner --no-acl --exit-on-error --use-list="$contents" --username "$POSTGRES_MIGRATION_USER" --host 127.0.0.1 --dbname "$POSTGRES_DB" "$archive"
' < "$dump_file"
echo "Restore complete. Verify table counts, pgvector, accounts, ownership, and object storage before DNS cutover."
