#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$ROOT_DIR/.logs"

stop_process_group() {
  local name="$1" pid_file="$LOGS_DIR/$1.pid" pid attempt cwd cmd
  if [ ! -f "$pid_file" ]; then
    echo "[Nudra] No tracked $name process."
    return 0
  fi
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ ! "$pid" =~ ^[0-9]+$ ]] || [ "$pid" -le 1 ]; then
    echo "[Nudra] Removing invalid $name PID file."
    rm -f "$pid_file"
    return 0
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    echo "[Nudra] Removing stale $name PID file."
    rm -f "$pid_file"
    return 0
  fi

  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  cmd="$(ps -o args= -p "$pid" 2>/dev/null || true)"
  if [[ "$cwd" != "$ROOT_DIR" && "$cwd" != "$BACKEND_DIR" && "$cwd" != "$PROXY_DIR" && "$cmd" != *"$ROOT_DIR"* && "$cmd" != *"$BACKEND_DIR"* && "$cmd" != *"$PROXY_DIR"* ]]; then
    echo "[Nudra] $name PID file points to a process outside this project; leaving it untouched and removing stale tracking."
    rm -f "$pid_file"
    return 0
  fi

  echo "[Nudra] Stopping $name process group $pid..."
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for attempt in {1..10}; do
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "[Nudra] $name did not stop cleanly; sending SIGKILL to its process group."
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
}

BACKEND_DIR="$ROOT_DIR/backend"
PROXY_DIR="$ROOT_DIR/deepseek-web-to-api-main"
stop_process_group frontend
stop_process_group backend
stop_process_group deepseek
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose -f "$ROOT_DIR/docker-compose.yml" --env-file "$ROOT_DIR/.env" down
else
  echo "[Nudra] Docker is not running; no development containers to stop."
fi
echo "[Nudra] Local app, DeepSeek proxy, and Nudra development containers stopped. Named Docker volumes were preserved."
