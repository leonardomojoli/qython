#!/usr/bin/env bash
# Regenera requirements.lock a partir de requirements.txt.
#
# requirements.txt diz O QUE o backend usa (com os limites que importam);
# requirements.lock fixa a versão exata de cada pacote, transitivos incluídos.
# A imagem Docker instala só do lock: sem ele, cada build pega o que estiver mais
# novo no PyPI naquele dia, e foi assim que uma atualização do SQLAlchemy derrubou
# o boot sem nenhuma mudança no código.
#
# Resolve para a plataforma da imagem (Linux x86_64, Python 3.12), não para a
# máquina de quem roda o script. O índice CPU do PyTorch entra para o torch vir
# na build "+cpu", sem as bibliotecas nvidia-*.
#
# Uso:  scripts/lock_requirements.sh             mantém as versões já fixadas
#       scripts/lock_requirements.sh --upgrade   sobe tudo para o mais novo possível
# (requer uv: pip install uv)
# Depois de rodar, confira o diff — versão que retrocede é sinal de conflito.
set -euo pipefail
cd "$(dirname "$0")/.."

uv pip compile requirements.txt -o requirements.lock \
  --python-version 3.12 \
  --python-platform x86_64-manylinux_2_28 \
  --extra-index-url https://download.pytorch.org/whl/cpu \
  --index-strategy unsafe-best-match \
  --emit-index-url \
  --custom-compile-command "scripts/lock_requirements.sh" \
  "$@"

if grep -qiE '^nvidia-' requirements.lock; then
  echo "ERRO: bibliotecas nvidia-* no lock — o torch não veio do índice CPU." >&2
  exit 1
fi
echo "requirements.lock atualizado: $(grep -cE '^[A-Za-z]' requirements.lock) pacotes."
