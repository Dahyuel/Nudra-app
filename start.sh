#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PROXY_DIR="$ROOT_DIR/deepseek-web-to-api-main"
LOGS_DIR="$ROOT_DIR/.logs"

mkdir -p "$LOGS_DIR"

select_node() {
  local current_major current_minor
  current_major=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null) || current_major=0
  current_minor=$(node -p "process.versions.node.split('.')[1]" 2>/dev/null) || current_minor=0
  if [ "$current_major" -gt 20 ] || { [ "$current_major" -eq 20 ] && [ "$current_minor" -ge 19 ]; }; then
    return 0
  fi

  local candidates=()
  if [ -x "$HOME/.local/node22/bin/node" ]; then
    candidates+=("$HOME/.local/node22/bin")
  fi
  if [ -d "$HOME/.nvm/versions/node" ]; then
    while IFS= read -r dir; do
      candidates+=("$dir/bin")
    done < <(ls -d "$HOME/.nvm/versions/node"/v* 2>/dev/null | sort -Vr)
  fi

  local candidate major minor
  for candidate in "${candidates[@]}"; do
    if [ ! -x "$candidate/node" ]; then
      continue
    fi
    major=$("$candidate/node" -p "process.versions.node.split('.')[0]" 2>/dev/null) || major=0
    minor=$("$candidate/node" -p "process.versions.node.split('.')[1]" 2>/dev/null) || minor=0
    if [ "$major" -gt 20 ] || { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; }; then
      export PATH="$candidate:$PATH"
      return 0
    fi
  done

  echo "[Nudra] ERROR: frontend requires Node 20.19+ or 22.12+, found $(node -v)."
  echo "[Nudra] Install a newer Node (e.g. nvm install 20) and re-run ./start.sh."
  exit 1
}

stop_running_services() {
  echo "[Nudra] Stopping any previously running instances..."

  for pid_file in "$LOGS_DIR"/*.pid; do
    [ -f "$pid_file" ] || continue
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
      echo "  Stopped process $pid ($(basename "$pid_file" .pid))"
    fi
    rm -f "$pid_file"
  done

  for port in 3000 3001 4982; do
    pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP '(?<=pid=)[0-9]+' | sort -u || true)
    for pid in $pids; do
      echo "  Killing stale process $pid on port $port"
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
    done
  done

  sleep 1
}

select_node
stop_running_services

echo "[Nudra] Starting infrastructure containers..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d

echo "[Nudra] Waiting for Postgres to be ready..."
until docker exec nudra-postgres pg_isready -U "${POSTGRES_USER:-nudra}" -d "${POSTGRES_DB:-nudra}" >/dev/null 2>&1; do
  sleep 1
done

echo "[Nudra] Enabling pgvector extension..."
docker exec nudra-postgres psql -U "${POSTGRES_USER:-nudra}" -d "${POSTGRES_DB:-nudra}" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 || true

echo "[Nudra] Pushing database schema..."
(cd "$BACKEND_DIR" && npm run db:push)

echo "[Nudra] Seeding database..."
(cd "$BACKEND_DIR" && npm run db:seed)

open_capture_script() {
  local capture_script="$PROXY_DIR/scripts/capture_browser_state.py"
  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal -- bash -c "cd '$PROXY_DIR' && source .venv/bin/activate && python3 '$capture_script'; echo 'Press Enter to close...'; read"
  elif command -v konsole >/dev/null 2>&1; then
    konsole --new-tab -e bash -c "cd '$PROXY_DIR' && source .venv/bin/activate && python3 '$capture_script'; echo 'Press Enter to close...'; read"
  elif command -v xterm >/dev/null 2>&1; then
    xterm -T "DeepSeek Browser Capture" -e bash -c "cd '$PROXY_DIR' && source .venv/bin/activate && python3 '$capture_script'; echo 'Press Enter to close...'; read"
  else
    return 1
  fi
}

if [ -f "$PROXY_DIR/.env" ]; then
  echo "[Nudra] Existing DeepSeek credentials found at $PROXY_DIR/.env"
  echo "[Nudra] Opening capture script anyway so you can refresh them if needed."
fi

if ! open_capture_script; then
  echo "[Nudra] No supported terminal emulator found to open the capture script automatically."
  echo "[Nudra] Please run the following command in a separate terminal, then return here:"
  echo ""
  echo "  cd '$PROXY_DIR' && source .venv/bin/activate && python3 scripts/capture_browser_state.py"
  echo ""
  read -rp "Press Enter once you have captured/updated the DeepSeek credentials..."
fi

if [ ! -f "$PROXY_DIR/.env" ]; then
  echo "[Nudra] Waiting for DeepSeek credentials to be captured..."
  for i in {1..60}; do
    [ -f "$PROXY_DIR/.env" ] && break
    sleep 2
  done
  if [ ! -f "$PROXY_DIR/.env" ]; then
    echo "[Nudra] Warning: DeepSeek credentials not found. Proxy may fail to start."
  fi
fi

echo "[Nudra] Starting DeepSeek proxy on port 4982..."
nohup bash -c "cd '$PROXY_DIR' && source .venv/bin/activate && python3 -m app.main" > "$LOGS_DIR/deepseek-proxy.log" 2>&1 &
echo $! > "$LOGS_DIR/deepseek-proxy.pid"

echo "[Nudra] Starting backend dev server..."
nohup bash -c "cd '$BACKEND_DIR' && npm run dev" > "$LOGS_DIR/backend.log" 2>&1 &
echo $! > "$LOGS_DIR/backend.pid"

if command -v ss >/dev/null 2>&1 && ss -tlnp | grep -q ':3000 '; then
  echo "[Nudra] WARNING: Port 3000 is already in use. The frontend dev server may fail to start."
fi

echo "[Nudra] Starting frontend dev server..."
nohup bash -c "cd '$ROOT_DIR' && npm run dev" > "$LOGS_DIR/frontend.log" 2>&1 &
echo $! > "$LOGS_DIR/frontend.pid"

echo ""
echo "[Nudra] All services are starting in the background."
echo "  Backend:    http://localhost:3001  (logs: $LOGS_DIR/backend.log)"
echo "  Frontend:   http://localhost:3000  (logs: $LOGS_DIR/frontend.log)"
echo "  DeepSeek:   http://localhost:4981  (logs: $LOGS_DIR/deepseek-proxy.log)"
echo ""
echo "To stop everything, run: ./stop.sh"
echo ""
echo "Tailing backend log (Ctrl+C to stop watching, services keep running)..."
tail -f "$LOGS_DIR/backend.log"
