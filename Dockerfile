# Qython backend — FastAPI + Gunicorn/Uvicorn
#
# Build:  docker build -t qython-backend .
# Normalmente você não roda isto à mão: use `docker compose up`.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Dependências de sistema que o backend invoca como binário:
#   ffmpeg     — extração/transcodificação de áudio antes da transcrição
#   tesseract  — OCR de PDF escaneado (por+spa+eng)
#   libmagic   — detecção de tipo de arquivo (python-magic)
#   poppler    — rasterização de PDF para thumbnail
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        tesseract-ocr tesseract-ocr-por tesseract-ocr-spa tesseract-ocr-eng \
        libmagic1 \
        poppler-utils \
        curl \
    && rm -rf /var/lib/apt/lists/*

# LibreOffice converte .docx/.pptx para PDF antes da extração de texto.
# São ~500 MB, e só a ingestão de arquivos Office depende disso — por isso é opcional.
# Ative com:  docker compose build --build-arg WITH_LIBREOFFICE=true
ARG WITH_LIBREOFFICE=false
RUN if [ "$WITH_LIBREOFFICE" = "true" ]; then \
        apt-get update && apt-get install -y --no-install-recommends \
            libreoffice-writer libreoffice-impress \
        && rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /app

# Camada de dependências separada: só reinstala quando requirements.txt muda.
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt gunicorn

COPY backend/ ./backend/
COPY __init__.py ./
# scripts/ traz utilitarios de manutencao rodados com `docker compose exec`,
# como a promocao do primeiro usuario a administrador.
COPY scripts/ ./scripts/

# Diretórios de runtime (montados como volume no compose).
RUN mkdir -p backend/static/uploads backend/static/permanent_uploads log

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

# --timeout 600: geração de material e transcrição são longas e passariam
# do timeout padrão de 30s do gunicorn.
CMD ["gunicorn", \
     "--workers", "2", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "600", \
     "--max-requests", "500", \
     "--max-requests-jitter", "100", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "backend.main:app"]
