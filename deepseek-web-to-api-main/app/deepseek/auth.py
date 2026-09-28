import json
import uuid

from loguru import logger

from app.config import settings


def ensure_device_id() -> str:
    if settings.deepseek_device_id:
        return settings.deepseek_device_id
    settings.cookie_path.parent.mkdir(parents=True, exist_ok=True)
    state = _load_state()
    if "device_id" not in state:
        state["device_id"] = str(uuid.uuid4())
        _save_state(state)
        logger.info(f"Generated new device_id: {state['device_id']}")
    return state["device_id"]


def _load_state() -> dict:
    if settings.cookie_path.exists():
        try:
            return json.loads(settings.cookie_path.read_text())
        except Exception:
            return {}
    return {}


def _save_state(state: dict) -> None:
    settings.cookie_path.parent.mkdir(parents=True, exist_ok=True)
    settings.cookie_path.write_text(json.dumps(state, indent=2))


def save_cookies(cookie_header: str) -> None:
    state = _load_state()
    state["cookie"] = cookie_header
    _save_state(state)


def load_cookies() -> str:
    state = _load_state()
    return state.get("cookie") or settings.deepseek_cookie
