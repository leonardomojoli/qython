"""Baixa o vocabulário do tiktoken (cl100k_base) para dentro do pacote.

O backend conta tokens da conversa com `tiktoken.get_encoding("cl100k_base")`, que baixa o
arquivo do vocabulário na PRIMEIRA chamada (de openaipublic.blob.core.windows.net) e o
guarda em cache. Num app instalado isso significaria: sem internet, o copiloto quebra; com
internet, o primeiro uso faz uma requisição que o médico não pediu. Este script roda na
hora de empacotar: o próprio tiktoken baixa e confere o SHA-256, e o PyInstaller leva a
pasta junto. Em execução, backend/desktop.py aponta TIKTOKEN_CACHE_DIR para ela.
"""
import os
import sys

cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tiktoken-cache")
os.makedirs(cache, exist_ok=True)
os.environ["TIKTOKEN_CACHE_DIR"] = cache

import tiktoken  # noqa: E402

tiktoken.get_encoding("cl100k_base")
files = os.listdir(cache)
if not files:
    sys.exit("o tiktoken não gravou o vocabulário em " + cache)
print("tiktoken-cache:", files)
