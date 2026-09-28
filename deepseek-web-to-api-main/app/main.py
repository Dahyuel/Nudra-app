from contextlib import asynccontextmanager

from fastapi import FastAPI
from loguru import logger

from app import __version__
from app.api import health, openai_compat
from app.config import settings
from app.deepseek.auth import ensure_device_id
from app import store as conversation_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    import sys
    import os
    from pathlib import Path as _Path

    # Make sure a logs directory exists
    log_dir = _Path("/opt/deepseek-proxy/app/logs")
    log_dir.mkdir(parents=True, exist_ok=True)

    logger.remove()
    # Sink 1: stderr (goes to journald)
    logger.add(
        sink=sys.stderr,
        level=settings.log_level,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
        enqueue=True,
    )
    # Sink 2: dedicated file (always flushed, no async contention)
    logger.add(
        sink=str(log_dir / "proxy-{time:YYYY-MM-DD}.log"),
        level=settings.log_level,
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {message}",
        rotation="00:00",
        retention="7 days",
        enqueue=True,
    )
    logger.info(f"DeepSeek Web-to-API v{__version__}")
    logger.info(f"Device ID: {ensure_device_id()}")
    logger.info(f"Listening on {settings.host}:{settings.port}")
    conversation_store.init_db()
    yield
    logger.info("Shutting down")


app = FastAPI(
    title="DeepSeek Web-to-API",
    version=__version__,
    description="OpenAI-compatible proxy for DeepSeek web chat.",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(openai_compat.router, prefix="/openai", tags=["openai"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, log_level=settings.log_level.lower())
