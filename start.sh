#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
LOGS_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOGS_DIR"

select_node() {
  local nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [ -s "$nvm_script" ]; then
    # shellcheck disable=SC1090
    . "$nvm_script"
  fi
  if command -v nvm >/dev/null 2>&1; then
    nvm use 24 || {
      echo "[Nudra] ERROR: Node 24 is not installed in nvm. Run nvm install 24, then retry."
      exit 1
    }
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if (( major < 20 )); then
    echo "[Nudra] ERROR: Node 20.19+ is required; Node 24 is recommended. Current: $(node -v 2>/dev/null || echo unavailable)."
    exit 1
  fi
  echo "[Nudra] Using Node $(node -v)."
}

require_env_value() {
  local env_file="$BACKEND_DIR/.env" key
  key="$1"
  if [ ! -f "$env_file" ] || ! grep -Eq "^[[:space:]]*${key}=.+" "$env_file"; then
    echo "[Nudra] ERROR: Set $key in backend/.env before starting development."
    exit 1
  fi
}

port_owners() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -nu
  elif command -v ss >/dev/null 2>&1; then
    ss -H -ltnp "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -nu
  elif command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "$port" 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -nu
  fi
}

is_our_process() {
  local pid="$1" cwd cmd
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  cmd="$(ps -o args= -p "$pid" 2>/dev/null || true)"
  [[ "$cwd" == "$ROOT_DIR" || "$cwd" == "$BACKEND_DIR" || "$cwd" == "${PROXY_DIR:-$ROOT_DIR/deepseek-web-to-api-main}" || "$cmd" == *"$ROOT_DIR"* || "$cmd" == *"$BACKEND_DIR"* || "$cmd" == *"${PROXY_DIR:-$ROOT_DIR/deepseek-web-to-api-main}"* ]]
}

stop_pid_group() {
  local pid="$1" label="$2" attempt
  if ! kill -0 "$pid" 2>/dev/null; then return 0; fi
  if ! is_our_process "$pid"; then
    echo "[Nudra] ERROR: $label PID $pid does not appear to belong to this project; leaving it untouched."
    return 1
  fi
  echo "[Nudra] Stopping this project's $label (PID $pid)..."
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for attempt in {1..10}; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

stop_owned_listener() {
  local owner="$1" group session leader member all_owned
  group="$(ps -o pgid= -p "$owner" 2>/dev/null | tr -d ' ')"
  [[ "$group" =~ ^[0-9]+$ ]] || return 1
  leader="$group"
  session="$(ps -o sid= -p "$owner" 2>/dev/null | tr -d " ")"
  [[ "$session" == "$group" ]] || return 1
  is_our_process "$leader" || return 1
  all_owned=true
  while read -r member; do
    [ -n "$member" ] || continue
    if ! is_our_process "$member"; then all_owned=false; break; fi
  done < <(ps -eo pid=,pgid= | awk -v group="$group" '$2 == group {print $1}')
  [ "$all_owned" = true ] || return 1
  echo "[Nudra] Stopping this project's stale process group $group using the requested port..."
  kill -TERM -- "-$group" 2>/dev/null || return 1
  for _ in {1..10}; do
    kill -0 -- "-$group" 2>/dev/null || return 0
    sleep 1
  done
  kill -KILL -- "-$group" 2>/dev/null || true
}

clear_project_port() {
  local port="$1" owner attempt
  while read -r owner; do
    [ -n "$owner" ] || continue
    kill -0 "$owner" 2>/dev/null || continue
    if ! is_our_process "$owner" || ! stop_owned_listener "$owner"; then
      echo "[Nudra] ERROR: Port $port is occupied by PID $owner that cannot be safely identified as a Nudra process."
      echo "[Nudra] It was left running. Stop it yourself, then run ./start.sh again."
      return 1
    fi
  done < <(port_owners "$port")
  for attempt in {1..10}; do
    [ -z "$(port_owners "$port" || true)" ] && return 0
    sleep 1
  done
  echo "[Nudra] ERROR: Port $port is still occupied after stopping this project's stale process."
  return 1
}

wait_for_url() {
  local url="$1" label="$2" attempt
  for attempt in {1..30}; do
    if curl --silent --fail --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "[Nudra] ERROR: $label did not become ready. Check $LOGS_DIR/${label}.log."
  return 1
}

start_service() {
  local name="$1" directory="$2" command="$3" port="$4"
  local pid_file="$LOGS_DIR/$name.pid" old_pid
  if [ -f "$pid_file" ]; then
    old_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
      if is_our_process "$old_pid"; then
        echo "[Nudra] $name is already running (PID $old_pid)."
        return 0
      fi
      echo "[Nudra] ERROR: Stale $name PID file points to unrelated PID $old_pid; leaving process untouched."
      return 1
    fi
    rm -f "$pid_file"
  fi
  if [ "$port" != "none" ]; then
    clear_project_port "$port" || return 1
  fi
  setsid bash -c 'cd "$1" && exec bash -c "$2"' _ "$directory" "$command" \
    >"$LOGS_DIR/$name.log" 2>&1 </dev/null &
  local pid=$!
  printf '%s\n' "$pid" > "$pid_file"
  echo "[Nudra] Started $name (PID $pid), logging to $LOGS_DIR/$name.log"
}

start_dev_dependencies() {
  command -v docker >/dev/null 2>&1 || { echo "[Nudra] ERROR: Docker is required for local development services."; return 1; }
  docker info >/dev/null 2>&1 || { echo "[Nudra] ERROR: Docker is not running. Start Docker Desktop/Engine and retry."; return 1; }
  echo "[Nudra] Starting local development dependencies (Postgres, Redis, MinIO, Ollama, Mailpit, Whisper)..."
  docker compose -f "$ROOT_DIR/docker-compose.yml" --env-file "$ROOT_DIR/.env" up -d postgres redis minio ollama mailpit whisper
  echo "[Nudra] Waiting for local development dependencies..."
  local ready=false
  for attempt in {1..90}; do
    if docker exec nudra-postgres pg_isready >/dev/null 2>&1 \
      && docker exec nudra-redis redis-cli ping 2>/dev/null | grep -q PONG \
      && curl --silent --fail --max-time 2 http://localhost:9000/minio/health/live >/dev/null 2>&1 \
      && curl --silent --fail --max-time 2 http://localhost:5001/health >/dev/null 2>&1 \
      && docker exec nudra_ollama ollama list 2>/dev/null | grep -q 'nomic-embed-text'; then
      ready=true
      break
    fi
    sleep 2
  done
  if [ "$ready" != true ]; then
    echo "[Nudra] ERROR: A local dependency did not become ready. Check Docker Desktop, then inspect Docker Compose status and logs."
    docker compose -f "$ROOT_DIR/docker-compose.yml" --env-file "$ROOT_DIR/.env" ps
    return 1
  fi
}

configure_local_development_database() {
  local database_url
  database_url="$(docker compose -f "$ROOT_DIR/docker-compose.yml" --env-file "$ROOT_DIR/.env" config --format json | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      const environment = JSON.parse(input).services.postgres.environment;
      const required = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"];
      if (required.some((key) => !environment[key])) {
        process.stderr.write("Local Postgres credentials are missing from the development Compose configuration.\\n");
        process.exitCode = 1;
        return;
      }
      const encode = (value) => encodeURIComponent(String(value));
      process.stdout.write(`postgresql://${encode(environment.POSTGRES_USER)}:${encode(environment.POSTGRES_PASSWORD)}@127.0.0.1:5432/${encode(environment.POSTGRES_DB)}`);
    });
  ')" || {
    echo "[Nudra] ERROR: Could not read local Postgres settings from docker-compose.yml."
    return 1
  }
  if [[ "$database_url" != postgresql://*@127.0.0.1:5432/* ]]; then
    echo "[Nudra] ERROR: Development DATABASE_URL did not resolve to the local Postgres container."
    return 1
  fi

  # Exporting this value overrides any cloud DATABASE_URL in backend/.env for
  # child processes, without changing the user's private env file.
  export DATABASE_URL="$database_url"
  echo "[Nudra] Using the local development Postgres container."
  echo "[Nudra] Building the backend and applying local database migrations..."
  npm --prefix "$BACKEND_DIR" run build
  npm --prefix "$BACKEND_DIR" run db:migrate
}

select_node
command -v curl >/dev/null 2>&1 || { echo "[Nudra] ERROR: curl is required for startup checks."; exit 1; }
command -v setsid >/dev/null 2>&1 || { echo "[Nudra] ERROR: setsid is required to manage service processes safely."; exit 1; }
[ -d "$ROOT_DIR/node_modules" ] || { echo "[Nudra] Run npm install from the project root first."; exit 1; }
[ -d "$BACKEND_DIR/node_modules" ] || { echo "[Nudra] Run npm install from backend/ first."; exit 1; }
require_env_value SESSION_SECRET
require_env_value ANON_TOKEN_SALT
require_env_value WHISPER_API_KEY
[ "$(grep -E "^[[:space:]]*NODE_ENV=" "$BACKEND_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d "\"'[:space:]")" = "development" ] || {
  echo "[Nudra] ERROR: start.sh is for development only; set NODE_ENV=development in backend/.env."
  exit 1
}
require_env_value RESEND_API_KEY
PROXY_DIR="$ROOT_DIR/deepseek-web-to-api-main"
if [ ! -x "$PROXY_DIR/.venv/bin/python" ]; then
  echo "[Nudra] ERROR: DeepSeek proxy virtual environment is missing. Create it and install deepseek-web-to-api-main/requirements.txt."
  exit 1
fi
for credential in DEEPSEEK_AUTHORIZATION DEEPSEEK_COOKIE DEEPSEEK_DEVICE_ID; do
  if ! grep -Eq "^[[:space:]]*${credential}=.+" "$PROXY_DIR/.env"; then
    echo "[Nudra] ERROR: DeepSeek proxy credential $credential is missing in deepseek-web-to-api-main/.env."
    exit 1
  fi
done
for port in 4981 3001 3000; do
  clear_project_port "$port" || exit 1
done
start_dev_dependencies || exit 1
configure_local_development_database || exit 1
start_service deepseek "$PROXY_DIR" "$PROXY_DIR/.venv/bin/python -m app.main" 4981 || exit 1
if ! wait_for_url http://localhost:4981/health deepseek; then
  echo "[Nudra] ERROR: DeepSeek proxy did not start. Check $LOGS_DIR/deepseek.log."
  exit 1
fi
start_service video-worker "$BACKEND_DIR" "npm run dev:worker" none || exit 1
start_service backend "$BACKEND_DIR" "npm run dev" 3001 || exit 1
if ! wait_for_url http://localhost:3001/api/health backend; then
  "$ROOT_DIR/stop.sh" || true
  exit 1
fi

start_service frontend "$ROOT_DIR" "npm run dev" 3000 || {
  "$ROOT_DIR/stop.sh" || true
  exit 1
}
if ! wait_for_url http://localhost:3000 frontend; then
  "$ROOT_DIR/stop.sh" || true
  exit 1
fi

echo ""
echo "[Nudra] Local app is ready: http://localhost:3000"
echo "  Backend:  http://localhost:3001 (log: $LOGS_DIR/backend.log)"
echo "  Worker:   background video jobs (log: $LOGS_DIR/video-worker.log)"
echo "  Frontend: http://localhost:3000 (log: $LOGS_DIR/frontend.log)"
echo "  DeepSeek: http://localhost:4981 (log: $LOGS_DIR/deepseek.log)"
echo "  Stop app and proxy with: ./stop.sh"
