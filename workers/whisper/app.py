import os
import tempfile
import traceback

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel
from minio import Minio

app = FastAPI()

RAW_BUCKET = "edraky-raw-videos"
API_KEY = os.environ.get("WHISPER_API_KEY") or os.environ.get("SESSION_SECRET")

_model = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model


def get_minio() -> Minio:
    return Minio(
        f"{os.environ.get('MINIO_ENDPOINT', 'localhost')}:{os.environ.get('MINIO_PORT', '9000')}",
        access_key=os.environ.get("MINIO_ACCESS_KEY", "edraky_minio"),
        secret_key=os.environ.get("MINIO_SECRET_KEY", "edraky_minio_secret"),
        secure=os.environ.get("MINIO_USE_SSL", "false").lower() == "true",
    )


async def require_api_key(x_api_key: str | None = Header(default=None)):
    if not API_KEY:
        return
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.post("/transcribe", dependencies=[Depends(require_api_key)])
async def transcribe(payload: dict):
    minio_key = payload.get("minio_key")
    if not minio_key:
        return JSONResponse(status_code=400, content={"error": "minio_key is required"})

    tmp_dir = tempfile.mkdtemp(prefix="whisper_")
    local_path = os.path.join(tmp_dir, os.path.basename(minio_key))

    try:
        client = get_minio()
        client.fget_object(RAW_BUCKET, minio_key, local_path)

        model = get_model()
        segments_iter, _info = model.transcribe(local_path, language=None, beam_size=5)

        segments = []
        text_parts = []
        for seg in segments_iter:
            segments.append({"start": seg.start, "end": seg.end, "text": seg.text})
            text_parts.append(seg.text)

        return {
            "transcript": "".join(text_parts).strip(),
            "segments": segments,
        }
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
            os.rmdir(tmp_dir)
        except Exception:
            pass


@app.get("/health")
async def health():
    return {"status": "ok"}