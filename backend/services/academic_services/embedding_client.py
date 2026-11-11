"""
Cliente do serviço de embeddings e rerank (backend/embed_onnx.py: multilingual-e5 e reranker em ONNX).

`is_v2_enabled()` diz se o serviço está configurado (EMBED_SERVER_URL). Sem ele a busca e a indexação
da biblioteca ficam indisponíveis (vector_db_service levanta um erro claro).

Mesmo padrão do whisper (transcription_service): um serviço FastAPI guarda o modelo uma vez, e os
workers do gunicorn e o agendador o chamam por HTTP, em vez de cada um carregar e5 + reranker.
"""

import os
import logging
from typing import List, Optional

import requests

logger = logging.getLogger("qython_logger")

# Endereço do serviço de embeddings/rerank. Vazio => sem busca na biblioteca.
EMBED_SERVER_URL = os.getenv("EMBED_SERVER_URL", "").strip().rstrip("/")
EMBED_REQUEST_TIMEOUT = int(os.getenv("EMBED_REQUEST_TIMEOUT", "120"))

# Sufixo das coleções (library_{id}_e5). As coleções antigas (library_{id}, modelo menor) têm outra
# dimensão e outro espaço, então ficam à parte até o reindex_to_v2.
EMBED_NAMESPACE = os.getenv("EMBED_NAMESPACE", "e5").strip()

# Sub-flags do pipeline v2 (default ligado). Desligáveis se RAM/latência apertar.
RAG_RERANK = os.getenv("RAG_RERANK", "1").strip() not in ("0", "false", "False", "")
RAG_HYBRID = os.getenv("RAG_HYBRID", "1").strip() not in ("0", "false", "False", "")
RAG_RETRIEVE_K = int(os.getenv("RAG_RETRIEVE_K", "20"))  # candidatos antes do rerank
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "5"))             # resultado final default


def is_v2_enabled() -> bool:
    return bool(EMBED_SERVER_URL)


def embed_texts(texts: List[str], kind: str) -> List[List[float]]:
    """Embeda via serviço e5 (prefixo query:/passage: + normalização feitos server-side).
    Levanta em falha — o caller (indexação) trata como erro; em query, o caller captura."""
    if not texts:
        return []
    resp = requests.post(
        f"{EMBED_SERVER_URL}/embed",
        json={"texts": list(texts), "kind": kind},
        timeout=EMBED_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["embeddings"]


def rerank(query: str, documents: List[str], top_k: int) -> Optional[List[int]]:
    """Reordena `documents` por relevância e devolve os índices (melhor→pior).
    Retorna None se o reranker estiver desligado/indisponível — o caller cai no
    fallback (ordem do fusion RRF), em vez de quebrar a busca."""
    if not (RAG_RERANK and documents):
        return None
    try:
        resp = requests.post(
            f"{EMBED_SERVER_URL}/rerank",
            json={"query": query, "documents": list(documents), "top_k": top_k},
            timeout=EMBED_REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return [r["index"] for r in resp.json()["results"]]
    except Exception as e:
        logger.warning("Rerank indisponível, usando ordem do fusion: %s", e)
        return None


def health() -> Optional[dict]:
    """Diagnóstico: estado do serviço (ou None se inalcançável)."""
    if not EMBED_SERVER_URL:
        return None
    try:
        resp = requests.get(f"{EMBED_SERVER_URL}/health", timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("Embed service /health inalcançável: %s", e)
        return None
