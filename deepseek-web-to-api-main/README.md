# DeepSeek Web-to-API

> **OpenAI-compatible proxy for the DeepSeek web chat app.**
> Use your DeepSeek browser session as a drop-in OpenAI API — no API key required.

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20compatible-10a37f.svg)](#api-compatibility)

---

## ⚠️ Disclaimer

This project is **reverse-engineered** from the DeepSeek web chat frontend.
It uses **browser cookies** to authenticate against DeepSeek's private web API.

- **Not affiliated with DeepSeek.**
- **Violates DeepSeek's Terms of Service** if used commercially or at scale.
- **Intended for personal / research / educational use only.**
- **You are responsible** for any account actions DeepSeek takes.
- **Never commit** your `.env` file or `cookies/` directory.

Use at your own risk.

---

## ✨ Features

- **Cookie-based auth** — no API key needed
- **OpenAI-compatible** `/v1/chat/completions` and `/v1/models`
- **Streaming** (SSE) support
- **Multi-turn conversations** with persistent SQLite sessions
- **Tool calling** (emulated via prompt engineering) — works with OpenCode, aider, etc.
- **DSML parsing** — handles DeepSeek's native tool-call format
- **DeepThink (R1) support** via `thinking_enabled: true`
- **Web search** via `search_enabled: true`
- **PoW solver** — WASM `DeepSeekHashV1` challenge
- **Docker-ready**

---

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- A DeepSeek account (free tier works)
- A Chromium-based browser (for cookie extraction)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/deepseek-web-to-api.git
cd deepseek-web-to-api

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Capture browser credentials

```bash
python scripts/capture_browser_state.py
```

You will be prompted to paste three values from your browser:

1. **Bearer token** — from `localStorage.userToken` on `chat.deepseek.com`
   (DevTools → Application → Local Storage → `chat.deepseek.com`)
2. **Cookie header** — from any `/api/` request
   (DevTools → Network → click a request → Request Headers → `cookie`)
3. **Device ID** — from any request's `x-device-id` header

These are stored in `.env`. **Never commit this file.**

### 3. Run

```bash
python -m app.main
```

The proxy listens on `http://localhost:4981` by default.

### 4. Test

```bash
curl -X POST http://localhost:4981/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"default","messages":[{"role":"user","content":"hello"}]}'
```

---

## 🔌 API Compatibility

Works with any OpenAI-compatible client:

### Python (official OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4981/openai/v1",
    api_key="not-needed",
)

response = client.chat.completions.create(
    model="default",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)
```

### Streaming

```python
for chunk in client.chat.completions.create(
    model="default",
    messages=[{"role": "user", "content": "Count to 5"}],
    stream=True,
):
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

### Multi-turn

```python
# Turn 1 — new conversation
r1 = client.chat.completions.create(
    model="default",
    messages=[{"role": "user", "content": "My name is Ahmed"}],
)
conversation_id = r1.model_extra["conversation_id"]

# Turn 2 — same conversation
r2 = client.chat.completions.create(
    model="default",
    messages=[{"role": "user", "content": "What is my name?"}],
    extra_body={"conversation_id": conversation_id},
)
print(r2.choices[0].message.content)  # "Your name is Ahmed."
```

### DeepThink (R1 reasoning)

```python
response = client.chat.completions.create(
    model="default",
    messages=[{"role": "user", "content": "What is 27 * 43?"}],
    extra_body={"thinking_enabled": True},
)
```

### Web search

```python
response = client.chat.completions.create(
    model="default",
    messages=[{"role": "user", "content": "What happened today?"}],
    extra_body={"search_enabled": True},
)
```

---

## 🛠️ OpenCode Integration

Add to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek-proxy/default",
  "provider": {
    "deepseek-proxy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "DeepSeek Proxy",
      "options": {
        "baseURL": "http://localhost:4981/openai/v1",
        "apiKey": "not-needed"
      },
      "models": {
        "default": { "name": "DeepSeek Instant" },
        "expert":  { "name": "DeepSeek Expert" },
        "vision":  { "name": "DeepSeek Vision" }
      }
    }
  }
}
```

Then in OpenCode: `/models` → select **DeepSeek Instant**.

---

## 🐳 Docker

```bash
docker compose up -d --build
```

Or build directly:

```bash
docker build -t deepseek-web-to-api .
docker run -d -p 4981:4981 --env-file .env deepseek-web-to-api
```

---

## 🧠 How It Works

1. **Auth** — Reads your DeepSeek cookies + Bearer token from `.env`.
2. **PoW** — Each `/completion` request requires a proof-of-work challenge.
   The proxy runs DeepSeek's `sha3_wasm_bg.wasm` via `wasmtime` to solve it.
3. **Session** — Creates a chat session, sends the prompt, streams SSE back.
4. **Tool calling** — When tools are present, the proxy injects a system prompt
   that teaches DeepSeek to emit tool calls as JSON, then parses the response
   (including DeepSeek's native DSML format) into OpenAI `tool_calls`.
5. **Multi-turn** — Session IDs are persisted to SQLite so you can reuse
   `conversation_id` across requests.

---

## 📋 Configuration

All config is via `.env`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DEEPSEEK_AUTHORIZATION` | ✅ | — | `Bearer <token>` |
| `DEEPSEEK_COOKIE` | ✅ | — | Full cookie header |
| `DEEPSEEK_DEVICE_ID` | ✅ | auto | UUID from your browser |
| `DEEPSEEK_CLIENT_VERSION` | ❌ | `2.5.0` | Bump when frontend updates |
| `HOST` | ❌ | `0.0.0.0` | |
| `PORT` | ❌ | `4981` | |
| `LOG_LEVEL` | ❌ | `INFO` | |
| `DEFAULT_MODEL` | ❌ | `default` | |
| `REQUEST_TIMEOUT` | ❌ | `300` | Seconds |
| `COOKIE_PATH` | ❌ | `./cookies/state.json` | Where to persist cookies |

---

## ⚠️ Known Limitations

- **Cookies expire.** Re-run `capture_browser_state.py` when auth fails.
- **Model updates break things.** DeepSeek changes their frontend regularly.
- **Tool calling is emulated**, not native — reliability ~85-95% depending on prompt.
- **Rate limits apply.** DeepSeek may throttle heavy usage.
- **Not for production.** This is a research/personal-use tool.

---

## 🤝 Contributing

Issues and PRs welcome. Please:
- Never commit `.env` or cookies
- Include a minimal reproduction for bugs
- Test against the latest DeepSeek frontend

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

## 🙏 Credits

Built by reverse-engineering DeepSeek's web frontend.
Inspired by projects like [`gemini-webapi`](https://github.com/HanaokaYuzu/Gemini-API)
and [`gemini-web-to-api`](https://github.com/ntthanh2603/gemini-web-to-api).

**Not affiliated with DeepSeek.**

---

## 🧩 MCP (Model Context Protocol) Support

The proxy supports MCP servers via the [`opencode-llm-proxy`](https://www.npmjs.com/package/opencode-llm-proxy)
plugin. This lets OpenCode talk to MCP servers (like Supabase) through the
DeepSeek proxy.

### Requirements

- Node.js 18+
- `opencode-llm-proxy` installed globally

### Install the plugin

```bash
sudo npm install -g opencode-llm-proxy
# or, without sudo:
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g opencode-llm-proxy
```

### Configure OpenCode

Edit `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek-proxy/default",
  "plugin": ["opencode-llm-proxy"],
  "provider": {
    "deepseek-proxy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "DeepSeek Proxy",
      "options": {
        "baseURL": "http://localhost:4982/openai/v1",
        "apiKey": "not-needed"
      },
      "models": {
        "default": {
          "name": "DeepSeek Instant",
          "reasoning": true,
          "tool_call": true,
          "limit": { "context": 500000, "output": 8192 },
          "cost": { "input": 0.27, "output": 1.10, "cache": { "read": 0, "write": 0 } }
        }
      }
    }
  },
  "mcp": {
    "supabase": {
      "type": "remote",
      "url": "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF",
      "enabled": true,
      "oauth": {}
    }
  }
}
```

**Important:** OpenCode reads `limit.context` and `limit.output`, not `contextLength`. The `enabled: true` on the MCP server prevents it from showing as `Disabled`.

### Authenticate the MCP server

```bash
opencode mcp auth supabase
```

### Verify it's working

Inside OpenCode, the MCP sidebar should show `supabase Connected`.
Try a prompt:

```
use supabase mcp to list tables in the database
```

You should see structured tool calls like `⛁ supabase_list_tables` and real results.

### Tested MCP servers

| Server | Status |
|---|---|
| Supabase | ✅ Verified (schema listing, 31+ tables) |

### Known quirks

- If the MCP sidebar shows `Disabled`, the server config has `enabled: false` or
  no runtime status exists. Set `"enabled": true` and run `opencode mcp auth supabase`.
- If the MCP sidebar shows `Needs auth` even after a successful auth, restart OpenCode.
  This is an upstream OpenCode caching issue, not a proxy bug.
- The proxy's tool-calling is emulated via prompt engineering, so extremely
  complex MCP tool schemas may occasionally fail. Simple operations
  (list, read) are reliable.



---

## 🔁 OpenCode: Fix the "Loop Exits Mid-Work" Issue

If OpenCode stops the agent loop after a handful of tool calls (you see
`step=1 exiting loop` in the logs, and you have to type `continue` repeatedly),
it's hitting its built-in **step limit**, not a proxy problem.

### The symptom

- The agent runs 5-10 tool calls
- The response finishes with `finish_reason: stop`
- The loop exits and you have to type `continue`
- `~/.local/share/opencode/log/opencode.log` shows `message="exiting loop" session.id=... step=1`

### The fix

Raise the step limit in `~/.config/opencode/opencode.json` by adding an
agent-level `steps` key (legacy `maxSteps` is deprecated):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek-proxy/default",
  "plugin": ["opencode-llm-proxy"],
  "agents": {
    "default": {
      "steps": 100
    }
  },
  "provider": {
    "deepseek-proxy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "DeepSeek Proxy",
      "options": {
        "baseURL": "http://192.168.1.93:4982/openai/v1",
        "apiKey": "not-needed"
      },
      "models": {
        "default": {
          "name": "DeepSeek Instant",
          "tool_call": true,
          "limit": { "context": 500000, "output": 8192 }
        }
      }
    }
  }
}
```

Or patch it in one command:

```bash
python3 - <<'PYEOF'
import json
from pathlib import Path

p = Path.home() / ".config/opencode/opencode.json"
cfg = json.loads(p.read_text())
cfg.setdefault("agents", {})["default"] = {"steps": 100}
p.write_text(json.dumps(cfg, indent=2))
print("[OK] agents.default.steps=100 set in", p)
PYEOF
```

Restart OpenCode for the change to take effect.

### Why this happens

OpenCode's agent loop is driven by the agent `steps` option. The default
is low (typically 5-10 iterations) to prevent runaway loops. Each "step" can
contain multiple tool calls, so a complex task can exhaust the budget quickly.
Bumping it to 100 or more gives the agent room to finish multi-file operations
in one turn.

### Secondary cause - context truncation

Even with `maxSteps` raised, DeepSeek's **web context window** can fill up on
very long sessions. Symptoms:

- The response gets cut off mid-sentence
- `finish_reason: stop` arrives but the task isn't done
- The next request may hit `401` or return garbled output

**Fix:** start a fresh session (new OpenCode chat) when you switch tasks, or
when the current conversation grows past ~30-40 turns. The proxy's
`conversation_id` is per-session, so a new chat starts clean.

### Verifying the change

```bash
cat ~/.config/opencode/opencode.json | python3 -m json.tool | head -15
```

You should see `"maxSteps": 100` near the top.

Then in OpenCode:

```
List all .tsx files in src, count them, and show the largest 3 by line count
```

The agent should chain several tool calls without stopping early.
