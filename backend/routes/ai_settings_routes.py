# qython/backend/routes/ai_settings_routes.py
"""Configurações da IA (provedor, modelo, chaves): só o administrador, valem na hora.

O dono da instalação local é o administrador. As chaves de API são aceitas aqui e nunca
devolvidas: o GET só informa se existem.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..services import ai_settings_service as ai
from ..services import audit_service
from .admin_routes import get_current_admin_user

logger = logging.getLogger("qython_logger")
router = APIRouter()


class AiSettingsPatch(BaseModel):
    """Só os campos enviados mudam; texto vazio apaga o valor salvo (volta ao ambiente)."""

    provider: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    context_tokens: Optional[int | str] = None
    api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None


def _patch_dict(payload: AiSettingsPatch) -> dict:
    return payload.model_dump(exclude_unset=True)


@router.get("")
async def get_ai_settings(db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    return ai.view(await ai.load_stored(ai.db_store(db)))


@router.put("")
async def update_ai_settings(
    payload: AiSettingsPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    patch = _patch_dict(payload)
    store = ai.db_store(db, user_id=admin.id, request=request)
    try:
        stored = await ai.save(store, patch)
    except ai.AiSettingsError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit_service.log(
        db, action="ai.settings.update", actor_user_id=admin.id, actor_role="admin",
        # Só os nomes dos campos: nunca valores (e as chaves nem aparecem como campo alterado com valor).
        metadata={"fields": sorted(patch), "provider": stored.get("provider")},
        request=request, commit=True,
    )
    return ai.view(stored)


@router.delete("")
async def reset_ai_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """Apaga o que foi salvo pela interface: a IA volta ao que o ambiente (ou o app) define."""
    await ai.clear(ai.db_store(db, user_id=admin.id, request=request))
    await audit_service.log(
        db, action="ai.settings.reset", actor_user_id=admin.id, actor_role="admin", request=request, commit=True,
    )
    return ai.view({})


@router.post("/test")
async def test_ai_settings(payload: AiSettingsPatch, admin: User = Depends(get_current_admin_user)):
    """Testa a conexão com o que foi informado (completado pelo que já está em uso), sem salvar."""
    try:
        candidate = ai.validate_patch(_patch_dict(payload))
    except ai.AiSettingsError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return await ai.test_connection(candidate)
