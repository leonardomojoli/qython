"""
Standalone embedding + reranking service for Qython (RAG v2).

Runs as ONE process (embedder.service) so the e5 embedder + cross-encoder reranker load
ONCE — not once per gunicorn worker (4× would OOM the 8 GB box alongside whisper). The
backend talks to it via EMBED_SERVER_URL (services/.../embedding_client.py); when that env
is unset the backend falls back to the legacy in-process MiniLM path (RAG v1), so this
service is strictly additive and the old behavior stays intact.

Endpoints:
  GET  /health
  POST /embed   {"texts": [...], "kind": "query"|"passage"} -> {"embeddings": [[...]], "dim": N}
  POST /rerank  {"query": str, "documents": [...], "top_k": int|null} -> {"results": [{"index","score"}]}

e5 models REQUIRE asymmetric prefixes ("query: " / "passage: ") and expect L2-normalized
vectors (so cosine == dot product). Both are applied here, server-side, so callers can't
get them wrong. The blocking (CPU-bound) encode/predict run in a worker thread under a
lock, so /health stays responsive and jobs serialize (no CPU thrashing vs. whisper).

Env (from /opt/qython/.env via systemd EnvironmentFile):
  EMBED_MODEL          (default 'intfloat/multilingual-e5-base')
  RERANK_MODEL         (default 'cross-encoder/mmarco-mMiniLMv2-L12-H384-v1')
  EMBED_CPU_THREADS    (default 4)
  EMBED_BATCH_SIZE     (default 32)
  ENABLE_RERANK        (default '1')
"""

import os
import asyncio
import logging
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("embed_server")

EMBED_MODEL = os.getenv("EMBED_MODEL", "intfloat/multilingual-e5-base")
RERANK_MODEL = os.getenv("RERANK_MODEL", "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1")
CPU_THREADS = int(os.getenv("EMBED_CPU_THREADS", "4"))
BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "32"))
ENABLE_RERANK = os.getenv("ENABLE_RERANK", "1").strip() not in ("0", "false", "False", "")

# Limita threads de CPU (evita brigar com whisper/gunicorn pela CPU do box de 4 vCPU).
os.environ.setdefault("OMP_NUM_THREADS", str(CPU_THREADS))

app = FastAPI(title="Qython Embedding Service")

_embedder = None
_reranker = None
# Serializa o trabalho pesado: um modelo, um lote por vez (sem contenção de CPU).
_embed_lock = asyncio.Lock()
_rerank_lock = asyncio.Lock()


def _set_torch_threads():
    try:
        import torch
        torch.set_num_threads(CPU_THREADS)
    except Exception:
        pass


def get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        _set_torch_threads()
        logger.info("Carregando embedder '%s'...", EMBED_MODEL)
        _embedder = SentenceTransformer(EMBED_MODEL, device="cpu")
        logger.info(
            "Embedder carregado (dim=%s).",
            _embedder.get_sentence_embedding_dimension(),
        )
    return _embedder


def get_reranker():
    global _reranker
    if _reranker is None:
        from sentence_transformers import CrossEncoder
        _set_torch_threads()
        logger.info("Carregando reranker '%s'...", RERANK_MODEL)
        _reranker = CrossEncoder(RERANK_MODEL, device="cpu", max_length=512)
        logger.info("Reranker carregado.")
    return _reranker


def _prefix(texts: List[str], kind: str) -> List[str]:
    """e5 exige prefixo assimétrico query:/passage:. Modelos não-e5 ignoram."""
    if "e5" in EMBED_MODEL.lower():
        p = "query: " if kind == "query" else "passage: "
        return [p + (t or "") for t in texts]
    return [t or "" for t in texts]


def _run_embed(texts: List[str], kind: str):
    model = get_embedder()
    vecs = model.encode(
        _prefix(texts, kind),
        batch_size=BATCH_SIZE,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return vecs.tolist()


def _run_rerank(query: str, documents: List[str]):
    model = get_reranker()
    pairs = [(query, d or "") for d in documents]
    scores = model.predict(pairs, batch_size=BATCH_SIZE, show_progress_bar=False)
    return [float(s) for s in scores]


class EmbedRequest(BaseModel):
    texts: List[str]
    kind: str = "passage"


class RerankRequest(BaseModel):
    query: str
    documents: List[str]
    top_k: Optional[int] = None


@app.on_event("startup")
def _startup():
    # Carrega na subida — 1ª request não espera e falha rápido se o modelo quebrar.
    get_embedder()
    if ENABLE_RERANK:
        get_reranker()


@app.get("/health")
def health():
    dim = None
    try:
        dim = get_embedder().get_sentence_embedding_dimension()
    except Exception:
        pass
    return {
        "status": "ok",
        "embed_model": EMBED_MODEL,
        "rerank_model": RERANK_MODEL if ENABLE_RERANK else None,
        "dim": dim,
    }


@app.post("/embed")
async def embed(req: EmbedRequest):
    if not req.texts:
        return {"embeddings": [], "dim": 0}
    if req.kind not in ("query", "passage"):
        raise HTTPException(status_code=400, detail="kind deve ser 'query' ou 'passage'")
    try:
        async with _embed_lock:
            embs = await asyncio.to_thread(_run_embed, req.texts, req.kind)
        return {"embeddings": embs, "dim": len(embs[0]) if embs else 0}
    except Exception as e:
        logger.error("Falha no embed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"embed failed: {e}")


@app.post("/rerank")
async def rerank(req: RerankRequest):
    if not ENABLE_RERANK:
        raise HTTPException(status_code=503, detail="reranker desabilitado (ENABLE_RERANK=0)")
    if not req.documents:
        return {"results": []}
    try:
        async with _rerank_lock:
            scores = await asyncio.to_thread(_run_rerank, req.query, req.documents)
        order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        if req.top_k:
            order = order[: req.top_k]
        return {"results": [{"index": i, "score": scores[i]} for i in order]}
    except Exception as e:
        logger.error("Falha no rerank: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"rerank failed: {e}")
