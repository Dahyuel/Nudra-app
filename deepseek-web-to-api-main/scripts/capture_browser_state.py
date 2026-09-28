from pathlib import Path

print("Paste your Bearer token (the part after 'Bearer '):")
token = input("> ").strip()

print("\nPaste the full Cookie header value:")
cookie = input("> ").strip()

print("\nPaste x-device-id (from any request header):")
device_id = input("> ").strip()

env = f"""DEEPSEEK_AUTHORIZATION=Bearer {token}
DEEPSEEK_COOKIE={cookie}
DEEPSEEK_DEVICE_ID={device_id}
DEEPSEEK_CLIENT_VERSION=2.5.0
DEEPSEEK_CLIENT_BUNDLE_ID=com.deepseek.chat
DEEPSEEK_CLIENT_LOCALE=en_US
DEEPSEEK_CLIENT_PLATFORM=web
DEEPSEEK_CLIENT_TIMEZONE_OFFSET=10800
HOST=0.0.0.0
PORT=4981
LOG_LEVEL=INFO
DEFAULT_MODEL=default
POW_MAX_RETRIES=3
REQUEST_TIMEOUT=300
COOKIE_PATH=./cookies/state.json
"""

Path(".env").write_text(env)
print("\n[✓] Wrote .env")
