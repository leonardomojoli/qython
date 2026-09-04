"""
Standalone faster-whisper transcription service for Qython.

Runs as ONE process (whisper.service) so the large-v3-turbo model is loaded a SINGLE
time — not once per gunicorn worker (which would multiply RAM by the worker count and
OOM the box). The backend posts audio here from transcription_service when
WHISPER_SERVER_URL is set (otherwise it falls back to the Groq API path).

Endpoints:
  GET  /health      -> {"status": "ok", "model": ...}
  POST /transcribe  -> multipart 'file' (any audio/video container) -> {"text": ...}

faster-whisper decodes the container itself (via PyAV) and handles long audio with its
internal 30s windowing + VAD, so no client-side ffmpeg chunking is needed. The blocking
(CPU-bound) transcription runs in a worker thread under a lock, so /health stays
responsive and transcriptions serialize (no CPU thrashing from concurrent jobs).

Env:
  WHISPER_MODEL          (default 'large-v3-turbo')
  WHISPER_COMPUTE_TYPE   (default 'int8'  — fits ~1.5 GB on CPU)
  WHISPER_DEVICE         (default 'cpu')
  WHISPER_CPU_THREADS    (default 4)
  WHISPER_BEAM_SIZE      (default 5)
  WHISPER_VAD            (default '1' — filter non-speech to cut hallucinations)
  WHISPER_LANGUAGE       (default '' = auto-detect; libraries may be pt/en/es)
"""

import os
import asyncio
import logging
import tempfile

from fastapi import FastAPI, UploadFile, File, HTTPException
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("whisper_server")

MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3-turbo")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
CPU_THREADS = int(os.getenv("WHISPER_CPU_THREADS", "4"))
BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
VAD_FILTER = os.getenv("WHISPER_VAD", "1").strip() not in ("0", "false", "False", "")
LANGUAGE = os.getenv("WHISPER_LANGUAGE", "").strip() or None

app = FastAPI(title="Qython Whisper Service")
_model = None
# Serializa transcrições: um modelo, uma por vez (evita contenção de CPU).
_transcribe_lock = asyncio.Lock()


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        logger.info(
            "Carregando faster-whisper '%s' (device=%s, compute=%s, threads=%d)...",
            MODEL_NAME, DEVICE, COMPUTE_TYPE, CPU_THREADS,
        )
        _model = WhisperModel(
            MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE, cpu_threads=CPU_THREADS
        )
        logger.info("Modelo carregado.")
    return _model


def _run_transcribe(tmp_path: str):
    """Blocking transcription (roda numa thread via asyncio.to_thread)."""
    model = get_model()
    segments, info = model.transcribe(
        tmp_path,
        language=LANGUAGE,
        beam_size=BEAM_SIZE,
        vad_filter=VAD_FILTER,
    )
    # `segments` é lazy — iterar dispara a transcrição de fato.
    text = " ".join(seg.text.strip() for seg in segments).strip()
    return text, info.language, info.duration


@app.on_event("startup")
def _startup():
    # Carrega o modelo já na subida — 1ª request não espera + falha rápido se quebrado.
    get_model()


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "compute": COMPUTE_TYPE, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="arquivo vazio")

    suffix = os.path.splitext(file.filename or "audio")[1] or ".bin"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        logger.info("Transcrevendo %s (%d bytes)...", file.filename, len(data))
        async with _transcribe_lock:
            text, lang, dur = await asyncio.to_thread(_run_transcribe, tmp_path)
        logger.info("Concluído: lang=%s dur=%.1fs chars=%d", lang, dur, len(text))
        return {"text": text, "language": lang, "duration": dur}
    except Exception as e:
        logger.error("Falha na transcrição de %s: %s", file.filename, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"transcription failed: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
