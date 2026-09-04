# qython/backend/routes/settings_routes.py

import logging
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..services import settings_service
from ..security import get_current_active_user

logger = logging.getLogger("qython_logger")
router = APIRouter()

class UserPreferencesPayload(BaseModel):
    theme_preference: Optional[Literal['light', 'dark']] = None
    language_preference: Optional[Literal['pt', 'en', 'es']] = None
    autosave_consultation_drafts: Optional[bool] = None

class UserPreferencesResponse(BaseModel):
    theme_preference: str
    language_preference: str
    autosave_consultation_drafts: bool

class AnamnesisTemplatePayload(BaseModel):
    specialty: str = Field(..., max_length=100)
    consultation_type: str = Field(..., max_length=100)
    content: str = Field(..., max_length=50000)

class AnamnesisTemplateResponse(BaseModel):
    specialty: str
    consultation_type: str
    content: str

    class Config:
        from_attributes = True

@router.get("/preferences", response_model=UserPreferencesResponse)
async def get_user_preferences(current_user: User = Depends(get_current_active_user)):
    """Obtém as preferências de tema, idioma e autosave do usuário."""
    return {
        "theme_preference": current_user.theme_preference,
        "language_preference": current_user.language_preference,
        "autosave_consultation_drafts": current_user.autosave_consultation_drafts,
    }

@router.put("/preferences", response_model=UserPreferencesResponse)
async def update_user_preferences(
    payload: UserPreferencesPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Atualiza as preferências do usuário."""
    update_data = payload.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum dado fornecido para atualização.")

    # A função de serviço agora retorna o usuário atualizado
    success, updated_user = await settings_service.update_user_preferences(
        db=db,
        user_id=current_user.id,
        **update_data
    )
    
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao atualizar preferências do usuário")
    
    logger.info(f"Preferências do usuário {current_user.email} atualizadas.")
    return updated_user

@router.get("/anamnesis-templates", response_model=List[AnamnesisTemplateResponse])
async def get_anamnesis_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retorna todos os templates de anamnese do usuário."""
    templates = await settings_service.get_all_user_anamnesis_templates(db, current_user.id)
    return templates

@router.post("/anamnesis-templates", status_code=status.HTTP_201_CREATED)
async def create_or_update_anamnesis_template(
    payload: AnamnesisTemplatePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Cria ou atualiza um template de anamnese."""
    try:
        template, created = await settings_service.create_or_update_anamnesis_template(
            db=db,
            user_id=current_user.id,
            specialty=payload.specialty,
            consultation_type=payload.consultation_type,
            content=payload.content
        )
        response_template = AnamnesisTemplateResponse.from_orm(template)
        
        if created:
            logger.info(f"Template de anamnese criado para o usuário {current_user.email}.")
            return {"message": "Template criado com sucesso", "template": response_template}
        else:
            logger.info(f"Template de anamnese atualizado para o usuário {current_user.email}.")
            return {"message": "Template atualizado com sucesso", "template": response_template}
    except Exception as e:
        logger.error(f"Falha ao criar/atualizar template para user_id {current_user.id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao criar ou atualizar template")

@router.delete("/anamnesis-templates/{specialty}/{consultation_type}", status_code=status.HTTP_200_OK)
async def delete_anamnesis_template(
    specialty: str,
    consultation_type: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Exclui um template de anamnese específico."""
    success = await settings_service.delete_anamnesis_template(
        db=db,
        user_id=current_user.id,
        specialty=specialty,
        consultation_type=consultation_type
    )
    if success:
        logger.info(f"Template '{specialty}/{consultation_type}' deletado para o usuário {current_user.email}.")
        return {"message": "Template deletado com sucesso"}
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template não encontrado")