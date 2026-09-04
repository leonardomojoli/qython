# qython/backend/routes/public_routes.py
"""
Public API endpoints — no authentication required.
Used by patients to view prescriptions via QR code/shared links.
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
from ..security import verify_unsubscribe_token
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


@router.get("/email/unsubscribe")
async def unsubscribe_email(token: str, db: AsyncSession = Depends(get_db)):
    """One-click unsubscribe from lifecycle emails (no auth). Sets
    notification_preferences.email_enabled = False for the token's user."""
    user_id = verify_unsubscribe_token(token)
    if user_id is None:
        return HTMLResponse(
            _unsub_html("Link inválido", "Este link de descadastro é inválido.", ok=False),
            status_code=400,
        )
    user = await db.get(User, user_id)
    if user is not None:
        prefs = dict(user.notification_preferences or {})
        prefs["email_enabled"] = False
        user.notification_preferences = prefs  # fresh dict → persiste
        await db.commit()
        logger.info(f"[EMAIL] User {user_id} unsubscribed from lifecycle emails")
    lang = ((user.language_preference if user else None) or "pt").split("-")[0]
    title, body = _UNSUB_PAGE.get(lang, _UNSUB_PAGE["pt"])
    return HTMLResponse(_unsub_html(title, body))


@router.get("/prescription/{token}")
@limiter.limit("30/minute")
async def get_public_prescription(
    request: Request,
    token: str,
    lat: float = Query(None),
    lng: float = Query(None),
    radius_km: float = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    View a shared prescription via token (from QR code or link).
    No authentication required — this is for patients.

    Security: Only exposes doctor name, patient first name, and medication list.
    Does NOT expose CPF, phone, email, or internal IDs.
    """
    # Find the share
    result = await db.execute(
        select(PrescriptionShare).where(PrescriptionShare.share_token == token)
    )
    share = result.scalar_one_or_none()

    if not share:
        raise HTTPException(status_code=404, detail="Prescription not found")

    # Check if expired
    if share.status == 'revoked':
        raise HTTPException(status_code=410, detail="This link has been revoked")

    if share.status == 'expired' or share.expires_at < datetime.now(timezone.utc):
        if share.status != 'expired':
            share.status = 'expired'
            await db.commit()
        raise HTTPException(status_code=410, detail="This link has expired")

    # Increment view count
    share.view_count = (share.view_count or 0) + 1
    share.last_viewed_at = datetime.now(timezone.utc)
    await db.commit()

    # Fetch prescription data
    rx_result = await db.execute(
        select(Prescription).where(Prescription.id == share.prescription_id)
    )
    prescription = rx_result.scalar_one_or_none()
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription data not found")

    # Fetch doctor (only name)
    doctor_result = await db.execute(
        select(User).where(User.id == prescription.doctor_id)
    )
    doctor = doctor_result.scalar_one_or_none()

    # Fetch patient (only first name for privacy)
    patient_result = await db.execute(
        select(Patient).where(Patient.id == prescription.patient_id)
    )
    patient = patient_result.scalar_one_or_none()

    # Build safe medication list with Farmácia Popular info
    medications = []
    for item in (prescription.items or []):
        med_info = {
            "medication": item.get("medication", ""),
            "dosage": item.get("dosage", ""),
            "frequency": item.get("frequency", ""),
            "duration": item.get("duration", ""),
            "quantity": item.get("quantity", ""),
            "instructions": item.get("instructions", ""),
        }

        # Try to find Farmácia Popular info
        med_name = item.get("medication", "")
        if med_name:
            fp_result = await db.execute(
                select(Medication).where(
                    Medication.name.ilike(f"%{med_name}%"),
                    Medication.farmacia_popular == True,
                ).limit(1)
            )
            fp_med = fp_result.scalar_one_or_none()
            if fp_med:
                med_info["farmacia_popular"] = True
                med_info["farmacia_popular_copay"] = fp_med.farmacia_popular_copay
            else:
                med_info["farmacia_popular"] = False

        medications.append(med_info)

    # Get nearby pharmacies if coordinates provided
    nearby_pharmacies = None
    if lat is not None and lng is not None:
        nearby_pharmacies = await find_nearby_pharmacies(lat, lng, radius_km, db)

    # Build safe response — NO internal IDs, NO sensitive data
    patient_first_name = patient.full_name.split()[0] if patient else "Paciente"

    return {
        "prescription": {
            "patient_first_name": patient_first_name,
            "doctor_name": doctor.full_name if doctor else "Médico",
            "doctor_identifier": doctor.identifier_number if doctor and doctor.identifier_number else None,
            "prescription_type": prescription.prescription_type,
            "medications": medications,
            "notes": prescription.notes,
            "created_at": prescription.created_at.isoformat(),
        },
        "nearby_pharmacies": nearby_pharmacies,
        "share_info": {
            "view_count": share.view_count,
            "expires_at": share.expires_at.isoformat(),
        },
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
