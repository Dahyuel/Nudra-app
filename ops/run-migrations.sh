#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -f .env.production ]]; then
  echo "Run this from the deployment directory containing .env.production." >&2
  exit 2
fi

set -a
# Deployment env files are administrator-maintained private files with
# generated URL-safe credentials. Restrict them to owner read/write (0600).
. ./.env.production
set +a
: "${MIGRATION_DATABASE_URL:?Set the separate migration-role URL in .env.production}"

docker compose --env-file .env.production -f compose.production.yml run --rm --no-deps \
  -e DATABASE_URL="$MIGRATION_DATABASE_URL" api npm run db:migrate
