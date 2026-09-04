# backend/routes/verification_routes.py
"""Latreo medical-verification endpoints.

- POST /api/verification/lastreo/session : the frontend asks Qython (which holds
  the Latreo client_admin credentials) to create a hosted verification session,
  and gets back an embed_url to mount in the Latreo SDK modal. Public during
  sign-up (captcha-gated); when called authenticated, it tags the session with
  the user id so later re-verification maps back cleanly.

- POST /api/internal/lastreo/webhook : Latreo notifies us when a doctor's
  verification is approved/rejected (incl. async basic-tier admin approval and
  Latreo Link inheritance). HMAC-signed; we map by latreo_doctor_id.

Biometrics never reach this backend — the doctor uploads them straight to Latreo
inside the embed. See docs/LATREO_INTEGRATION_PROPOSAL.md.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..config import Config
from ..database import get_db
from ..models import User
from ..rate_limiter import limiter
from ..security import get_current_user
from ..services import latreo_client
from ..services.captcha_service import verify_captcha
from ..services.notification_service import send_notification, NotificationType

logger = logging.getLogger("qython_logger")

router = APIRouter()

# Optional auth: the session endpoint is reachable both during anonymous sign-up
# and from an authenticated profile (re-verify). auto_error=False -> no 401 when
# the header is absent.
_oauth2_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def _optional_user(
    token: Optional[str] = Depends(_oauth2_optional),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not token:
        return None
    try:
        return await get_current_user(token=token, db=db)
    except Exception:
        return None


# Occupation is a localized free-text string in Qython (no canonical role enum),
# so the frontend tells us the verification `kind` explicitly. This set is only a
# server-side fallback for the authenticated re-verify path when the client omits it.
_STUDENT_OCCUPATIONS = {
    "estudante de medicina", "estudante", "medical student", "student",
    "estudiante de medicina", "estudiante",
}


def _kind_for_user(user: Optional[User]) -> str:
    """Infer the Latreo verification kind from a user's declared occupation."""
    occ = (getattr(user, "occupation", "") or "").strip().lower()
    return "student" if occ in _STUDENT_OCCUPATIONS else "doctor"


class LatreoSessionRequest(BaseModel):
    captcha_token: Optional[str] = None
    locale: Optional[str] = None
    # "doctor" (default) or "student". The hosted page adapts: a student session
    # offers institutional-email or enrollment-proof + selfie instead of the CRM flow.
    kind: Optional[str] = None


class LatreoConfirmRequest(BaseModel):
    session_id: str


@router.post("/verification/lastreo/session")
@limiter.limit("10/minute")
async def create_latreo_session(
    request: Request,
    body: LatreoSessionRequest,
    current_user: Optional[User] = Depends(_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Latreo verification session and return its embed_url."""
    if not latreo_client.is_enabled():
        raise HTTPException(status_code=503, detail="Verificação médica indisponível no momento.")

    # Anonymous (sign-up) callers: validate the Turnstile token when present.
    # It may be absent here because the registration captcha only renders after
    # the terms checkbox, while the doctor can tap "verify" earlier — so the
    # per-IP rate limit above is the baseline guard, and a supplied token must
    # still be valid (blocks forged/replayed tokens).
    if current_user is None and body.captcha_token:
        if not verify_captcha(body.captcha_token):
            raise HTTPException(status_code=400, detail="CAPTCHA inválido")

    # Resolve the verification kind: trust the client's explicit choice (it knows
    # whether the person is signing up as doctor or student), else infer from the
    # authenticated user's occupation, else default to doctor.
    requested_kind = (body.kind or "").strip().lower()
    if requested_kind in ("doctor", "student"):
        kind = requested_kind
    elif current_user is not None:
        kind = _kind_for_user(current_user)
    else:
        kind = "doctor"

    try:
        # Tier: NÃO forçamos um mínimo (required_tier omitido → bronze é aceito). Bronze já
        # basta p/ acessar o Qython — verificação automática no CFM (CRM+UF), sem upload/selfie;
        # e o confirm/webhook marca QUALQUER sessão 'completed' como 'verified'. (Os antigos
        # `allow_silver`/`allow_gold` do client NÃO têm efeito no Latreo v1.68 — que controla
        # tier por `required_tier` mínimo, não por "esconder" tiers superiores; ver guide §18.6.)
        sess = await latreo_client.create_verification_session(
            kind=kind,
            client_user_ref=str(current_user.id) if current_user else None,
            theme_primary_color=Config.LATREO_VERIFY_THEME_COLOR,
            allowed_origins=Config.ALLOWED_ORIGINS,
        )
    except latreo_client.LatreoNotConfigured:
        raise HTTPException(status_code=503, detail="Verificação médica indisponível no momento.")
    except latreo_client.LatreoError as e:
        logger.error(f"[LATREO] create session failed: {e}")
        raise HTTPException(status_code=502, detail="Não foi possível iniciar a verificação. Tente novamente.")

    return {
        "embed_url": sess.get("embed_url"),
        "session_id": sess.get("session_id"),
        "expires_at": sess.get("expires_at"),
    }


@router.post("/verification/lastreo/confirm")
@limiter.limit("20/minute")
async def confirm_latreo_session(
    request: Request,
    body: LatreoConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Confirm a session result for the logged-in user (post-signup re-verify).

    Reads the canonical result server-side and updates the user. Also records
    latreo_doctor_id so later webhooks (e.g. async basic-tier approval) map back.
    """
    if not latreo_client.is_enabled():
        raise HTTPException(status_code=503, detail="Verificação médica indisponível no momento.")
    try:
        sess = await latreo_client.get_verification_session(body.session_id)
    except latreo_client.LatreoError as e:
        logger.error(f"[LATREO] confirm fetch failed: {e}")
        raise HTTPException(status_code=502, detail="Não foi possível confirmar a verificação.")

    now = datetime.now(timezone.utc)
    current_user.latreo_session_id = body.session_id
    # latreo_doctor_id holds the stable Latreo identity id — doctor_user_id for a
    # doctor session, student_user_id for a student one (same id across the
    # student → doctor migration).
    latreo_uid = sess.get("doctor_user_id")
    if latreo_uid is None:
        latreo_uid = sess.get("student_user_id")
    if latreo_uid is not None:
        current_user.latreo_doctor_id = latreo_uid
    current_user.last_verification_check_at = now
    # 'completed' == verified — do NOT gate on final_tier. A STUDENT session returns
    # final_tier=null (the tier lives in /client/students), so resolve_verification_tier
    # resolves it (doctor → final_tier, student → student_tier, else falls back to
    # 'verified'). Gating on final_tier left every verified student stuck in 'pending'.
    # Mirrors the sign-up path in auth_routes.register_step1.
    if sess.get("status") == "completed":
        current_user.verification_status = "verified"
        current_user.verification_tier = await latreo_client.resolve_verification_tier(sess)
        current_user.verification_provider = "latreo"
        current_user.verified_at = current_user.verified_at or now
    await db.commit()

    return {
        "verification_status": current_user.verification_status,
        "verification_tier": current_user.verification_tier,
    }


_VERIFIED_TITLES = {
    'pt': 'Identidade médica verificada',
    'en': 'Medical identity verified',
    'es': 'Identidad médica verificada',
}
_VERIFIED_BODIES = {
    'pt': 'Seu registro profissional foi confirmado. Acesso completo liberado.',
    'en': 'Your professional registration was confirmed. Full access unlocked.',
    'es': 'Su registro profesional fue confirmado. Acceso completo desbloqueado.',
}
_REJECTED_TITLES = {
    'pt': 'Verificação não concluída',
    'en': 'Verification not completed',
    'es': 'Verificación no completada',
}
_REJECTED_BODIES = {
    'pt': 'Não foi possível confirmar seu registro profissional. Tente novamente pelo seu perfil.',
    'en': 'We could not confirm your professional registration. Try again from your profile.',
    'es': 'No pudimos confirmar su registro profesional. Inténtelo de nuevo desde su perfil.',
}
# Student-flavored copy (Latreo kind="student"): the subject is the academic
# enrollment ("vínculo acadêmico"), not a professional registry.
_VERIFIED_TITLES_STUDENT = {
    'pt': 'Vínculo acadêmico verificado',
    'en': 'Academic enrollment verified',
    'es': 'Vínculo académico verificado',
}
_VERIFIED_BODIES_STUDENT = {
    'pt': 'Seu vínculo como estudante de medicina foi confirmado. Acesso completo liberado.',
    'en': 'Your medical-student enrollment was confirmed. Full access unlocked.',
    'es': 'Su vínculo como estudiante de medicina fue confirmado. Acceso completo desbloqueado.',
}
_REJECTED_BODIES_STUDENT = {
    'pt': 'Não foi possível confirmar seu vínculo acadêmico. Tente novamente pelo seu perfil.',
    'en': 'We could not confirm your academic enrollment. Try again from your profile.',
    'es': 'No pudimos confirmar su vínculo académico. Inténtelo de nuevo desde su perfil.',
}


def _lang_short(user: User) -> str:
    lang = getattr(user, 'language_preference', 'pt-BR') or 'pt-BR'
    return lang.split('-')[0] if '-' in lang else lang


@router.post("/internal/lastreo/webhook")
async def latreo_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Receive Latreo verification webhooks (HMAC-signed)."""
    raw = await request.body()
    signature = request.headers.get("X-Lastreo-Signature")
    if not latreo_client.verify_webhook_signature(raw, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type") or request.headers.get("X-Lastreo-Event")
    data = event.get("data") or {}
    logger.info(f"[LATREO] webhook received type={event_type} delivery={request.headers.get('X-Lastreo-Delivery')}")

    if event_type not in ("verification.approved", "verification.rejected"):
        # submitted / unknown — nothing to change (doctor stays 'pending').
        return {"status": "ignored", "reason": "no-op event"}

    # Map the event to a Qython user. Latreo's payload always carries `user_id`
    # (the doctor id in Latreo); we store it as latreo_doctor_id when the session
    # is confirmed at sign-up / re-verify, so that mapping is the reliable path.
    # Since Latreo v1.61 the verification webhooks echo `client_user_ref` and
    # `session_id` (the public "vs_..." string — the SAME value returned by
    # POST /client/verification-sessions, not the numeric PK). We prefer those for
    # order-independent correlation, falling back to the doctor id.
    latreo_doctor_id = data.get("user_id")
    user = None

    # `client_user_ref` is the value we passed at session creation. For the
    # authenticated re-verify flow that's the Qython user id.
    client_user_ref = data.get("client_user_ref")
    if client_user_ref is not None:
        try:
            user = (await db.execute(
                select(User).where(User.id == int(client_user_ref))
            )).scalars().first()
        except (TypeError, ValueError):
            user = None

    # `session_id` (vs_...) is the same value we stored in latreo_session_id at
    # confirm time. `verification_session_id` kept as a fallback (pre-28/05 name).
    session_ref = data.get("session_id") or data.get("verification_session_id")
    if user is None and session_ref:
        user = (await db.execute(
            select(User).where(User.latreo_session_id == str(session_ref))
        )).scalars().first()

    if user is None and latreo_doctor_id is not None:
        user = (await db.execute(
            select(User).where(User.latreo_doctor_id == latreo_doctor_id)
        )).scalars().first()

    if user is None:
        logger.info(
            f"[LATREO] webhook {event_type} unmapped "
            f"(doctor={latreo_doctor_id}, session={session_ref}, ref={client_user_ref}); ignoring"
        )
        return {"status": "ignored", "reason": "unmapped subject"}

    now = datetime.now(timezone.utc)
    user.last_verification_check_at = now
    user.verification_provider = "latreo"
    # Backfill the doctor id when we mapped via session/ref, so subsequent
    # webhooks resolve directly by latreo_doctor_id.
    if latreo_doctor_id is not None and user.latreo_doctor_id != latreo_doctor_id:
        user.latreo_doctor_id = latreo_doctor_id
    # Latreo v1.64+ echoes the verification kind; absent → doctor (back-compat).
    is_student = (data.get("kind") or "").strip().lower() == "student"
    if event_type == "verification.approved":
        # Idempotent — re-applying 'verified' is harmless.
        user.verification_status = "verified"
        if data.get("tier"):
            user.verification_tier = data.get("tier")
        user.verified_at = user.verified_at or now
        ntype = NotificationType.KYC_VERIFIED
        titles = _VERIFIED_TITLES_STUDENT if is_student else _VERIFIED_TITLES
        bodies = _VERIFIED_BODIES_STUDENT if is_student else _VERIFIED_BODIES
    else:
        user.verification_status = "rejected"
        ntype = NotificationType.KYC_REJECTED
        titles = _REJECTED_TITLES  # "verification not completed" — same for both
        bodies = _REJECTED_BODIES_STUDENT if is_student else _REJECTED_BODIES

    await db.commit()

    try:
        lang = _lang_short(user)
        await send_notification(
            db, user.id, ntype,
            titles.get(lang, titles['pt']),
            bodies.get(lang, bodies['pt']),
            data={'route': '/profile'},
        )
        await db.commit()
    except Exception as ne:
        logger.error(f"[LATREO] failed to send verification notification: {ne}")

    return {"status": "ok"}
