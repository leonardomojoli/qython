# qython/backend/embed_onnx.py
"""
Serviço de embeddings e reranking em ONNX, sem torch: o mesmo contrato do `embed_server.py`
(`/health`, `/embed`, `/rerank`), para o app desktop.

A busca na biblioteca (RAG v2) usa o multilingual-e5-base, que entende português, mais um
reranker multilíngue (mmarco-mMiniLM). No servidor eles rodam pelo sentence-transformers e o
torch; no desktop o torch não vai no pacote (alguns GB), e o onnxruntime que o chromadb já
traz faz o mesmo trabalho com os modelos quantizados (int8).

Como o e5 pede, o prefixo `query: `/`passage: ` e a normalização L2 são aplicados aqui, no
servidor, para quem chama não errar. O pooling é a média ponderada pela máscara de atenção.

Ambiente:
  EMBED_MODEL_DIR     pasta com `model.onnx` e `tokenizer.json` do embedder (obrigatória)
  RERANK_MODEL_DIR    idem, do reranker (opcional; sem ele /rerank responde 503 e o backend
                      cai na ordem da fusão RRF)
  EMBED_CPU_THREADS   padrão 4
  EMBED_BATCH_SIZE    padrão 16
"""

from __future__ import annotations

import logging
import os
import threading
from typing import List, Optional

from pydantic import BaseModel

logger = logging.getLogger("embed_onnx")


# No nível do módulo, e não dentro de build_app(): com `from __future__ import annotations` o
# FastAPI resolve as anotações pelos globais do módulo, e um modelo local seria tratado como
# parâmetro de query (422 "Field required: query.req").
class EmbedRequest(BaseModel):
    texts: List[str]
    kind: str = "passage"


class RerankRequest(BaseModel):
    query: str
    documents: List[str]
    top_k: Optional[int] = None

MAX_LENGTH = 512
E5_DIM_FALLBACK = 768


def _session(path: str, threads: int):
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = threads
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(path, sess_options=opts, providers=["CPUExecutionProvider"])


def _tokenizer(path: str, max_length: int = MAX_LENGTH):
    from tokenizers import Tokenizer

    tok = Tokenizer.from_file(path)
    tok.enable_truncation(max_length=max_length)
    tok.enable_padding(pad_id=tok.token_to_id("<pad>") or 1, pad_token="<pad>")
    return tok


class Engine:
    """Um modelo ONNX com o seu tokenizer. Um lote por vez (o onnxruntime já usa os núcleos)."""

    def __init__(self, model_path: str, tokenizer_path: str, threads: int = 4):
        self.session = _session(model_path, threads)
        self.tokenizer = _tokenizer(tokenizer_path)
        self.input_names = {i.name for i in self.session.get_inputs()}
        self.lock = threading.Lock()

    def _feed(self, encodings) -> dict:
        import numpy as np

        feed = {
            "input_ids": np.array([e.ids for e in encodings], dtype=np.int64),
            "attention_mask": np.array([e.attention_mask for e in encodings], dtype=np.int64),
        }
        if "token_type_ids" in self.input_names:
            feed["token_type_ids"] = np.zeros_like(feed["input_ids"])
        return {k: v for k, v in feed.items() if k in self.input_names}


class Embedder(Engine):
    def encode(self, texts: List[str], kind: str, batch_size: int = 16) -> List[List[float]]:
        import numpy as np

        prefix = "query: " if kind == "query" else "passage: "
        out: List[List[float]] = []
        for start in range(0, len(texts), batch_size):
            batch = [prefix + (t or "") for t in texts[start:start + batch_size]]
            encodings = self.tokenizer.encode_batch(batch)
            with self.lock:
                hidden = self.session.run(None, self._feed(encodings))[0]  # (B, T, H)
            mask = np.array([e.attention_mask for e in encodings], dtype=np.float32)[:, :, None]
            pooled = (hidden * mask).sum(axis=1) / np.clip(mask.sum(axis=1), 1e-9, None)
            norm = np.linalg.norm(pooled, axis=1, keepdims=True)
            out.extend((pooled / np.clip(norm, 1e-12, None)).tolist())
        return out

    @property
    def dim(self) -> int:
        shape = self.session.get_outputs()[0].shape
        return int(shape[-1]) if isinstance(shape[-1], int) else E5_DIM_FALLBACK


class Reranker(Engine):
    def score(self, query: str, documents: List[str], batch_size: int = 16) -> List[float]:
        scores: List[float] = []
        for start in range(0, len(documents), batch_size):
            pairs = [(query, d or "") for d in documents[start:start + batch_size]]
            encodings = self.tokenizer.encode_batch(pairs)
            with self.lock:
                logits = self.session.run(None, self._feed(encodings))[0]
            scores.extend(float(row[0]) for row in logits)
        return scores


def build_app(embed_dir: Optional[str] = None, rerank_dir: Optional[str] = None, *,
              embedder=None, reranker=None):
    """FastAPI com os modelos das pastas (ou de EMBED_MODEL_DIR / RERANK_MODEL_DIR). Os
    argumentos `embedder` e `reranker` deixam os testes trocarem o modelo por um de mentira."""
    from fastapi import FastAPI, HTTPException

    threads = int(os.getenv("EMBED_CPU_THREADS", "4"))
    batch = int(os.getenv("EMBED_BATCH_SIZE", "16"))
    if embedder is None:
        embed_dir = embed_dir or os.getenv("EMBED_MODEL_DIR")
        rerank_dir = rerank_dir or os.getenv("RERANK_MODEL_DIR")
        if not embed_dir or not os.path.isfile(os.path.join(embed_dir, "model.onnx")):
            raise RuntimeError("EMBED_MODEL_DIR precisa apontar para a pasta com model.onnx e tokenizer.json.")
        logger.info("Carregando o embedder de %s...", embed_dir)
        embedder = Embedder(os.path.join(embed_dir, "model.onnx"), os.path.join(embed_dir, "tokenizer.json"), threads)
        if rerank_dir and os.path.isfile(os.path.join(rerank_dir, "model.onnx")):
            logger.info("Carregando o reranker de %s...", rerank_dir)
            reranker = Reranker(os.path.join(rerank_dir, "model.onnx"), os.path.join(rerank_dir, "tokenizer.json"), threads)

    app = FastAPI(title="Qython Embedding Service (ONNX)")

    @app.get("/health")
    def health():
        return {"status": "ok", "dim": embedder.dim, "rerank": reranker is not None, "engine": "onnx"}

    @app.post("/embed")
    def embed(req: EmbedRequest):
        if not req.texts:
            return {"embeddings": [], "dim": embedder.dim}
        vectors = embedder.encode(req.texts, req.kind, batch)
        return {"embeddings": vectors, "dim": len(vectors[0])}

    @app.post("/rerank")
    def rerank(req: RerankRequest):
        if reranker is None:
            raise HTTPException(status_code=503, detail="Reranker não instalado.")
        scores = reranker.score(req.query, req.documents, batch)
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        if req.top_k:
            ranked = ranked[: req.top_k]
        return {"results": [{"index": i, "score": scores[i]} for i in ranked]}

    return app
