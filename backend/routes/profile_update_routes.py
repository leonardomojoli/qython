# qython/backend/routes/profile_update_routes.py

import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from sqlalchemy.orm import selectinload
from werkzeug.utils import secure_filename

from ..database import get_db
from ..models import User, ProfileUpdateRequest
from ..security import get_current_active_user
from ..config import Config

logger = logging.getLogger("qython_logger")
router = APIRouter()

# Upload folder for profile update documents
PROFILE_UPDATE_DOCS_FOLDER = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'profile_update_docs')
os.makedirs(PROFILE_UPDATE_DOCS_FOLDER, exist_ok=True)

ALLOWED_DOC_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg'}

def allowed_doc_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_DOC_EXTENSIONS


# --- Pydantic Models ---

class CreateProfileUpdateRequestPayload(BaseModel):
    request_type: str  # 'period_change', 'university_change', 'occupation_upgrade'
    current_value: dict
    requested_value: dict


class ProfileUpdateRequestResponse(BaseModel):
    id: int
    request_type: str
    current_value: dict
    requested_value: dict
    documents: Optional[List[str]] = None
    status: str
    admin_notes: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminProfileUpdateRequestResponse(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_full_name: str
    request_type: str
    current_value: dict
    requested_value: dict
    documents: Optional[List[str]] = None
    status: str
    admin_notes: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewer_name: Optional[str] = None

    class Config:
        from_attributes = True


class ReviewRequestPayload(BaseModel):
    action: str  # 'approve' or 'reject'
    admin_notes: Optional[str] = None


# --- User Endpoints ---

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ProfileUpdateRequestResponse)
async def create_profile_update_request(
    payload: CreateProfileUpdateRequestPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Cria uma nova solicitação de atualização de perfil.
    Tipos permitidos: 'period_change', 'university_change', 'occupation_upgrade'
    """
    valid_types = ['period_change', 'university_change', 'occupation_upgrade']
    if payload.request_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de solicitação inválido. Tipos permitidos: {', '.join(valid_types)}"
        )

    # Check for existing pending request of the same type
    existing = await db.execute(
        select(ProfileUpdateRequest).where(
            ProfileUpdateRequest.user_id == current_user.id,
            ProfileUpdateRequest.request_type == payload.request_type,
            ProfileUpdateRequest.status == 'pending'
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Você já possui uma solicitação pendente deste tipo."
        )

    # Create the request
    new_request = ProfileUpdateRequest(
        user_id=current_user.id,
        request_type=payload.request_type,
        current_value=payload.current_value,
        requested_value=payload.requested_value,
        status='pending'
    )

    db.add(new_request)
    await db.commit()
    await db.refresh(new_request)

    logger.info(f"Nova solicitação de atualização criada: {new_request.id} por {current_user.email}")

    return new_request


@router.post("/{request_id}/upload-document", status_code=status.HTTP_200_OK)
async def upload_document_for_request(
    request_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Faz upload de um documento de suporte para uma solicitação de atualização.
    """
    # Find the request
    result = await db.execute(
        select(ProfileUpdateRequest).where(
            ProfileUpdateRequest.id == request_id,
            ProfileUpdateRequest.user_id == current_user.id
        )
    )
    update_request = result.scalars().first()

    if not update_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

    if update_request.status != 'pending':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não é possível adicionar documentos a uma solicitação já processada.")

    if not allowed_doc_file(file.filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de arquivo não permitido. Use PDF, PNG, JPG ou JPEG.")

    # Save the file
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    safe_filename = secure_filename(file.filename)
    new_filename = f"{current_user.id}_{request_id}_{timestamp}_{safe_filename}"
    file_path = os.path.join(PROFILE_UPDATE_DOCS_FOLDER, new_filename)

    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        logger.error(f"Erro ao salvar documento: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao salvar documento.")

    # Update the request with the document
    current_docs = update_request.documents or []
    current_docs.append(new_filename)
    update_request.documents = current_docs

    await db.commit()

    logger.info(f"Documento {new_filename} adicionado à solicitação {request_id}")

    return {"message": "Documento enviado com sucesso", "filename": new_filename}


@router.get("/my-requests", response_model=List[ProfileUpdateRequestResponse])
async def get_my_profile_update_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lista todas as solicitações de atualização de perfil do usuário atual.
    """
    result = await db.execute(
        select(ProfileUpdateRequest)
        .where(ProfileUpdateRequest.user_id == current_user.id)
        .order_by(desc(ProfileUpdateRequest.created_at))
    )
    requests = result.scalars().all()
    return requests


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_profile_update_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Cancela uma solicitação de atualização pendente.
    """
    result = await db.execute(
        select(ProfileUpdateRequest).where(
            ProfileUpdateRequest.id == request_id,
            ProfileUpdateRequest.user_id == current_user.id
        )
    )
    update_request = result.scalars().first()

    if not update_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

    if update_request.status != 'pending':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Apenas solicitações pendentes podem ser canceladas.")

    # Delete associated documents
    if update_request.documents:
        for doc in update_request.documents:
            doc_path = os.path.join(PROFILE_UPDATE_DOCS_FOLDER, doc)
            if os.path.exists(doc_path):
                try:
                    os.remove(doc_path)
                except Exception as e:
                    logger.warning(f"Não foi possível remover documento {doc}: {e}")

    await db.delete(update_request)
    await db.commit()

    logger.info(f"Solicitação {request_id} cancelada por {current_user.email}")
    return None


# --- Admin Endpoints ---

def get_current_admin_user(current_user: User = Depends(get_current_active_user)):
    """Verifica se o usuário é admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores."
        )
    return current_user


@router.get("/admin/pending", response_model=List[AdminProfileUpdateRequestResponse])
async def get_pending_update_requests(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Lista todas as solicitações de atualização pendentes (admin).
    """
    result = await db.execute(
        select(ProfileUpdateRequest)
        .options(selectinload(ProfileUpdateRequest.user), selectinload(ProfileUpdateRequest.reviewer))
        .where(ProfileUpdateRequest.status == 'pending')
        .order_by(ProfileUpdateRequest.created_at)
    )
    requests = result.scalars().all()

    response = []
    for req in requests:
        response.append({
            "id": req.id,
            "user_id": req.user_id,
            "user_email": req.user.email if req.user else "N/A",
            "user_full_name": req.user.full_name if req.user else "N/A",
            "request_type": req.request_type,
            "current_value": req.current_value,
            "requested_value": req.requested_value,
            "documents": req.documents,
            "status": req.status,
            "admin_notes": req.admin_notes,
            "created_at": req.created_at,
            "reviewed_at": req.reviewed_at,
            "reviewer_name": req.reviewer.full_name if req.reviewer else None
        })

    return response


@router.get("/admin/all", response_model=List[AdminProfileUpdateRequestResponse])
async def get_all_update_requests(
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Lista todas as solicitações de atualização (admin).
    Filtro opcional por status: 'pending', 'approved', 'rejected'
    """
    query = select(ProfileUpdateRequest).options(
        selectinload(ProfileUpdateRequest.user),
        selectinload(ProfileUpdateRequest.reviewer)
    ).order_by(desc(ProfileUpdateRequest.created_at)).limit(100)

    if status_filter:
        query = query.where(ProfileUpdateRequest.status == status_filter)

    result = await db.execute(query)
    requests = result.scalars().all()

    response = []
    for req in requests:
        response.append({
            "id": req.id,
            "user_id": req.user_id,
            "user_email": req.user.email if req.user else "N/A",
            "user_full_name": req.user.full_name if req.user else "N/A",
            "request_type": req.request_type,
            "current_value": req.current_value,
            "requested_value": req.requested_value,
            "documents": req.documents,
            "status": req.status,
            "admin_notes": req.admin_notes,
            "created_at": req.created_at,
            "reviewed_at": req.reviewed_at,
            "reviewer_name": req.reviewer.full_name if req.reviewer else None
        })

    return response


@router.post("/admin/{request_id}/review", status_code=status.HTTP_200_OK)
async def review_update_request(
    request_id: int,
    payload: ReviewRequestPayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Aprova ou rejeita uma solicitação de atualização de perfil.
    Se aprovada, atualiza automaticamente o perfil do usuário.
    """
    if payload.action not in ['approve', 'reject']:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ação inválida. Use 'approve' ou 'reject'.")

    result = await db.execute(
        select(ProfileUpdateRequest)
        .options(selectinload(ProfileUpdateRequest.user))
        .where(ProfileUpdateRequest.id == request_id)
    )
    update_request = result.scalars().first()

    if not update_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

    if update_request.status != 'pending':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta solicitação já foi processada.")

    user = update_request.user

    if payload.action == 'approve':
        # Apply the changes to the user profile
        requested = update_request.requested_value

        if update_request.request_type == 'period_change':
            if 'period' in requested:
                user.period = requested['period']

        elif update_request.request_type == 'university_change':
            if 'university' in requested:
                user.university = requested['university']
            if 'matricula' in requested:
                user.matricula = requested['matricula']

        elif update_request.request_type == 'occupation_upgrade':
            if 'occupation' in requested:
                user.occupation = requested['occupation']
            if 'identifier_type' in requested:
                user.identifier_type = requested['identifier_type']
            if 'identifier_number' in requested:
                user.identifier_number = requested['identifier_number']
            # Clear student-specific fields when upgrading to doctor
            if requested.get('occupation') == 'Médico':
                user.period = None
                user.matricula = None

        update_request.status = 'approved'
        logger.info(f"Solicitação {request_id} aprovada por {admin.email}. Perfil de {user.email} atualizado.")
    else:
        update_request.status = 'rejected'
        logger.info(f"Solicitação {request_id} rejeitada por {admin.email}")

    update_request.admin_notes = payload.admin_notes
    update_request.reviewed_at = datetime.now(timezone.utc)
    update_request.reviewed_by = admin.id

    await db.commit()

    return {
        "message": f"Solicitação {'aprovada' if payload.action == 'approve' else 'rejeitada'} com sucesso.",
        "request_id": request_id,
        "new_status": update_request.status
    }


@router.get("/admin/{request_id}/document/{filename}")
async def get_document(
    request_id: int,
    filename: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Retorna URL do documento para visualização (admin).
    """
    result = await db.execute(
        select(ProfileUpdateRequest).where(ProfileUpdateRequest.id == request_id)
    )
    update_request = result.scalars().first()

    if not update_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

    if not update_request.documents or filename not in update_request.documents:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado.")

    # Return the URL path
    base_url = Config.WEB_BASE_URL
    doc_url = f"{base_url}/{Config.STATIC_URL_PATH_PREFIX.strip('/')}/uploads/profile_update_docs/{filename}"

    return {"url": doc_url}
