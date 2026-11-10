"""Pareamento do celular (ver services/pairing_service.py).

  POST   /api/pairing/start          (logado)  gera o código de uso único
  POST   /api/pairing/claim          (aberto)  celular troca o código pelo segredo do aparelho
  POST   /api/pairing/token          (aberto)  celular renova o acesso com o segredo do aparelho
  GET    /api/pairing/devices        (logado)  aparelhos pareados
  DELETE /api/pairing/devices/{id}   (logado)  revoga um aparelho
"""
import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Config
from ..database import get_db
from ..models import PairedDevice, User
from ..rate_limiter import limiter
from ..security import create_access_token, get_current_active_user
from ..services import audit_service, consent_service, pairing_service

logger = logging.getLogger("qython_logger")
router = APIRouter()


class ClaimPayload(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    device_name: str = Field("Celular", max_length=200)
    platform: Optional[str] = Field(None, max_length=20)


class TokenPayload(BaseModel):
    device_token: str = Field(..., min_length=1, max_length=200)


def _raise(exc: pairing_service.PairingError):
    raise HTTPException(status_code=exc.status_code, detail=exc.detail)


async def _user_payload(db: AsyncSession, user: User) -> dict:
    """O mesmo recorte do usuário que o /auth/login devolve, para o app não ter dois formatos."""
    return {
        "id": user.id,
        "email": user.email,
        "is_admin": user.is_admin,
        "full_name": user.full_name,
        "status": user.status,
        "profile_picture": user.profile_picture,
        "verification_status": user.verification_status,
        "access_granted": user.access_granted,
        "onboarding_completed": user.onboarding_completed,
        "subscription_plan": user.subscription_plan,
        "terms_pending": await consent_service.terms_pending(db, user.id),
    }


def _access_token(user: User, device: PairedDevice) -> str:
    return create_access_token(
        data={"sub": user.email, "user_id": user.id, "device_id": device.id},
        expires_delta=timedelta(minutes=Config.PAIRED_ACCESS_TOKEN_MINUTES),
    )


@router.post("/start")
async def start_pairing(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    code, expires_at = await pairing_service.create_code(db, current_user)
    await audit_service.log(
        db, action="pairing.code.created", actor_user_id=current_user.id, actor_role="user",
        request=request, commit=True,
    )
    return {
        "code": code,
        "display_code": pairing_service.format_code(code),
        "expires_at": expires_at.isoformat(),
        "expires_in_seconds": int(pairing_service.CODE_TTL.total_seconds()),
    }


@router.post("/claim")
@limiter.limit("10/minute")
async def claim_pairing(request: Request, payload: ClaimPayload, db: AsyncSession = Depends(get_db)):
    try:
        user, device, secret = await pairing_service.claim(db, payload.code, payload.device_name, payload.platform)
    except pairing_service.PairingError as exc:
        await audit_service.log(
            db, action="pairing.claim.failed", actor_role="anonymous",
            metadata={"reason": exc.detail[:80]}, request=request, commit=True,
        )
        _raise(exc)
    await audit_service.log(
        db, action="pairing.device.created", actor_user_id=user.id, actor_role="user",
        target_type="paired_device", target_id=device.id,
        metadata={"name": device.name, "platform": device.platform}, request=request, commit=True,
    )
    return {
        "device_id": device.id,
        "device_token": secret,
        "access_token": _access_token(user, device),
        "token_type": "bearer",
        "expires_in": Config.PAIRED_ACCESS_TOKEN_MINUTES * 60,
        "user": await _user_payload(db, user),
    }


@router.post("/token")
@limiter.limit("60/minute")
async def renew_access(request: Request, payload: TokenPayload, db: AsyncSession = Depends(get_db)):
    try:
        user, device = await pairing_service.exchange(db, payload.device_token)
    except pairing_service.PairingError as exc:
        _raise(exc)
    return {
        "access_token": _access_token(user, device),
        "token_type": "bearer",
        "expires_in": Config.PAIRED_ACCESS_TOKEN_MINUTES * 60,
        "user": await _user_payload(db, user),
    }


@router.get("/devices")
async def list_devices(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    devices = await pairing_service.list_devices(db, current_user)
    return [
        {
            "id": d.id, "name": d.name, "platform": d.platform,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
        }
        for d in devices
    ]


@router.delete("/devices/{device_id}")
async def revoke_device(
    device_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        device = await pairing_service.revoke(db, current_user, device_id)
    except pairing_service.PairingError as exc:
        _raise(exc)
    await audit_service.log(
        db, action="pairing.device.revoked", actor_user_id=current_user.id, actor_role="user",
        target_type="paired_device", target_id=device.id, metadata={"name": device.name},
        request=request, commit=True,
    )
    return {"revoked": True}
