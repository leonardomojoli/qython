#!/usr/bin/env bash
# Regenera requirements.lock, o conjunto de pacotes Python do app desktop.
#
# Parte do requirements.txt do backend, tira o que o app não embute e compila um lock
# UNIVERSAL (Windows, macOS e Linux no mesmo arquivo, com marcadores de plataforma).
# Os pacotes que também estão no requirements.lock do Docker ficam na MESMA versão
# (constraint): o desktop não deve testar versões que o servidor nunca viu.
#
# O que sai, e por quê:
#   torch, sentence-transformers, transformers
#       só serviam ao embedder e ao whisper; os dois rodam sem torch (onnxruntime e
#       ctranslate2), em outro processo do mesmo executável, sob demanda. Eram ~3 GB.
#   (faster-whisper ENTRA: ctranslate2 + PyAV, que traz o ffmpeg dentro da roda, então não há
#   ffmpeg para instalar. A transcrição roda no modo `whisper` do executável.)
#   firebase-admin   login com Google e SMS do servidor hospedado (traz gRPC e o SDK do
#                    Google Cloud). O backend sobe sem ele (firebase_service).
#   presidio-*, spacy, pt_core_news_md
#                    redação de nomes antes de mandar texto a um serviço de IA externo. O Qython
#                    roda só com IA local: não há envio a redigir (a redação sobra para a
#                    exportação de dados de treino, e cai no detector por regex).
#   (opencv-python-headless ENTRA: o rapidocr o pede, para o OCR. A versão "cheia", com interface
#   gráfica, não entra: exigiria libGL no sistema e nada no backend a usa.)
#   python-magic     precisa da libmagic do sistema, que Windows e macOS não têm; o backend usa
#                    services/mime_sniff.py quando ele não carrega. Pior: no Windows o import dele
#                    TRAVA o PyInstaller (a análise de DLLs roda `import magic` num processo isolado).
#   gunicorn         o app usa o uvicorn direto (o gunicorn não roda no Windows).
#
# Uso:  packages/desktop/python/lock.sh             mantém as versões já fixadas
#       packages/desktop/python/lock.sh --upgrade   sobe tudo para o mais novo possível
# (requer uv: pip install uv)
set -euo pipefail
cd "$(dirname "$0")"
ROOT=../../..

grep -v -E '^(torch|sentence-transformers|transformers|gunicorn|firebase-admin|python-magic|presidio-analyzer|presidio-anonymizer|pt_core_news_md)([ >=<#@]|$)' \
  "$ROOT/requirements.txt" > requirements.in

# Versões do Docker como teto/piso. O lock do Docker pina também o torch "+cpu"; como o
# torch não é requisito aqui, a linha é inofensiva.
sed -E '/^(--|#)/d' "$ROOT/requirements.lock" | grep -E '^[A-Za-z0-9_.-]+==' > .constraints.tmp
trap 'rm -f .constraints.tmp' EXIT

uv pip compile requirements.in -c .constraints.tmp -o requirements.lock \
  --universal --python-version 3.12 --no-annotate \
  --custom-compile-command "packages/desktop/python/lock.sh" \
  "$@"

for banned in torch nvidia- firebase-admin presidio spacy 'opencv-python([ =<>]|$)' python-magic pytesseract; do
  if grep -qiE "^${banned}" requirements.lock; then
    echo "ERRO: $banned no lock do desktop" >&2
    exit 1
  fi
done
echo "requirements.lock atualizado: $(grep -cE '^[A-Za-z]' requirements.lock) pacotes."
