#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# -eq 2 ]] || { printf 'Usage: %s RESTIC_OBJECT_SNAPSHOT EMPTY_DOCKER_VOLUME\n' "$0" >&2; exit 2; }
command -v restic >/dev/null
snapshot="$1"
volume="$2"
# Refuse restoring into a volume which has any data. Stop MinIO before calling.
docker volume inspect "$volume" >/dev/null
[[ -z "$(docker ps -q --filter "volume=$volume")" ]] || { printf 'Stop containers using the destination volume before restoring.\n' >&2; exit 1; }
docker run --rm --network none -v "$volume:/storage:ro" debian:bookworm-slim sh -ec 'test -z "$(ls -A /storage)"'
restic dump "$snapshot" minio.tar |
  docker run --rm -i --network none -v "$volume:/storage" debian:bookworm-slim tar -xf - -C /storage
printf 'Object volume restored. Start the matching MinIO build and verify bucket policies and representative objects before reopening traffic.\n'
