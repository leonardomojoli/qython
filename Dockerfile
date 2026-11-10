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
#   (o OCR não precisa de pacote do sistema: o RapidOCR vem em ONNX dentro do requirements.lock)
#   libmagic   — detecção de tipo de arquivo (python-magic)
#   poppler    — rasterização de PDF para thumbnail
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libmagic1 \
        poppler-utils \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Modelos médios do OCR (PP-OCRv6, 139 MB): erram bem menos em texto miúdo de página escaneada
# que o modelo pequeno que já vem no pacote do rapidocr, que fica como reserva se estes
# arquivos faltarem. Espelho, sem alteração, dos modelos do RapidOCR v3.10.0 (ModelScope, na China)
# numa pré-release do próprio repositório; conferidos por SHA-256.
ENV QYTHON_OCR_MODELS=/opt/qython/ocr-models
RUN mkdir -p "$QYTHON_OCR_MODELS" \
    && base=https://github.com/leonardomojoli/qython/releases/download/ocr-models-ppocrv6-v3.10.0 \
    && curl -fsSL --retry 3 -o "$QYTHON_OCR_MODELS/PP-OCRv6_det_medium.onnx" "$base/PP-OCRv6_det_medium.onnx" \
    && curl -fsSL --retry 3 -o "$QYTHON_OCR_MODELS/PP-OCRv6_rec_medium.onnx" "$base/PP-OCRv6_rec_medium.onnx" \
    && cd "$QYTHON_OCR_MODELS" \
    && printf '%s  %s\n' \
        92078b7355007ccfffcd4c8cd441a3afd4538904d06881b29a155e1e679907c2 PP-OCRv6_det_medium.onnx \
        eef444829dbbe18d7fea59a3f6eb75647518d2b3a9568d27c92e42940204894b PP-OCRv6_rec_medium.onnx \
        | sha256sum -c -

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

# Camada de dependências separada: só reinstala quando o lock muda.
# Instala do requirements.lock (versões exatas, transitivos incluídos), nunca do
# requirements.txt: sem o lock, cada build pegava o que estivesse mais novo no
# PyPI e uma atualização do SQLAlchemy derrubou o boot sem mudança no código.
# O lock já traz o índice CPU do PyTorch (torch "+cpu", sem nvidia-*).
# Para regenerar: scripts/lock_requirements.sh
COPY requirements.lock .
RUN pip install --upgrade pip && pip install -r requirements.lock

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
