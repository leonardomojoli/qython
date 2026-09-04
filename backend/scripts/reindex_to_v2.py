# qython/backend/scripts/reindex_to_v2.py
"""
Migração one-time RAG v1 → v2: popula as coleções `library_{id}_e5` (e5 / cosseno / híbrido /
rerank) a partir das bibliotecas existentes. NÃO toca nas coleções legadas `library_{id}`
(rollback = só desligar EMBED_SERVER_URL).

Estratégia por documento (apenas status='processed'):
  • PDF/PPTX com arquivo na origem  -> REPROCESSA (extrai por página) → ganha metadata de
    página + chunking novo + e5.
  • Áudio/docx/txt (ou origem ausente) -> RE-EMBEDA os chunks legados já no ChromaDB com o
    e5 (rápido, NÃO re-transcreve; ganha modelo + cosseno + híbrido + rerank).

Pré-requisitos:
  • embedder.service no ar e EMBED_SERVER_URL setado no ambiente (senão escreveria na coleção
    legada — o script aborta se o v2 não estiver ativo).

Uso (no servidor, venv ativo, a partir de /opt/qython):
  EMBED_SERVER_URL=http://127.0.0.1:8003 python3 backend/scripts/reindex_to_v2.py
  ... [--library-id N]      só uma biblioteca
  ... [--reembed-only]      nunca reprocessa PDF (só re-embeda chunks legados; mais rápido)
"""

import argparse
import asyncio
import logging
import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

from sqlalchemy import select  # noqa: E402
from backend.database import AsyncSessionLocal  # noqa: E402
from backend.models import AcademicLibrary, AcademicDocument  # noqa: E402
from backend.services.academic_services import (  # noqa: E402
    vector_db_service,
    file_processing_service,
    embedding_client as ec,
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("reindex_to_v2")


def _reembed_legacy_doc(client, library_id: int, document_id: int) -> int:
    """Re-embeda no v2 os chunks legados (texto + descrição de imagem) deste documento, sem
    re-extrair da origem. Idempotente (upsert com os mesmos ids). Retorna nº de chunks."""
    try:
        legacy = client.get_collection(name=f"library_{library_id}")
    except Exception:
        return 0
    got = legacy.get(where={"document_id": document_id})
    ids = got.get('ids', []) or []
    docs = got.get('documents', []) or []
    metas = got.get('metadatas', []) or [{} for _ in ids]
    if not ids:
        return 0
    embeddings = ec.embed_texts(docs, "passage")
    coll = vector_db_service._get_or_create_collection(client, library_id)
    coll.upsert(embeddings=embeddings, documents=docs, metadatas=metas, ids=ids)
    return len(ids)


def _reprocess_doc(library_id: int, document_id: int, storage_path: str, ext: str, doc_title):
    """Reprocessa um PDF/PPTX da origem: extrai por página e regrava no v2. Retorna nº de chunks
    (aprox.) ou -1 se não saiu texto."""
    if ext == 'pdf':
        pages = file_processing_service.extract_pages_from_pdf(storage_path)
    else:
        pages = file_processing_service.extract_pages_from_pptx(storage_path)
    text = "\n".join(t for _, t in (pages or [])).strip()
    if not text:
        return -1
    try:
        vector_db_service.delete_document_vectors(library_id, document_id)
    except Exception:
        pass
    vector_db_service.process_and_store_document(
        document_text=text, library_id=library_id, document_id=document_id,
        pages=pages, doc_title=doc_title,
    )
    return len(text)


async def main(only_library_id=None, reembed_only=False):
    if not ec.is_v2_enabled():
        logger.error("EMBED_SERVER_URL não está setado — o v2 está inativo. Aborte e configure "
                     "o embedder.service antes de migrar.")
        sys.exit(1)
    health = ec.health()
    if not health:
        logger.error("embedder.service inalcançável em %s — suba o serviço antes.", ec.EMBED_SERVER_URL)
        sys.exit(1)
    logger.info("v2 ativo. Embedder: %s (dim=%s).", health.get("embed_model"), health.get("dim"))

    client = vector_db_service.get_chroma_client()
    totals = {"libraries": 0, "docs": 0, "reprocessed": 0, "reembedded": 0, "skipped": 0, "failed": 0}

    async with AsyncSessionLocal() as db:
        q = select(AcademicLibrary)
        if only_library_id:
            q = q.filter_by(id=only_library_id)
        libraries = (await db.execute(q)).scalars().all()

        for lib in libraries:
            totals["libraries"] += 1
            docs = (await db.execute(
                select(AcademicDocument).filter_by(library_id=lib.id)
            )).scalars().all()
            logger.info("Biblioteca %s ('%s'): %d documentos.", lib.id, lib.name, len(docs))

            for doc in docs:
                if doc.status != 'processed':
                    totals["skipped"] += 1
                    continue
                totals["docs"] += 1
                doc_title = os.path.splitext(doc.original_filename or "")[0].strip() or None
                ext = os.path.splitext(doc.storage_path or "")[1].lower().lstrip('.')
                on_disk = bool(doc.storage_path) and os.path.exists(doc.storage_path)
                try:
                    if (not reembed_only) and ext in ('pdf', 'pptx') and on_disk:
                        n = _reprocess_doc(lib.id, doc.id, doc.storage_path, ext, doc_title)
                        if n == -1:
                            # Sem texto extraído da origem → tenta re-embedar o legado.
                            n = _reembed_legacy_doc(client, lib.id, doc.id)
                            totals["reembedded"] += 1
                            logger.info("  doc %s (%s): reprocess vazio → re-embed legado (%s chunks).", doc.id, ext, n)
                        else:
                            totals["reprocessed"] += 1
                            logger.info("  doc %s (%s): reprocessado da origem.", doc.id, ext)
                    else:
                        n = _reembed_legacy_doc(client, lib.id, doc.id)
                        totals["reembedded"] += 1
                        logger.info("  doc %s (%s): re-embed legado (%s chunks).", doc.id, ext or "?", n)
                except Exception as e:
                    totals["failed"] += 1
                    logger.error("  doc %s: FALHOU: %s", doc.id, e, exc_info=True)

    logger.info("Concluído: %s", totals)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--library-id", type=int, default=None)
    ap.add_argument("--reembed-only", action="store_true")
    args = ap.parse_args()
    asyncio.run(main(only_library_id=args.library_id, reembed_only=args.reembed_only))
