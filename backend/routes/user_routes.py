# qython/backend/routes/user_routes.py

import logging
import os
from datetime import datetime, timezone
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, BackgroundTasks, Request

from ..rate_limiter import limiter
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from werkzeug.utils import secure_filename

from ..database import get_db
from ..models import User, AvatarHistory, Transaction, Consultation, UserStats, Achievement, Invitation, SeasonRanking, ArenaSeason, AcademicMaterial, AcademicLibrary
from ..services.billing_service import debit_dracmas_for_feature
from ..services.avatar_service import generate_avatar_from_prompt
from ..utils import allowed_file_profile, UPLOAD_FOLDER_PROFILE, UPLOAD_FOLDER_DOCTOR_LOGOS
from ..security import get_current_active_user, get_current_user, verify_password, get_password_hash
from ..config import Config
from ..services.achievement_definitions import ACHIEVEMENTS

# Configurar logging
logger = logging.getLogger("qython_logger")

router = APIRouter()

# --- Pydantic Models ---

class AvatarPromptPayload(BaseModel):
    prompt: str
    category: Optional[str] = "default"  # professional, mythological, historical, fun, default

# Onboarding: primeiros 3 avatares são gratuitos
ONBOARDING_FREE_AVATARS = 3

class SaveAvatarPayload(BaseModel):
    filename: str

class UserInfoResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    username: Optional[str] = None
    specialty: Optional[str] = None
    treatment: Optional[str] = None
    is_admin: bool
    occupation: str
    university: Optional[str]
    phone_number: str
    period: Optional[str]
    matricula: Optional[str]
    identifier_type: Optional[str]
    identifier_number: Optional[str]
    referral_source: Optional[str]
    status: str
    dracmas: float
    profile_picture: Optional[str]
    doctor_logo: Optional[str] = None
    autosave_consultation_drafts: bool
    training_data_opt_out: bool = False
    # KYC/Verification fields
    country: Optional[str] = None
    verification_status: Optional[str] = None
    verification_notes: Optional[str] = None
    # ACESSO (política Qython) é separado de verification_status (verdade do Latreo).
    access_granted: bool = False
    onboarding_completed: bool = False
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class UpdateUserPayload(BaseModel):
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    full_name: Optional[str] = None
    username: Optional[str] = None
    specialty: Optional[str] = None
    treatment: Optional[str] = None
    theme_preference: Optional[str] = None
    language_preference: Optional[str] = None
    autosave_consultation_drafts: Optional[bool] = None

class HistoryItem(BaseModel):
    type: str
    description: str
    date: datetime
    amount: Optional[float]
    specialty: Optional[str] = None

# Modelo para a resposta de estatísticas
class UserStatsResponse(BaseModel):
    total_score: int
    quizzes_completed: int
    correct_answers: int
    incorrect_answers: int
    consultations_created: int

    class Config:
        from_attributes = True

# Modelo para o payload de mudança de senha
class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str

# --- Endpoints ---

@router.post("/generate-avatar-temp", status_code=status.HTTP_200_OK)
async def generate_avatar_temp(
    payload: AvatarPromptPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Gera um avatar temporário para o usuário autenticado."""
    try:
        # Contar avatares já gerados pelo usuário (conta arquivos no disco)
        user_prefix = f"{current_user.id}_"
        avatar_files = [f for f in os.listdir(UPLOAD_FOLDER_PROFILE)
                       if f.startswith(user_prefix) and f.endswith(('_avatar.png', '_avatar.jpg', '_avatar.webp'))]
        avatar_count = len(avatar_files)

        # Verificar se ainda está no período de onboarding (3 gratuitos)
        is_free = avatar_count < ONBOARDING_FREE_AVATARS

        if not is_free:
            # Cobrar dracmas via billing service (lança 402 se insuficiente)
            await debit_dracmas_for_feature(current_user, "generate_avatar", db)
            logger.info(f"Avatar pago gerado para {current_user.email}. Saldo: {current_user.dracmas}")
        else:
            logger.info(f"Avatar onboarding {avatar_count + 1}/{ONBOARDING_FREE_AVATARS} gratuito para {current_user.email}")

        # Gerar avatar com categoria
        filename = generate_avatar_from_prompt(
            payload.prompt,
            current_user,
            category=payload.category or "default"
        )

        # NÃO salvar no histórico automaticamente - só quando usuário clicar em "Salvar"

        base_url = Config.WEB_BASE_URL
        avatar_url = f"{base_url}/{Config.STATIC_URL_PATH_PREFIX.strip('/')}/uploads/profile_pictures/{filename}"
        logger.info(f"Avatar URL gerada: {avatar_url}")

        return {
            "message": "Avatar gerado com sucesso",
            "temp_avatar_url": avatar_url,
            "filename": filename,
            "avatars_remaining": max(0, ONBOARDING_FREE_AVATARS - avatar_count - 1),
            "is_free": avatar_count < ONBOARDING_FREE_AVATARS
        }
    except HTTPException as http_exc:
        await db.rollback()
        raise http_exc
    except Exception as e:
        await db.rollback()
        logger.error(f"Erro ao gerar avatar para {current_user.email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro na geração de avatar")

@router.post("/save-avatar", status_code=status.HTTP_200_OK)
async def save_avatar(
    payload: SaveAvatarPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Salva um avatar gerado temporariamente ou preset como a foto de perfil oficial."""
    
    # Check if it's a preset URL or a generated file (support both old and new paths)
    is_preset = "/images/avatars/presets/" in payload.filename or "/assets/images/avatars/presets/" in payload.filename
    
    if is_preset:
        # Preset: save the URL path directly (e.g., "/images/avatars/presets/historical/plague_doctor.png")
        # Extract path from full URL if needed
        from urllib.parse import urlparse
        parsed = urlparse(payload.filename)
        if parsed.scheme and parsed.netloc:
            profile_picture_value = parsed.path or payload.filename
        else:
            profile_picture_value = payload.filename
        
        logger.info(f"Salvando preset avatar: {profile_picture_value} para {current_user.email}")
        current_user.profile_picture = profile_picture_value
        await db.commit()
        return {"message": "Avatar preset salvo com sucesso", "profile_picture": profile_picture_value}
    
    # Generated avatar: validate filename and check if file exists
    if '..' in payload.filename or '/' in payload.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome de arquivo inválido.")
    temp_file_path = os.path.join(UPLOAD_FOLDER_PROFILE, payload.filename)
    real_path = os.path.realpath(temp_file_path)
    if not real_path.startswith(os.path.realpath(UPLOAD_FOLDER_PROFILE)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Caminho de arquivo inválido.")
    if not os.path.exists(temp_file_path):
        logger.error(f"Arquivo de avatar temporário não encontrado: {temp_file_path}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo de avatar temporário não encontrado")

    if current_user.profile_picture and current_user.profile_picture != "default-profile.png":
        old_file_path = os.path.join(UPLOAD_FOLDER_PROFILE, current_user.profile_picture)
        old_real_path = os.path.realpath(old_file_path)
        if (old_real_path.startswith(os.path.realpath(UPLOAD_FOLDER_PROFILE))
                and os.path.exists(old_file_path)
                and current_user.profile_picture != payload.filename):
            try:
                os.remove(old_file_path)
                logger.info(f"Foto de perfil antiga removida: {old_file_path}")
            except OSError as e:
                logger.error(f"Erro ao remover foto de perfil antiga {old_file_path}: {e}")

    current_user.profile_picture = payload.filename
    
    result = await db.execute(select(AvatarHistory).filter_by(user_id=current_user.id, filename=payload.filename))
    existing_history = result.scalars().first()
    
    if not existing_history:
        new_history_entry = AvatarHistory(user_id=current_user.id, filename=payload.filename)
        db.add(new_history_entry)

    # Enforce avatar history limit (plan-based)
    from sqlalchemy import func as sql_func
    from ..services.storage_service import get_plan_base
    count_result = await db.execute(
        select(sql_func.count()).select_from(AvatarHistory).filter_by(user_id=current_user.id)
    )
    total_history = count_result.scalar() or 0

    plan = get_plan_base(current_user.subscription_plan)
    max_history = Config.MAX_AVATAR_HISTORY.get(plan, Config.MAX_AVATAR_HISTORY['free'])

    if total_history > max_history:
        excess = total_history - max_history
        # Get oldest entries (excluding the current profile picture)
        oldest_result = await db.execute(
            select(AvatarHistory).filter(
                AvatarHistory.user_id == current_user.id,
                AvatarHistory.filename != current_user.profile_picture
            ).order_by(AvatarHistory.created_at.asc()).limit(excess)
        )
        oldest_entries = oldest_result.scalars().all()

        for entry in oldest_entries:
            # Delete file from disk
            old_path = os.path.join(UPLOAD_FOLDER_PROFILE, entry.filename)
            old_real = os.path.realpath(old_path)
            if (old_real.startswith(os.path.realpath(UPLOAD_FOLDER_PROFILE))
                    and os.path.exists(old_path)):
                try:
                    os.remove(old_path)
                    logger.info(f"Avatar history limit: removed file {entry.filename}")
                except OSError as e:
                    logger.warning(f"Could not remove old avatar file {old_path}: {e}")
            await db.delete(entry)

    await db.commit()
    logger.info(f"Avatar {payload.filename} salvo como foto de perfil para {current_user.email}")
    return {"message": "Avatar salvo com sucesso", "profile_picture": payload.filename}

@router.post("/upload-profile-picture", status_code=status.HTTP_200_OK)
async def upload_profile_picture(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Faz upload de uma nova foto de perfil."""
    if not allowed_file_profile(file.filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de arquivo não permitido")

    if current_user.profile_picture and current_user.profile_picture != "default-profile.png":
        old_file_path = os.path.join(UPLOAD_FOLDER_PROFILE, current_user.profile_picture)
        if os.path.exists(old_file_path):
            try:
                os.remove(old_file_path)
            except OSError as e:
                logger.error(f"Erro ao remover foto antiga {old_file_path}: {e}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    safe_filename = secure_filename(file.filename)
    new_filename = f"{current_user.id}_{timestamp}_{safe_filename}"
    file_path = os.path.join(UPLOAD_FOLDER_PROFILE, new_filename)

    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            if len(content) > 10 * 1024 * 1024:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Foto de perfil excede o limite de 10MB.")
            buffer.write(content)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao salvar o arquivo de perfil {new_filename}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao salvar o arquivo no servidor.")

    current_user.profile_picture = new_filename
    await db.commit()
    logger.info(f"Foto de perfil atualizada para: {current_user.email} com arquivo {new_filename}")
    return {"message": "Foto de perfil atualizada com sucesso", "profile_picture": new_filename}

@router.post("/reset-profile-picture", status_code=status.HTTP_200_OK)
async def reset_profile_picture(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Reseta a foto de perfil para a imagem padrão."""
    if current_user.profile_picture and current_user.profile_picture != "default-profile.png":
        old_file_path = os.path.join(UPLOAD_FOLDER_PROFILE, current_user.profile_picture)
        if os.path.exists(old_file_path):
            try:
                os.remove(old_file_path)
            except OSError as e:
                logger.error(f"Erro ao remover foto antiga {old_file_path} ao resetar: {e}")

    current_user.profile_picture = "default-profile.png"
    await db.commit()
    logger.info(f"Foto de perfil resetada para padrão para: {current_user.email}")
    return {"message": "Foto de perfil resetada para o padrão", "profile_picture": "default-profile.png"}

@router.post("/upload-doctor-logo", status_code=status.HTTP_200_OK)
async def upload_doctor_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Upload or replace custom logo for medical PDFs."""
    if not allowed_file_profile(file.filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de arquivo não permitido. Use PNG, JPG, GIF ou WebP.")

    # Delete old logo file if exists
    if current_user.doctor_logo:
        old_file_path = os.path.join(UPLOAD_FOLDER_DOCTOR_LOGOS, current_user.doctor_logo)
        if os.path.exists(old_file_path):
            try:
                os.remove(old_file_path)
            except OSError as e:
                logger.error(f"Erro ao remover logo antigo {old_file_path}: {e}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    safe_filename = secure_filename(file.filename)
    new_filename = f"{current_user.id}_{timestamp}_{safe_filename}"
    file_path = os.path.join(UPLOAD_FOLDER_DOCTOR_LOGOS, new_filename)

    try:
        content = await file.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Logo excede o limite de 5MB.")
        with open(file_path, "wb") as buffer:
            buffer.write(content)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao salvar logo {new_filename}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao salvar o arquivo no servidor.")

    current_user.doctor_logo = new_filename
    await db.commit()
    logger.info(f"Logo médico atualizado para: {current_user.email} com arquivo {new_filename}")
    return {"doctor_logo": new_filename}

@router.delete("/doctor-logo", status_code=status.HTTP_200_OK)
async def delete_doctor_logo(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Remove custom logo, reverting to Qython default on PDFs."""
    if current_user.doctor_logo:
        file_path = os.path.join(UPLOAD_FOLDER_DOCTOR_LOGOS, current_user.doctor_logo)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as e:
                logger.error(f"Erro ao remover logo {file_path}: {e}")
        current_user.doctor_logo = None
        await db.commit()
        logger.info(f"Logo médico removido para: {current_user.email}")
    return {"message": "Logo removido com sucesso", "doctor_logo": None}

@router.get("/check-username/{username}", status_code=status.HTTP_200_OK)
async def check_username_availability(
    username: str,
    db: AsyncSession = Depends(get_db)
):
    """Verifica se um username está disponível com validação completa (padrão Twitter/Instagram)."""
    import re
    
    # Reserved usernames (cannot be taken by users)
    RESERVED_USERNAMES = {
        'admin', 'administrator', 'suporte', 'support', 'help', 'qython', 
        'moderator', 'mod', 'staff', 'root', 'system', 'null', 'undefined',
        'api', 'www', 'mail', 'email', 'ftp', 'ssh', 'test', 'dev', 'prod',
        'login', 'logout', 'register', 'signup', 'signin', 'home', 'dashboard',
        'settings', 'profile', 'user', 'users', 'account', 'config', 'status'
    }
    
    username_lower = username.lower()
    
    # 1. Length validation (3-30 chars - industry standard)
    if len(username) < 3:
        return {"available": False, "reason": "Mínimo de 3 caracteres"}
    
    if len(username) > 30:
        return {"available": False, "reason": "Máximo de 30 caracteres"}
    
    # 2. Only valid characters (letters, numbers, underscore, dot - like Instagram)
    if not re.match(r'^[a-zA-Z0-9_.]+$', username):
        return {"available": False, "reason": "Use apenas letras, números, _ e ."}
    
    # 3. No consecutive dots (Instagram rule for readability)
    if '..' in username:
        return {"available": False, "reason": "Não pode ter pontos consecutivos (..)"}
    
    # 4. Reserved words check
    if username_lower in RESERVED_USERNAMES:
        return {"available": False, "reason": "Este nome é reservado"}
    
    # 5. Check if already taken
    result = await db.execute(select(User).filter(User.username == username_lower))
    existing = result.scalars().first()
    
    return {"available": not existing, "reason": "Disponível!" if not existing else "Já em uso"}


@router.get("/info", response_model=UserInfoResponse)
async def get_user_info(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna as informações do usuário autenticado.
    Permite acesso a usuários 'waitlist' para que possam ver a tela de espera com seus dados.
    Verifica e credita bônus mensal para estudantes elegíveis.
    """
    from ..services.billing_service import check_and_credit_monthly_student_bonus
    
    # Verificar e creditar bônus mensal se elegível
    await check_and_credit_monthly_student_bonus(current_user, db)
    
    logger.debug(f"Retornando informações para o usuário: {current_user.email}")
    return current_user


@router.post("/onboarding/complete", status_code=status.HTTP_200_OK)
async def complete_onboarding(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Marca o onboarding (avatar/username/plano) como concluído. Idempotente.

    Chamado quando o usuário FINALIZA ou PULA o wizard, para não ser roteado de volta
    ao /onboarding a cada acesso (ver ProtectedRoute no front)."""
    if not current_user.onboarding_completed:
        current_user.onboarding_completed = True
        await db.commit()
    return {"onboarding_completed": True}

@router.put("/update", response_model=UserInfoResponse)
async def update_user_profile(
    payload: UpdateUserPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Atualiza as informações do perfil do usuário."""
    update_data = payload.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum dado fornecido para atualização.")

    if 'email' in update_data and update_data['email'] != current_user.email:
        result = await db.execute(select(User).filter(User.email == update_data['email']))
        existing_user = result.scalars().first()
        if existing_user:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email já está em uso por outra conta.")
    
    # Verifica unicidade do username
    if 'username' in update_data and update_data['username']:
        result = await db.execute(select(User).filter(
            User.username == update_data['username'],
            User.id != current_user.id
        ))
        if result.scalars().first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este nome de usuário já está em uso.")
    
    ALLOWED_UPDATE_FIELDS = {'email', 'phone_number', 'full_name', 'username', 'specialty', 'treatment',
                              'theme_preference', 'language_preference', 'autosave_consultation_drafts'}
    for field, value in update_data.items():
        if field not in ALLOWED_UPDATE_FIELDS:
            continue
        setattr(current_user, field, value)

    current_user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(current_user)

    from ..services import audit_service
    await audit_service.log(
        db,
        action='user.profile.update',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='User',
        target_id=current_user.id,
        affected_user_id=current_user.id,
        metadata={'fields': list(update_data.keys())},
        request=request,
        commit=True,
    )

    logger.info(f"Perfil do usuário {current_user.email} atualizado. Campos: {', '.join(update_data.keys())}")
    return current_user

@router.put("/training-data-preference", status_code=status.HTTP_200_OK)
async def update_training_data_preference(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Toggle training data collection opt-out (LGPD Art. 18(IV) compliance)."""
    data = await request.json()
    opt_out = data.get("opt_out", False)

    current_user.training_data_opt_out = bool(opt_out)
    await db.commit()

    logger.info(f"Training data opt-out updated for {current_user.email}: opt_out={current_user.training_data_opt_out}")
    return {"training_data_opt_out": current_user.training_data_opt_out}


@router.get("/history/usage", response_model=List[HistoryItem])
async def get_usage_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retorna um histórico combinado de uso (consultas e transações)."""
    logger.info(f"Histórico de uso solicitado por: {current_user.email}")
    
    result_consultations = await db.execute(select(Consultation).filter_by(user_id=current_user.id))
    consultations = result_consultations.scalars().all()
    
    result_transactions = await db.execute(select(Transaction).filter_by(user_id=current_user.id))
    transactions = result_transactions.scalars().all()

    history = []
    for c in consultations:
        history.append({
            "type": "consultation",
            "description": f"Consulta de {c.specialty}",
            "date": c.created_at,
            "amount": None,
            "specialty": c.specialty
        })
    for t in transactions:
        history.append({
            "type": "transaction",
            "description": t.description or "Transação",
            "date": t.timestamp,
            "amount": t.amount,
            "specialty": None
        })

    history.sort(key=lambda item: item["date"], reverse=True)
    return history

@router.get("/avatar-history", response_model=List[str])
async def get_avatar_history(current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    """Retorna o histórico de avatares do usuário."""
    result = await db.execute(select(AvatarHistory).filter_by(user_id=current_user.id).order_by(AvatarHistory.created_at.desc()))
    history = result.scalars().all()
    base_url = Config.WEB_BASE_URL
    
    def build_url(filename):
        if "images/" in filename or "presets" in filename:
            # Presets are frontend static files, served from root
            clean_path = filename.lstrip('/')
            return f"{base_url}/{clean_path}"
        # Generated avatars are in static uploads
        return f"{base_url}/{Config.STATIC_URL_PATH_PREFIX.strip('/')}/uploads/profile_pictures/{filename}"

    return [build_url(avatar.filename) for avatar in history]


@router.get("/avatar-history/limits", status_code=status.HTTP_200_OK)
async def get_avatar_history_limits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Returns avatar history usage and plan-based limits for the current user."""
    from ..services.storage_service import get_plan_base

    plan = get_plan_base(current_user.subscription_plan)
    max_history = Config.MAX_AVATAR_HISTORY.get(plan, Config.MAX_AVATAR_HISTORY['free'])

    count_result = await db.execute(
        select(func.count()).select_from(AvatarHistory).filter_by(user_id=current_user.id)
    )
    used = count_result.scalar() or 0

    return {
        "used": used,
        "max": max_history,
        "plan": plan,
    }


class DeleteAvatarPayload(BaseModel):
    filename: str

@router.post("/avatar-history/delete", status_code=status.HTTP_200_OK)
async def delete_avatar_from_history(
    payload: DeleteAvatarPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Remove um avatar do histórico do usuário."""
    filename = payload.filename
    if '..' in filename or '/' in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome de arquivo inválido.")
    result = await db.execute(
        select(AvatarHistory).filter_by(user_id=current_user.id, filename=filename)
    )
    avatar_entry = result.scalars().first()

    if not avatar_entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar não encontrado no histórico")

    # Delete from database
    await db.delete(avatar_entry)
    await db.commit()

    # Delete file from disk if it exists (with path traversal protection)
    file_path = os.path.join(UPLOAD_FOLDER_PROFILE, filename)
    real_path = os.path.realpath(file_path)
    if real_path.startswith(os.path.realpath(UPLOAD_FOLDER_PROFILE)) and os.path.exists(file_path):
        try:
            os.remove(file_path)
            logger.info(f"Arquivo de avatar removido: {file_path}")
        except OSError as e:
            logger.warning(f"Não foi possível remover arquivo {file_path}: {e}")

    logger.info(f"Avatar {filename} removido do histórico de {current_user.email}")
    return {"message": "Avatar removido do histórico"}

@router.get("/avatar-presets")
async def get_avatar_presets():
    """
    Retorna avatares pré-prontos organizados por categoria.
    Não requer autenticação para permitir uso no onboarding.
    """
    base_url = Config.WEB_BASE_URL
    presets_base = "/assets/images/avatars/presets"
    
    # Estrutura de presets
    presets = {
        "default": [
            {"id": "monalisa_medica", "name": "Monalisa Médica", "url": f"{base_url}{presets_base}/default/monalisa_medica.png"}
        ],
        "professional": [
            {"id": "doc_female_01", "name": "Médica Profissional", "url": f"{base_url}{presets_base}/professional/doc_female_01.png"}
        ],
        "mythological": [
            {"id": "asclepius", "name": "Asclépio", "url": f"{base_url}{presets_base}/mythological/asclepius.png"}
        ],
        "historical": [
            {"id": "plague_doctor", "name": "Médico da Peste", "url": f"{base_url}{presets_base}/historical/plague_doctor.png"}
        ],
        "fun": [
            {"id": "ogre_doc_01", "name": "Ogro Médico", "url": f"{base_url}{presets_base}/fun/ogre_doc_01.png"}
        ]
    }
    
    return {
        "presets": presets,
        "categories": [
            {"id": "default", "name": "Clássico", "icon": "🏛️"},
            {"id": "professional", "name": "Profissional", "icon": "👨‍⚕️"},
            {"id": "mythological", "name": "Mitológico", "icon": "⚕️"},
            {"id": "historical", "name": "Histórico", "icon": "📚"},
            {"id": "fun", "name": "Divertido", "icon": "🎭"}
        ]
    }


@router.get("/avatar-count")
async def get_avatar_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna quantos avatares gratuitos restam para o usuário.
    Usado para manter o contador sincronizado ao recarregar a página.
    Conta arquivos no disco para consistência com generate-avatar-temp.
    """
    user_prefix = f"{current_user.id}_"
    try:
        avatar_files = [f for f in os.listdir(UPLOAD_FOLDER_PROFILE)
                       if f.startswith(user_prefix) and f.endswith(('_avatar.png', '_avatar.jpg', '_avatar.webp'))]
        avatar_count = len(avatar_files)
    except OSError:
        avatar_count = 0

    avatars_remaining = max(0, ONBOARDING_FREE_AVATARS - avatar_count)

    return {
        "avatars_remaining": avatars_remaining,
        "total_generated": avatar_count,
        "is_free": avatars_remaining > 0
    }

class AchievementResponse(BaseModel):
    id: int
    badge_code: str
    achieved_at: datetime

    class Config:
        from_attributes = True

@router.get("/achievements", response_model=List[AchievementResponse])
async def get_user_achievements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retorna todas as conquistas do usuário autenticado."""
    logger.info(f"Buscando conquistas para o usuário: {current_user.email}")
    # Lazy loading might be an issue with async, but for now assuming eager load or separate query if needed.
    # Ideally we should use select(Achievement).filter_by(user_id=current_user.id)
    # But since current_user is already loaded, we need to be careful about lazy attributes.
    # Let's query explicitly to be safe.
    result = await db.execute(select(Achievement).filter_by(user_id=current_user.id))
    return result.scalars().all()


@router.get("/stats", response_model=UserStatsResponse)
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retorna as estatísticas de gamificação e uso do usuário."""
    result_stats = await db.execute(select(UserStats).filter(UserStats.user_id == current_user.id))
    stats = result_stats.scalars().first()
    
    result_count = await db.execute(select(func.count()).select_from(Consultation).filter(Consultation.user_id == current_user.id))
    consultations_count = result_count.scalar()

    if not stats:
        return UserStatsResponse(
            total_score=0,
            quizzes_completed=0,
            correct_answers=0,
            incorrect_answers=0,
            consultations_created=consultations_count
        )
    
    return UserStatsResponse(
        total_score=stats.total_score,
        quizzes_completed=stats.quizzes_completed,
        correct_answers=stats.correct_answers,
        incorrect_answers=stats.incorrect_answers,
        consultations_created=consultations_count
    )

@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    payload: ChangePasswordPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Altera a senha do usuário autenticado."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A senha atual está incorreta."
        )

    if len(payload.new_password) < 8 or not any(c.isupper() for c in payload.new_password) or not any(c.isdigit() for c in payload.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A nova senha deve ter no mínimo 8 caracteres, incluindo 1 letra maiúscula e 1 número."
        )

    current_user.password_hash = get_password_hash(payload.new_password)
    await db.commit()

    from ..services import audit_service
    await audit_service.log(
        db,
        action='user.password.change',
        actor_user_id=current_user.id,
        actor_role='medico',
        target_type='User',
        target_id=current_user.id,
        affected_user_id=current_user.id,
        request=request,
        commit=True,
    )

    logger.info(f"Senha alterada com sucesso para o usuário: {current_user.email}")
    return {"message": "Senha alterada com sucesso."}

@router.get("/achievements/all", status_code=status.HTTP_200_OK)
async def get_all_achievements():
    """Retorna a definição de todas as conquistas possíveis."""
    return ACHIEVEMENTS


# --- Activate Invite for Waitlist Users ---

class ActivateInvitePayload(BaseModel):
    token: str

@router.post("/activate-invite", status_code=status.HTTP_200_OK)
async def activate_invite(
    payload: ActivateInvitePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Permite qualquer usuário logado (inclusive waitlist)
):
    """Ativa a conta de um usuário na waitlist se o token de convite for válido."""
    
    # Verifica se já está ativo
    if current_user.status == 'active':
        return {"message": "Sua conta já está ativa."}

    # Busca o convite
    result = await db.execute(select(Invitation).where(
        Invitation.token == payload.token,
        Invitation.is_used == False
    ))
    invite = result.scalars().first()

    if not invite:
        raise HTTPException(status_code=400, detail="Convite inválido ou já utilizado.")

    # Ativa o usuário
    current_user.status = 'active'
    invite.is_used = True
    invite.used_by_user_id = current_user.id
    
    await db.commit()
    
    logger.info(f"Usuário {current_user.email} ativado via token na página de espera.")
    return {"message": "Conta ativada com sucesso!"}


# =============================================================================
# COMPREHENSIVE STATISTICS ENDPOINT
# =============================================================================

class ComprehensiveStatsResponse(BaseModel):
    overview: dict
    consultations: dict
    academic: dict


@router.get("/statistics/comprehensive", response_model=ComprehensiveStatsResponse)
async def get_comprehensive_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna estatísticas consolidadas do usuário para o dashboard do perfil.
    Inclui dados de consultas, casos cirúrgicos e desempenho acadêmico.
    """
    from sqlalchemy import extract, case as sql_case
    from datetime import datetime, timedelta, timezone
    from collections import defaultdict

    # ===================
    # 1. OVERVIEW STATS
    # ===================

    # Consultas
    consultations_count = await db.execute(
        select(func.count()).select_from(Consultation).filter(Consultation.user_id == current_user.id)
    )
    total_consultations = consultations_count.scalar() or 0

    # Materiais gerados (Produtor de Materiais)
    materials_count = await db.execute(
        select(func.count()).select_from(AcademicMaterial).filter(AcademicMaterial.user_id == current_user.id)
    )
    total_materials = materials_count.scalar() or 0

    # Stats de quiz/arena
    stats_result = await db.execute(select(UserStats).filter(UserStats.user_id == current_user.id))
    user_stats = stats_result.scalars().first()

    total_quizzes = user_stats.quizzes_completed if user_stats else 0
    arena_score = user_stats.total_score if user_stats else 0
    correct_answers = user_stats.correct_answers if user_stats else 0
    incorrect_answers = user_stats.incorrect_answers if user_stats else 0

    six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)
    month_names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    current_date = datetime.now(timezone.utc)

    # ===================
    # 2. CONSULTATION STATS
    # ===================

    consultations_result = await db.execute(
        select(Consultation).filter(Consultation.user_id == current_user.id)
    )
    consultations = consultations_result.scalars().all()

    # Por mês
    consultations_by_month = defaultdict(int)
    for c in consultations:
        if c.created_at and c.created_at >= six_months_ago:
            month_name = month_names[c.created_at.month - 1]
            consultations_by_month[month_name] += 1

    consultations_monthly = []
    for i in range(5, -1, -1):
        target_date = current_date - timedelta(days=30 * i)
        month_name = month_names[target_date.month - 1]
        consultations_monthly.append({"month": month_name, "count": consultations_by_month.get(month_name, 0)})

    # Por especialidade
    by_specialty = defaultdict(int)
    for c in consultations:
        spec = c.specialty or "Não especificada"
        by_specialty[spec] += 1

    # ===================
    # 4. ACADEMIC STATS
    # ===================

    correct_rate = (correct_answers / (correct_answers + incorrect_answers)) if (correct_answers + incorrect_answers) > 0 else 0

    # Ranking da temporada atual
    season_rank = None
    season_percentile = None

    active_season_result = await db.execute(
        select(ArenaSeason).filter(ArenaSeason.is_active == True)
    )
    active_season = active_season_result.scalars().first()

    if active_season:
        ranking_result = await db.execute(
            select(SeasonRanking).filter(
                SeasonRanking.season_id == active_season.id,
                SeasonRanking.user_id == current_user.id
            )
        )
        ranking = ranking_result.scalars().first()
        if ranking:
            season_rank = ranking.rank_position
            season_percentile = ranking.percentile

    # ===================
    # BUILD RESPONSE
    # ===================

    return ComprehensiveStatsResponse(
        overview={
            "total_consultations": total_consultations,
            "total_materials": total_materials,
            "arena_score": arena_score
        },
        consultations={
            "by_month": consultations_monthly,
            "by_specialty": dict(by_specialty)
        },
        academic={
            "quizzes_completed": total_quizzes,
            "correct_rate": round(correct_rate, 3),
            "season_rank": season_rank,
            "season_percentile": season_percentile
        }
    )


# --- Payment Waitlist (Coming Soon) ---

class PaymentWaitlistPayload(BaseModel):
    email: EmailStr


@router.post("/payment-waitlist", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def add_to_payment_waitlist(
    request: Request,
    payload: PaymentWaitlistPayload,
    db: AsyncSession = Depends(get_db)
):
    """
    Add an email to the payment waitlist for notification when premium plans are available.
    This endpoint is public (no auth required) to allow lead capture from non-logged users.
    """
    from ..models import PaymentWaitlist

    # Check if email already exists
    existing = await db.execute(
        select(PaymentWaitlist).filter(PaymentWaitlist.email == payload.email.lower())
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already on the waitlist."
        )

    # Add to waitlist
    waitlist_entry = PaymentWaitlist(email=payload.email.lower())
    db.add(waitlist_entry)
    await db.commit()

    logger.info(f"Email added to payment waitlist: {payload.email}")

    return {"message": "Successfully added to waitlist", "email": payload.email}


@router.get("/storage", status_code=status.HTTP_200_OK)
async def get_storage_info(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Returns storage usage and quota information for the current user."""
    from ..services.storage_service import get_storage_quota, get_storage_limits, get_plan_base

    quota_bytes = get_storage_quota(current_user)
    limits = get_storage_limits(current_user)
    used_bytes = current_user.storage_used_bytes or 0
    percent = round((used_bytes / quota_bytes) * 100, 1) if quota_bytes > 0 else 0

    # Count current libraries
    libraries_result = await db.execute(
        select(func.count()).select_from(AcademicLibrary).filter(AcademicLibrary.user_id == current_user.id)
    )
    libraries_used = libraries_result.scalar() or 0

    return {
        "storage_used_bytes": used_bytes,
        "storage_quota_bytes": quota_bytes,
        "storage_percent": min(percent, 100),
        "plan": get_plan_base(current_user.subscription_plan),
        "libraries_used": libraries_used,
        "libraries_max": limits.get('max_libraries'),
        "docs_per_library_max": limits.get('docs_per_library'),
    }


@router.get("/payment-waitlist/check/{email}", status_code=status.HTTP_200_OK)
async def check_payment_waitlist(
    email: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Check if an email is already on the payment waitlist.
    """
    from ..models import PaymentWaitlist

    existing = await db.execute(
        select(PaymentWaitlist).filter(PaymentWaitlist.email == email.lower())
    )
    is_on_waitlist = existing.scalars().first() is not None

    return {"email": email, "is_on_waitlist": is_on_waitlist}


@router.post("/push-token", status_code=status.HTTP_200_OK)
async def register_push_token(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Register or update a push notification token (FCM/APNs) for the current user's device.
    Accepts form-urlencoded: token, platform (android/ios/web).
    """
    from ..models import PushToken

    form = await request.form()
    token = form.get("token")
    platform = form.get("platform", "android")

    if not token or not isinstance(token, str) or len(token) < 10:
        raise HTTPException(status_code=400, detail="Invalid push token")

    if platform not in ("android", "ios", "web"):
        raise HTTPException(status_code=400, detail="Invalid platform. Must be android, ios, or web")

    # Upsert: update last_used_at if token already exists, else insert
    existing = await db.execute(
        select(PushToken).filter(
            PushToken.user_id == current_user.id,
            PushToken.token == token,
        )
    )
    push_token = existing.scalars().first()

    if push_token:
        push_token.last_used_at = datetime.now(timezone.utc)
        push_token.platform = platform
    else:
        push_token = PushToken(
            user_id=current_user.id,
            token=token,
            platform=platform,
        )
        db.add(push_token)

    await db.commit()
    return {"status": "ok"}


# =============================================================================
# LGPD — Direitos do Titular (Art. 18)
# =============================================================================

from fastapi.responses import StreamingResponse
from ..models import (
    AuditLog,
    ConsentDocument,
    ConsentDocumentType,
    UserConsent,
)
from ..services import (
    anonymization_service,
    audit_service,
    consent_service,
    data_export_service,
)


class ConsentGrantPayload(BaseModel):
    type: str
    locale: Optional[str] = "pt-BR"
    scope_metadata: Optional[dict] = None


class ConsentResponse(BaseModel):
    id: int
    type: str
    version: str
    granted_at: datetime
    revoked_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active: bool

    class Config:
        from_attributes = True


class ActiveDocumentResponse(BaseModel):
    type: str
    version: str
    locale: str
    title: str
    body: str
    content_hash: str
    default_ttl_days: Optional[int] = None

    class Config:
        from_attributes = True


class AuditLogEntryResponse(BaseModel):
    id: int
    occurred_at: datetime
    action: str
    actor_role: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    metadata_info: Optional[dict] = None

    class Config:
        from_attributes = True


def _parse_consent_type(raw: str) -> ConsentDocumentType:
    try:
        return ConsentDocumentType(raw)
    except ValueError:
        valid = ", ".join(t.value for t in ConsentDocumentType)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de consentimento inválido. Valores aceitos: {valid}",
        )


@router.get("/me/data-export", status_code=status.HTTP_200_OK)
async def export_my_data(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    LGPD Art. 18 V — Portabilidade. Devolve um ZIP com todos os dados pessoais
    do titular em JSON estruturado.
    """
    bundle = await data_export_service.build_user_export(db, current_user.id)
    zip_bytes = data_export_service.bundle_to_zip(bundle)

    await audit_service.log_data_export(db, user_id=current_user.id, request=request)
    await db.commit()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"qython_data_export_{current_user.id}_{timestamp}.zip"
    logger.info(
        f"Data export gerado para user={current_user.id} ({current_user.email}), "
        f"size={len(zip_bytes)} bytes"
    )
    return StreamingResponse(
        iter([zip_bytes]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/me", status_code=status.HTTP_202_ACCEPTED)
async def delete_my_account(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    LGPD Art. 18 VI — Direito ao esquecimento. Soft-delete imediato (bloqueia
    login) seguido de purga assíncrona em background.

    Dados anonimizados (sem vínculo com user_id) são preservados — Art. 12.
    """
    soft_ok = await data_export_service.soft_delete_user(
        db, current_user.id, request=request,
    )
    if not soft_ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conta não encontrada.",
        )
    await db.commit()

    user_id = current_user.id

    async def _purge_task():
        from ..database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            try:
                counts = await data_export_service.purge_user_data(session, user_id)
                await session.commit()
                logger.info(
                    f"Conta {user_id} purgada com sucesso: {counts}"
                )
            except Exception as exc:
                await session.rollback()
                logger.error(
                    f"Falha ao purgar conta {user_id}: {exc}", exc_info=True,
                )

    background_tasks.add_task(_purge_task)
    logger.info(
        f"Conta {user_id} ({current_user.email}) marcada para exclusão. "
        "Purga assíncrona agendada."
    )
    return {
        "message": "Conta marcada para exclusão. O processamento completo "
                   "pode levar alguns minutos.",
        "deleted_at": current_user.deleted_at,
    }


@router.get("/me/audit-log", response_model=List[AuditLogEntryResponse])
async def get_my_audit_log(
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    LGPD Art. 18 II — Acesso a registros de operações sobre os próprios dados.
    Retorna as últimas `limit` entradas (máx 1000).
    """
    if limit > 1000:
        limit = 1000
    if limit < 1:
        limit = 1

    stmt = (
        select(AuditLog)
        .where(AuditLog.affected_user_id == current_user.id)
        .order_by(AuditLog.occurred_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    entries = result.scalars().all()
    return entries


@router.get("/me/consents", response_model=List[ConsentResponse])
async def list_my_consents(
    include_revoked: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Lista os consentimentos do usuário. include_revoked=true mostra histórico."""
    consents = await consent_service.list_user_consents(
        db, current_user.id, include_revoked=include_revoked,
    )
    return [
        ConsentResponse(
            id=c.id,
            type=c.type.value,
            version=c.version,
            granted_at=c.granted_at,
            revoked_at=c.revoked_at,
            expires_at=c.expires_at,
            is_active=c.is_active,
        )
        for c in consents
    ]


@router.post("/me/consents", response_model=ConsentResponse, status_code=status.HTTP_201_CREATED)
async def grant_consent(
    payload: ConsentGrantPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Concede um consentimento. Idempotente quando o documento ativo é o mesmo
    já consentido (mesma versão). Quando há nova versão, revoga a anterior e
    cria um novo registro.
    """
    consent_type = _parse_consent_type(payload.type)
    try:
        consent = await consent_service.grant(
            db,
            user_id=current_user.id,
            consent_type=consent_type,
            request=request,
            locale=payload.locale or "pt-BR",
            scope_metadata=payload.scope_metadata,
        )
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    logger.info(
        f"Consent {consent_type.value}@{consent.version} concedido por user={current_user.id}"
    )
    return ConsentResponse(
        id=consent.id,
        type=consent.type.value,
        version=consent.version,
        granted_at=consent.granted_at,
        revoked_at=consent.revoked_at,
        expires_at=consent.expires_at,
        is_active=consent.is_active,
    )


@router.delete("/me/consents/{consent_type}", status_code=status.HTTP_200_OK)
async def revoke_consent(
    consent_type: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Revoga o consentimento ativo do tipo informado."""
    parsed_type = _parse_consent_type(consent_type)
    revoked = await consent_service.revoke(
        db, user_id=current_user.id, consent_type=parsed_type, request=request,
    )
    await db.commit()

    if revoked is None:
        return {"revoked": False, "reason": "no_active_consent"}

    logger.info(
        f"Consent {parsed_type.value} revogado por user={current_user.id}"
    )
    return {
        "revoked": True,
        "type": parsed_type.value,
        "revoked_at": revoked.revoked_at,
    }


@router.get("/me/consents/active-documents", response_model=List[ActiveDocumentResponse])
async def get_active_consent_documents(
    locale: str = "pt-BR",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retorna os documentos de consentimento ativos no idioma informado.
    Usado pelo frontend para mostrar o texto exato a ser consentido.
    """
    docs = []
    for consent_type in ConsentDocumentType:
        doc = await consent_service.get_active_document(db, consent_type, locale=locale)
        if doc is not None:
            docs.append(ActiveDocumentResponse(
                type=doc.type.value,
                version=doc.version,
                locale=doc.locale,
                title=doc.title,
                body=doc.body,
                content_hash=doc.content_hash,
                default_ttl_days=doc.default_ttl_days,
            ))
    return docs
