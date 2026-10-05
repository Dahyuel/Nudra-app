#!/bin/sh
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${MINIO_APP_USER:?MINIO_APP_USER is required}"
: "${MINIO_APP_PASSWORD:?MINIO_APP_PASSWORD is required}"

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

attempt=0
until mc ready local; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo 'MinIO did not become ready in time.' >&2
    exit 1
  fi
  sleep 2
done

mc mb --ignore-existing local/nudra-thumbnails
mc mb --ignore-existing local/nudra-raw-videos
mc mb --ignore-existing local/nudra-hls
mc anonymous set download local/nudra-thumbnails
mc anonymous set none local/nudra-raw-videos
mc anonymous set none local/nudra-hls

mc admin policy create local nudra-app /policies/nudra-app.json || true
mc admin user add local "$MINIO_APP_USER" "$MINIO_APP_PASSWORD" || true
mc admin policy attach local nudra-app --user "$MINIO_APP_USER"
