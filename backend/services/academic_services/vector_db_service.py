# qython/backend/services/academic_services/vector_db_service.py

import logging
import os
import chromadb
from langchain_text_splitters import RecursiveCharacterTextSplitter
from typing import List, Optional

from ...config import Config
from . import embedding_client as ec
import threading

logger = logging.getLogger("qython_logger")

# Lazy initialization to avoid worker conflicts
_client = None
_lock = threading.Lock()

def get_chroma_client():
    """Get or create the ChromaDB client (lazy, thread-safe).

    Production points at a STANDALONE ChromaDB server (one process) via HttpClient —
    set CHROMA_SERVER_HOST/PORT in .env. ChromaDB's PersistentClient is NOT safe for
    concurrent multi-process access: 4 gunicorn workers + the APScheduler sharing the
    same on-disk store segfaulted the worker (signal 139 → 502) and risk corruption.
    Without CHROMA_SERVER_HOST it falls back to PersistentClient (local dev / tooling).
    """
    global _client
    if _client is None:
        with _lock:
            if _client is None:  # Double-check locking
                host = os.getenv("CHROMA_SERVER_HOST")
                if host:
                    port = int(os.getenv("CHROMA_SERVER_PORT", "8001"))
                    logger.info(f"Initializing ChromaDB HttpClient ({host}:{port})...")
                    _client = chromadb.HttpClient(host=host, port=port)
                else:
                    logger.info("Initializing ChromaDB PersistentClient (%s)...", Config.CHROMA_PATH)
                    _client = chromadb.PersistentClient(path=Config.CHROMA_PATH)
                logger.info("ChromaDB client initialized successfully.")
    return _client

# ─────────────────────────────────────────────────────────────────────────────
# Busca da biblioteca: e5 (denso) + BM25 (esparso) fundidos por RRF, com rerank. Os vetores vêm do
# serviço de embeddings (embed_onnx.py, em ONNX, sem torch), cujo endereço é EMBED_SERVER_URL.
# ─────────────────────────────────────────────────────────────────────────────

def _collection_name(library_id: int) -> str:
    """library_{id}_e5: coleção de cosseno com vetores e5."""
    return f"library_{library_id}_{ec.EMBED_NAMESPACE}"


def _get_or_create_collection(client, library_id: int):
    # e5 é normalizado => espaço cosseno (HNSW). O default do Chroma é L2.
    return client.get_or_create_collection(name=_collection_name(library_id), metadata={"hnsw:space": "cosine"})


def _embed(texts, kind: str):
    """Vetores e5 do serviço de embeddings (prefixo query:/passage: e normalização no servidor)."""
    if not ec.is_v2_enabled():
        raise RuntimeError(
            "O serviço de busca da biblioteca não está configurado: defina EMBED_SERVER_URL "
            "(no Docker, o serviço 'embedder'; no app desktop, o assistente da IA baixa o modelo)."
        )
    return ec.embed_texts(list(texts), kind)


def _normalize_token_text(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize('NFKD', s or '')
    return ''.join(c for c in s if not unicodedata.combining(c)).lower()


def _tokenize(s: str):
    import re
    return [t for t in re.split(r'[^a-z0-9]+', _normalize_token_text(s)) if t]


def _rrf_fuse(ranked_lists, k: int = 60):
    """Reciprocal Rank Fusion: funde várias listas ordenadas de ids num ranking único."""
    scores: dict = {}
    for ranked in ranked_lists:
        for rank, item in enumerate(ranked):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.keys(), key=lambda x: scores[x], reverse=True)


def process_and_store_document(document_text: str, library_id: int, document_id: int,
                               pages=None, doc_title: Optional[str] = None):
    """
    Chunka, embeda e indexa um documento no ChromaDB.

    Coleção cosseno library_{id}_e5 com embeddings e5 e — quando `pages` ([(page_number, text), ...])
    é dado — chunk por página com cabeçalho de contexto (título + página) prefixado, o que
    habilita a citação e melhora a recuperação.
    """
    collection_name = _collection_name(library_id)
    client = get_chroma_client()

    try:
        collection = _get_or_create_collection(client, library_id)

        # Idempotência: remove chunks de TEXTO anteriores deste documento antes de
        # reindexar (reprocessamento, retry pós-rate-limit, reindex manual). Sem isso,
        # collection.add ignora IDs já existentes (mantendo conteúdo velho, ex.: um
        # placeholder de erro) e pode deixar chunks órfãos quando o novo texto é menor.
        # Filtra pelo padrão de ID p/ NÃO apagar descrições de imagem (doc_{id}_img_*).
        try:
            existing = collection.get(where={"document_id": document_id})
            text_chunk_ids = [
                cid for cid in existing.get('ids', []) if f"doc_{document_id}_chunk_" in cid
            ]
            if text_chunk_ids:
                collection.delete(ids=text_chunk_ids)
                logger.info(
                    f"Removidos {len(text_chunk_ids)} chunks de texto antigos do documento "
                    f"ID {document_id} antes de reindexar."
                )
        except Exception as e_del:
            logger.warning(f"Não foi possível limpar chunks antigos do documento ID {document_id}: {e_del}")

        chunk_size = int(os.getenv("RAG_CHUNK_SIZE", "1200"))
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size, chunk_overlap=200, length_function=len,
        )

        # Segmentos: por página (quando há `pages`) ou o texto inteiro.
        segments = pages if pages else [(None, document_text)]
        chunk_texts, chunk_metas = [], []
        for page_no, seg_text in segments:
            if not seg_text or not seg_text.strip():
                continue
            for piece in text_splitter.split_text(seg_text):
                if doc_title or page_no:
                    header = doc_title or ""
                    if page_no:
                        header = (f"{header} — p.{page_no}").strip(" —")
                    body = f"{header}\n{piece}" if header else piece
                else:
                    body = piece
                chunk_texts.append(body)
                meta = {"document_id": document_id, "library_id": library_id}
                if page_no:
                    meta["page"] = page_no
                if doc_title:
                    meta["doc_title"] = doc_title
                chunk_metas.append(meta)

        logger.info(f"Documento ID {document_id} dividido em {len(chunk_texts)} chunks.")
        if not chunk_texts:
            logger.warning(f"Nenhum chunk de texto gerado para o documento ID {document_id}.")
            return

        chunk_embeddings = _embed(chunk_texts, "passage")
        chunk_ids = [f"doc_{document_id}_chunk_{i}" for i in range(len(chunk_texts))]

        collection.add(
            embeddings=chunk_embeddings,
            documents=chunk_texts,
            metadatas=chunk_metas,
            ids=chunk_ids,
        )
        logger.info(f"{len(chunk_texts)} chunks do documento ID {document_id} foram adicionados à coleção '{collection_name}'.")

    except Exception as e:
        logger.error(f"Erro ao processar e armazenar o documento ID {document_id}: {e}", exc_info=True)
        raise


def query_library(query_text: str, library_id: int, n_results: int = 5, with_metadata: bool = False) -> list:
    """
    Busca os chunks mais relevantes de uma biblioteca.

    Denso (e5/cosseno) + BM25 esparso fundidos por RRF e depois re-ranqueados por cross-encoder
    → top-n. Acerta termo/sigla médica (BM25) e semântica (e5) ao mesmo tempo.

    with_metadata=True devolve pares (texto, metadados do chunk: document_id, page,
    doc_title), para quem precisa dizer de onde o trecho veio.
    """
    collection_name = _collection_name(library_id)
    client = get_chroma_client()

    try:
        collection = client.get_collection(name=collection_name)
    except chromadb.errors.NotFoundError:
        logger.warning(f"Coleção '{collection_name}' não encontrada durante a busca. Retornando vazio.")
        return []
    except Exception as e:
        logger.warning(f"Erro ao abrir a coleção '{collection_name}': {e}")
        return []

    # ── Híbrido + rerank ──
    try:
        retrieve_k = max(ec.RAG_RETRIEVE_K, n_results)
        q_emb = _embed([query_text], "query")[0]
        dense = collection.query(query_embeddings=[q_emb], n_results=retrieve_k)
        dense_ids = dense.get('ids', [[]])[0]
        dense_docs = dense.get('documents', [[]])[0]
        id_to_doc = dict(zip(dense_ids, dense_docs))
        id_to_meta = dict(zip(dense_ids, (dense.get('metadatas') or [[]])[0] or []))
        ranked_lists = [dense_ids]

        if ec.RAG_HYBRID:
            try:
                allc = collection.get()
                all_ids = allc.get('ids', []) or []
                all_docs = allc.get('documents', []) or []
                all_metas = allc.get('metadatas', []) or []
                bm25_max = int(os.getenv("RAG_BM25_MAX", "8000"))
                if all_ids and len(all_ids) <= bm25_max:
                    from rank_bm25 import BM25Okapi
                    bm25 = BM25Okapi([_tokenize(d) for d in all_docs])
                    scores = bm25.get_scores(_tokenize(query_text))
                    top_idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:retrieve_k]
                    bm25_ids = [all_ids[i] for i in top_idx if scores[i] > 0]
                    if bm25_ids:
                        ranked_lists.append(bm25_ids)
                    for i in top_idx:
                        id_to_doc.setdefault(all_ids[i], all_docs[i])
                        if i < len(all_metas):
                            id_to_meta.setdefault(all_ids[i], all_metas[i])
                elif all_ids:
                    logger.info(f"BM25 pulado: '{collection_name}' tem {len(all_ids)} > {bm25_max} chunks.")
            except Exception as e_bm:
                logger.warning(f"BM25 falhou (seguindo só com denso): {e_bm}")

        fused_ids = _rrf_fuse(ranked_lists)[:retrieve_k]
        candidate_ids = [i for i in fused_ids if i in id_to_doc]
        candidate_docs = [id_to_doc[i] for i in candidate_ids]
        if not candidate_docs:
            return []

        order = ec.rerank(query_text, candidate_docs, n_results)
        picked = order[:n_results] if order is not None else range(min(n_results, len(candidate_docs)))
        final = [candidate_docs[i] for i in picked]
        logger.info(
            f"Busca v2 em '{collection_name}': {len(final)} chunks "
            f"(dense={len(dense_ids)}, fused={len(fused_ids)}, rerank={'on' if order is not None else 'off'})."
        )
        if with_metadata:
            return [(candidate_docs[i], id_to_meta.get(candidate_ids[i]) or {}) for i in picked]
        return final
    except Exception as e:
        logger.warning(f"Erro na busca v2 da coleção '{collection_name}': {e}", exc_info=True)
        return []


def delete_document_vectors(library_id: int, document_id: int):
    """
    Exclui todos os chunks de um documento específico de uma coleção no ChromaDB.
    """
    collection_name = _collection_name(library_id)
    client = get_chroma_client()
    
    try:
        collection = client.get_collection(name=collection_name)
        results = collection.get(where={"document_id": document_id})
        chunk_ids_to_delete = results.get('ids', [])

        if not chunk_ids_to_delete:
            logger.warning(f"Nenhum vetor encontrado para o documento ID {document_id} na coleção '{collection_name}'. Nada a fazer.")
            return

        collection.delete(ids=chunk_ids_to_delete)
        logger.info(f"{len(chunk_ids_to_delete)} vetores do documento ID {document_id} foram removidos da coleção '{collection_name}'.")

    except chromadb.errors.NotFoundError:
        logger.warning(f"Coleção '{collection_name}' não encontrada durante a exclusão de vetores. Isso é esperado se nenhum documento foi processado. Ignorando.")
        return
        
    except Exception as e:
        logger.error(f"Erro inesperado ao excluir vetores do documento ID {document_id}: {e}", exc_info=True)
        raise


def delete_library_collection(library_id: int):
    """
    Drop a library's ENTIRE ChromaDB collection in one operation.

    Safer/faster than per-document get+delete: it does NOT load the HNSW index into
    memory, which was segfaulting the gunicorn worker (502) when deleting libraries
    under concurrent multi-process access. NotFoundError (collection never existed)
    is benign; other errors propagate so the caller can decide.
    """
    client = get_chroma_client()
    # Remove tanto a coleção legada quanto a v2 (_e5), pra limpar independente de qual
    # caminho indexou a biblioteca (a inexistente apenas loga e segue).
    for collection_name in {f"library_{library_id}", f"library_{library_id}_{ec.EMBED_NAMESPACE}"}:
        try:
            client.delete_collection(name=collection_name)
            logger.info(f"Coleção '{collection_name}' removida do ChromaDB.")
        except chromadb.errors.NotFoundError:
            logger.warning(f"Coleção '{collection_name}' não existe no ChromaDB. Nada a remover.")


def store_image_descriptions(library_id: int, images: list):
    """
    Index vision descriptions of document images into ChromaDB.

    Args:
        library_id: Library collection to index into.
        images: List of DocumentImage objects with vision_description set.
    """
    collection_name = _collection_name(library_id)
    client = get_chroma_client()

    try:
        collection = _get_or_create_collection(client, library_id)

        descriptions = []
        ids = []
        metadatas = []

        for img in images:
            if not img.vision_description or img.vision_description.startswith("NON-MEDICAL:"):
                continue

            descriptions.append(img.vision_description)
            ids.append(f"doc_{img.document_id}_img_{img.id}")
            metadatas.append({
                "document_id": img.document_id,
                "library_id": library_id,
                "content_type": "image_description",
                "page_number": img.page_number,
                "image_id": img.id,
            })

        if not descriptions:
            return

        embeddings = _embed(descriptions, "passage")

        collection.upsert(
            embeddings=embeddings,
            documents=descriptions,
            metadatas=metadatas,
            ids=ids,
        )

        logger.info(
            f"[VISION] Stored {len(descriptions)} image descriptions in collection '{collection_name}'."
        )

    except Exception as e:
        logger.error(f"[VISION] Error storing image descriptions for library {library_id}: {e}", exc_info=True)
        raise


def get_all_text_for_library(library_id: int) -> str:
    """
    Retrieves and concatenates all text from all documents in a library's collection.
    Includes image descriptions as structured context for material generation.
    """
    collection_name = _collection_name(library_id)
    client = get_chroma_client()

    try:
        collection = client.get_collection(name=collection_name)
        all_entries = collection.get()

        if not all_entries or not all_entries.get('documents'):
            logger.warning(f"No text found in collection '{collection_name}'.")
            return ""

        docs_content = {}
        image_descriptions = {}

        for i, doc_text in enumerate(all_entries['documents']):
            metadata = all_entries['metadatas'][i]
            doc_id = metadata.get("document_id")
            content_type = metadata.get("content_type")

            if content_type == "image_description":
                if doc_id not in image_descriptions:
                    image_descriptions[doc_id] = []
                page = metadata.get("page_number", "?")
                image_descriptions[doc_id].append(f"[Image p.{page}]: {doc_text}")
            else:
                if doc_id not in docs_content:
                    docs_content[doc_id] = []
                docs_content[doc_id].append(doc_text)

        full_text_parts = []
        for doc_id in sorted(docs_content.keys()):
            doc_text = " ".join(docs_content[doc_id])
            # Append image descriptions for this document if any
            if doc_id in image_descriptions:
                img_section = "\n".join(image_descriptions[doc_id])
                doc_text += f"\n\n--- MEDICAL IMAGES IN THIS DOCUMENT ---\n{img_section}"
            full_text_parts.append(doc_text)

        # Also include image descriptions from documents that had no text chunks
        for doc_id in sorted(image_descriptions.keys()):
            if doc_id not in docs_content:
                img_section = "\n".join(image_descriptions[doc_id])
                full_text_parts.append(f"--- MEDICAL IMAGES (Document {doc_id}) ---\n{img_section}")

        total_images = sum(len(v) for v in image_descriptions.values())
        logger.info(
            f"Full text from {len(docs_content)} documents + {total_images} image descriptions "
            f"retrieved from collection '{collection_name}'."
        )
        return "\n\n--- END OF DOCUMENT ---\n\n".join(full_text_parts)

    except Exception as e:
        logger.error(f"Error retrieving full text from collection '{collection_name}': {e}", exc_info=True)
        return ""