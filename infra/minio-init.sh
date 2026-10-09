#!/bin/sh
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${MINIO_APP_USER:?MINIO_APP_USER is required}"
: "${MINIO_APP_PASSWORD:?MINIO_APP_PASSWORD is required}"
bucket_prefix=${MINIO_BUCKET_PREFIX:-nudra}
case "$bucket_prefix" in nudra|nudra-demo) ;; *) echo 'Unsupported bucket prefix' >&2; exit 1 ;; esac
policy_name="$bucket_prefix-app"
policy_file=/policies/nudra-app.json
if [ "$bucket_prefix" = 'nudra-demo' ]; then
  case "$MINIO_APP_USER" in *-demo|*_demo) ;; *) echo 'Demo storage requires a separate demo application user' >&2; exit 1 ;; esac
  policy_file=/policies/nudra-demo-app.json
fi

attempt=0
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo 'MinIO initialization connection failed.' >&2
    exit 1
  fi
  sleep 2
done

attempt=0
until mc ready local; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo 'MinIO did not become ready in time.' >&2
    exit 1
  fi
  sleep 2
done

mc mb --ignore-existing "local/$bucket_prefix-thumbnails"
mc mb --ignore-existing "local/$bucket_prefix-raw-videos"
mc mb --ignore-existing "local/$bucket_prefix-hls"
mc anonymous set download "local/$bucket_prefix-thumbnails"
mc anonymous set none "local/$bucket_prefix-raw-videos"
mc anonymous set none "local/$bucket_prefix-hls"

mc admin policy create local "$policy_name" "$policy_file"
mc admin user add local "$MINIO_APP_USER" "$MINIO_APP_PASSWORD"
mc admin policy attach local "$policy_name" --user "$MINIO_APP_USER"
