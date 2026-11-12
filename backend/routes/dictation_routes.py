"""Ditado de voz: o áudio vai ao whisper da própria instalação e volta texto.

  POST /api/dictation   (logado)  multipart: file (áudio curto) + language opcional  ->  {"text": ...}

Existe para o celular pareado. O reconhecedor de voz do Android manda o áudio para a nuvem do fabricante;
aqui a gravação cruza só a rede local até o computador do médico, é transcrita lá e apagada na hora.
O mesmo endpoint serve o navegador do desktop, onde a Web Speech API também depende de nuvem.
"""
import logging
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from ..models import User
from ..rate_limiter import limiter
from ..security import get_current_active_user
from ..services.academic_services.transcription_service import DictationUnavailable, transcribe_dictation

logger = logging.getLogger("qython_logger")
router = APIRouter()

# Ditado é trecho curto (a tela corta em 2 minutos). 12 MB cobrem com folga m4a/webm de 2 min e
# barram arquivo grande mandado por engano para um serviço que transcreve um por vez.
MAX_BYTES = 12 * 1024 * 1024
# Extensões que o whisper (PyAV) abre. O que vier fora disso segue como ".bin", que ele também detecta.
AUDIO_SUFFIXES = {".m4a", ".mp4", ".aac", ".3gp", ".amr", ".wav", ".webm", ".ogg", ".opus", ".mp3", ".flac"}
LANGUAGES = {"pt", "en", "es"}


def _language(value: Optional[str]) -> Optional[str]:
    """'pt-BR' -> 'pt'. Idioma fora de pt/en/es é ignorado (o whisper detecta sozinho)."""
    base = (value or "").strip().lower().split("-")[0].split("_")[0]
    return base if base in LANGUAGES else None


@router.post("", status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def dictate(
    request: Request,
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    current_user: User = Depends(get_current_active_user),
):
    content = await file.read(MAX_BYTES + 1)
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Áudio vazio.")
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "Áudio longo demais para ditado (máximo 12 MB).")

    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix not in AUDIO_SUFFIXES:
        suffix = ".bin"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        text = await run_in_threadpool(transcribe_dictation, tmp_path, _language(language))
    except DictationUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                logger.warning("Ditado: não consegui apagar o áudio temporário %s", tmp_path)

    # Só o tamanho no log: o conteúdo é dado clínico.
    logger.info("Ditado de %s: %d bytes -> %d caracteres", current_user.id, len(content), len(text))
    return {"text": text}
