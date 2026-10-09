#!/usr/bin/env bash
# Cold, consistent database + object-volume backup. Run during a maintenance window.
set -Eeuo pipefail
command -v restic >/dev/null
: "${RESTIC_REPOSITORY:?Configure an independent offsite restic repository}"
: "${RESTIC_PASSWORD_FILE:?Configure a private repository encryption password file}"
umask 077
compose=(docker compose --env-file .env.production -f compose.production.yml)
backup_set="nudra-$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir=$(mktemp -d)
minio_container=$("${compose[@]}" ps -q minio)
minio_volume=$(docker inspect "$minio_container" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
[[ -n "$minio_volume" ]]
resume() { "${compose[@]}" start minio api video-worker; rm -rf "$backup_dir"; }
trap resume EXIT
"${compose[@]}" stop api video-worker
NUDRA_BACKUP_DIR="$backup_dir" bash ops/backup-production-database.sh
"${compose[@]}" stop minio
restic backup "$backup_dir" --tag "$backup_set" --tag nudra-database
docker run --rm --network none -v "$minio_volume:/storage:ro" debian:bookworm-slim tar -cf - -C /storage . |
  restic backup --stdin --stdin-filename minio.tar --tag "$backup_set" --tag nudra-objects
restic snapshots --tag "$backup_set"
printf 'Record both snapshot IDs. Restore drills must use snapshots with this same backup-set tag: %s\n' "$backup_set"
