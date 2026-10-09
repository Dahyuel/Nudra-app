#!/usr/bin/env bash
set -Eeuo pipefail
compose=(docker compose --env-file .env.production -f compose.production.yml)
"${compose[@]}" exec -T api node dist/scripts/check-operations.js
"${compose[@]}" exec -T video-worker node dist/scripts/worker-health.js
"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:3001/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
available_percent=$(df -P / | tail -1 | tr -s ' ' | cut -d ' ' -f 5 | tr -d '%')
if ((available_percent >= 85)); then
  printf 'Disk usage is %s%%; admission and cleanup need operator attention.\n' "$available_percent" >&2
  exit 1
fi
printf 'Health, backlog and disk checks passed.\n'
