# qython/backend/routes/public_routes.py
"""
Public API endpoints — no authentication required.
Used by the apps to learn what this installation requires before anyone logs in (/config)
and to show the terms of use before login (/terms).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services import edition_service

logger = logging.getLogger("qython_logger")
router = APIRouter()


@router.get("/config")
async def get_public_config(db: AsyncSession = Depends(get_db)):
    """Edição e travas de cadastro desta instalação (ver edition_service)."""
    return await edition_service.public_config(db)


@router.get("/terms")
async def get_public_terms(db: AsyncSession = Depends(get_db)):
    """Termo de uso vigente, para ler antes de entrar (página /terms-of-use)."""
    from ..models import ConsentDocumentType
    from ..services import consent_service
    document = await consent_service.get_active_document(db, ConsentDocumentType.terms_of_use)
    if document is None:
        raise HTTPException(status_code=404, detail="Nenhum termo de uso publicado.")
    return {
        "title": document.title,
        "version": document.version,
        "body": document.body,
        "published_at": document.published_at,
    }
