"""Busca de imagem MÉDICA na biblioteca do próprio usuário, para ilustrar respostas.

Medicina é um domínio visual e o copiloto respondia só em texto. Em vez de gerar imagem
por IA (foto clínica inventada apresentada como real é passivo, não feature) ou de buscar
na web (licença/atribuição por resolver), a primeira fonte é o material que o usuário JÁ
subiu: o pipeline de documentos extrai as imagens dos PDFs e o `vision_service` descreve
cada uma, marcando `MEDICAL:` ou `NON-MEDICAL:`. São essas descrições que indexamos aqui.

⚠️ As descrições são geradas em INGLÊS pelo modelo de visão. A pergunta do médico vem em
português, então quem pede a imagem (o copiloto) emite a consulta em INGLÊS — sem isso o
recall despenca. Ver a regra `[IMAGEM: ...]` no prompt do chat.

A URL é ASSINADA (HMAC): a tag <img> do navegador não manda o cabeçalho de autenticação, e
imagem clínica da biblioteca de alguém não pode ficar acessível por caminho adivinhável.
"""

import hashlib
import hmac
import logging
import os
import time
from typing import List, Optional

from sqlalchemy import text as sqltext
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import Config
from ...security import SECRET_KEY

logger = logging.getLogger("qython_logger")

# Validade longa de propósito: a URL fica GRAVADA na resposta do chat e o usuário relê a
# conversa meses depois. Token curto quebraria o histórico; o escopo é uma imagem só, com
# o dono embutido na assinatura.
SIGNATURE_TTL_SECONDS = 365 * 24 * 3600
MAX_IMAGES_PER_ANSWER = 2
# Descrição muito curta costuma ser ícone/carimbo mal recortado, não achado clínico.
MIN_DESCRIPTION_CHARS = 80


def sign_image_id(image_id: int, user_id: int, expires_at: Optional[int] = None) -> str:
    """Token `<exp>.<hmac>` — assina o par (imagem, dono) para o <img> poder buscar sem JWT."""
    exp = int(expires_at or (time.time() + SIGNATURE_TTL_SECONDS))
    payload = f"{image_id}:{user_id}:{exp}".encode()
    mac = hmac.new(SECRET_KEY.encode(), payload, hashlib.sha256).hexdigest()[:32]
    return f"{exp}.{mac}"


def verify_image_token(image_id: int, user_id: int, token: str) -> bool:
    """Confere assinatura e validade em tempo constante."""
    try:
        exp_str, mac = (token or '').split('.', 1)
        exp = int(exp_str)
    except (ValueError, AttributeError):
        return False
    if exp < time.time():
        return False
    esperado = sign_image_id(image_id, user_id, expires_at=exp).split('.', 1)[1]
    return hmac.compare_digest(mac, esperado)


def image_url(image_id: int, user_id: int) -> str:
    return f"/api/academic/document-images/{image_id}?u={user_id}&t={sign_image_id(image_id, user_id)}"


def image_file_path(document_id: int, image_filename: str) -> str:
    return os.path.join(Config.DOCUMENT_IMAGES_FOLDER, str(document_id), image_filename)


async def find_medical_images(db: AsyncSession, user_id: int, query: str,
                              library_id: Optional[int] = None,
                              limit: int = 1) -> List[dict]:
    """Imagens médicas do usuário que casam com `query` (em inglês), mais relevante primeiro.

    Ranking por full-text search do Postgres sobre a descrição de visão (configuração
    `english`, que é o idioma das descrições). Quando a conversa está ancorada numa
    biblioteca, ela tem preferência — mas não é exclusiva: o achado visual pode estar no
    atlas de outra biblioteca do mesmo usuário.
    """
    if not query or not query.strip():
        return []
    sql = sqltext("""
        SELECT di.id, di.document_id, di.image_filename, di.page_number, di.vision_description,
               d.original_filename, l.id AS library_id, l.name AS library_name,
               ts_rank(to_tsvector('english', di.vision_description),
                       plainto_tsquery('english', :q)) AS rank,
               (l.id = :lib) AS same_library
        FROM document_images di
        JOIN academic_documents d ON d.id = di.document_id
        JOIN academic_libraries l ON l.id = di.library_id
        WHERE l.user_id = :uid
          AND di.vision_status = 'completed'
          AND di.vision_description IS NOT NULL
          AND di.vision_description NOT ILIKE 'NON-MEDICAL%'
          AND length(di.vision_description) >= :minlen
          AND to_tsvector('english', di.vision_description) @@ plainto_tsquery('english', :q)
        ORDER BY same_library DESC, rank DESC
        LIMIT :lim
    """)
    try:
        rows = (await db.execute(sql, {
            'q': query.strip()[:200], 'uid': user_id, 'lib': library_id or -1,
            'minlen': MIN_DESCRIPTION_CHARS, 'lim': max(1, limit),
        })).mappings().all()
    except Exception as e:
        logger.warning(f"[IMG_LOOKUP] busca falhou para '{query[:40]}': {e}")
        return []

    achadas = []
    for r in rows:
        caminho = image_file_path(r['document_id'], r['image_filename'])
        if not os.path.exists(caminho):   # derivado pode ter sido limpo pelo janitor
            logger.info(f"[IMG_LOOKUP] imagem {r['id']} sem arquivo em disco, ignorada")
            continue
        descricao = (r['vision_description'] or '').replace('MEDICAL:', '').strip()
        achadas.append({
            'id': r['id'],
            'url': image_url(r['id'], user_id),
            'alt': descricao[:180],
            'document': r['original_filename'],
            'page': (r['page_number'] or 0) + 1,   # page_number é 0-based
            'library': r['library_name'],
            'rank': float(r['rank'] or 0),
        })
    logger.info(f"[IMG_LOOKUP] '{query[:50]}' → {len(achadas)} imagem(ns)")
    return achadas
