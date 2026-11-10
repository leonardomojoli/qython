# qython/backend/routes/public_routes.py
"""
Public API endpoints — no authentication required.
Used by patients to view prescriptions via QR code/shared links, and by the web
app to learn what this installation requires before anyone logs in (/config).
Security: Only exposes minimal data (doctor name, patient first name, medication list).
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import (
    PrescriptionShare, Prescription, Patient, User,
    Pharmacy, PharmacyChain, Medication
)
from ..services.pharmacy_service import find_nearby_pharmacies
from ..services import edition_service
from ..rate_limiter import limiter

logger = logging.getLogger("qython_logger")
router = APIRouter()


_UNSUB_PAGE = {
    "pt": ("Inscrição cancelada", "Você não receberá mais e-mails de lembrete do Qython. Pode reativar quando quiser em Configurações."),
    "en": ("Unsubscribed", "You will no longer receive reminder emails from Qython. You can re-enable this anytime in Settings."),
    "es": ("Suscripción cancelada", "Ya no recibirás correos de recordatorio de Qython. Puedes reactivarlo cuando quieras en Configuración."),
}


def _unsub_html(title: str, body: str, ok: bool = True) -> str:
    color = "#03dac6" if ok else "#cf6679"
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{title}</title></head>
<body style="margin:0;font-family:'Segoe UI',Tahoma,sans-serif;background:#0a0a14;color:#cccccc;">
<table width="100%" height="100%" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" style="padding:40px;">
<table width="480" cellpadding="0" cellspacing="0" style="background:#12151f;border:1px solid #333;border-radius:16px;">
<tr><td style="padding:40px;text-align:center;">
<h1 style="color:{color};font-size:24px;margin:0 0 16px;">{title}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px;">{body}</p>
<a href="https://qython.ai" style="color:#bb86fc;text-decoration:none;font-weight:600;">qython.ai</a>
</td></tr></table></td></tr></table></body></html>"""


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






@router.get("/pharmacies/nearby")
@limiter.limit("30/minute")
async def get_nearby_pharmacies_public(
    request: Request,
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    Find pharmacies near coordinates, grouped by chain.
    Public endpoint for patient-facing page.
    """
    result = await find_nearby_pharmacies(lat, lng, radius_km, db)
    return result
