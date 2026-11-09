"""Baixa o modelo de embeddings (all-MiniLM-L6-v2, ONNX) para dentro do pacote.

A busca na biblioteca usa o all-MiniLM-L6-v2. No Docker ele vem pelo sentence-transformers
(torch); no app desktop roda em ONNX, que o chromadb já traz, e o arquivo do modelo (~90 MB)
é baixado do S3 do Chroma na primeira chamada. Este script roda na hora de empacotar: o
próprio chromadb baixa e confere o SHA-256, e o PyInstaller leva a pasta junto.
"""
import os
import sys
from pathlib import Path

target = Path(__file__).resolve().parent / "onnx-model" / "all-MiniLM-L6-v2"

from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2  # noqa: E402

ONNXMiniLM_L6_V2.DOWNLOAD_PATH = target
fn = ONNXMiniLM_L6_V2()
vec = fn(["teste"])
if len(vec[0]) != 384:
    sys.exit(f"embedding inesperado: {len(vec[0])} dimensões")
# O arquivo .tar.gz já foi extraído; só a pasta onnx/ é lida.
(target / ONNXMiniLM_L6_V2.ARCHIVE_FILENAME).unlink(missing_ok=True)
print("onnx-model:", sorted(os.listdir(target / "onnx")))
