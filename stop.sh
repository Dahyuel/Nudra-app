#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$ROOT_DIR/.logs"

echo "[Nudra] Stopping background services..."

for pid_file in "$LOGS_DIR"/*.pid; do
  [ -f "$pid_file" ] | continue
  pid=$(cat "$pid_file" 2>/dev/null | true)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    pkill -TERM -P "$pid" 2>/dev/null | true
    kill "$pid" 2>/dev/null | true
    echo "  Stopped process $pid"
  fi
  rm -f "$pid_file"
done

for port in 3000 3001 4982; do
  pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u | true)
  for pid in $pids; do
    echo "  Killing stale process $pid on port $port"
    kill "$pid" 2>/dev/null | true
  done
done

echo "[Nudra] Stopping Docker containers..."
docker compose -f "$ROOT_DIR/docker-compose.yml" down

echo "[Nudra] All services stopped."
