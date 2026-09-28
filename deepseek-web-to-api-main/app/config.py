from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    deepseek_authorization: str = "Bearer REDACTED"
    deepseek_cookie: str = ""
    deepseek_device_id: str = ""

    deepseek_client_version: str = "2.5.0"
    deepseek_client_bundle_id: str = "com.deepseek.chat"
    deepseek_client_locale: str = "en_US"
    deepseek_client_platform: str = "web"
    deepseek_client_timezone_offset: int = 10800

    host: str = "0.0.0.0"
    port: int = 4982
    log_level: str = "INFO"

    default_model: str = "default"
    pow_max_retries: int = 3
    request_timeout: int = 300

    cookie_path: Path = Path("./cookies/state.json")
    base_url: str = "https://chat.deepseek.com"


settings = Settings()
