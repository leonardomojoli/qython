# qython/backend/routes/admin_routes.py

import logging
import secrets
import csv
from io import StringIO
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc
from sqlalchemy.orm import selectinload
import json
import os

from ..database import get_db
from ..models import User, Invitation, Consultation, Transaction, Feedback, TrainingData, SettingsAuditLog, ServerMetrics, Medication, Pharmacy, PharmacyChain, PharmacyWaitlist, PrescriptionShare, UserActivity
from ..security import get_current_active_user
from ..config import Config
from ..services.system_settings_service import SystemSettingsService
from ..services.admin_notifications import AdminNotificationService

logger = logging.getLogger("qython_logger")
router = APIRouter()

# --- Dependência de Segurança ---
def get_current_admin_user(current_user: User = Depends(get_current_active_user)):
    if not current_user.is_admin:
        logger.warning(f"Acesso negado ao painel admin para: {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Acesso restrito a administradores."
        )
    return current_user

# --- Models ---
class DashboardStats(BaseModel):
    total_users: int
    active_users: int
    waitlist_users: int
    total_consultations: int
    total_medications: int = 0
    total_pharmacies: int = 0
    total_pharmacy_chains: int = 0
    pending_waitlist: int = 0
    total_prescription_shares: int = 0

class GenerateInvitePayload(BaseModel):
    quantity: int = 1

class InviteResponse(BaseModel):
    token: str
    is_used: bool
    used_by_email: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True

# --- Endpoints ---

@router.get("/stats", response_model=DashboardStats)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Retorna estatísticas gerais para o dashboard."""
    
    # Contagens de usuários
    total_users = await db.scalar(select(func.count(User.id)))
    active_users = await db.scalar(select(func.count(User.id)).where(User.status == 'active'))
    waitlist_users = await db.scalar(select(func.count(User.id)).where(User.status == 'waitlist'))
    
    # Contagem de consultas
    total_consultations = await db.scalar(select(func.count(Consultation.id)))
    
    # Pharmacy module stats
    total_medications = await db.scalar(select(func.count(Medication.id)).where(Medication.is_active == True)) or 0
    total_pharmacies = await db.scalar(select(func.count(Pharmacy.id)).where(Pharmacy.is_active == True)) or 0
    total_pharmacy_chains = await db.scalar(select(func.count(PharmacyChain.id)).where(PharmacyChain.is_active == True)) or 0
    pending_waitlist = await db.scalar(select(func.count(PharmacyWaitlist.id)).where(PharmacyWaitlist.status == 'pending')) or 0
    total_prescription_shares = await db.scalar(select(func.count(PrescriptionShare.id))) or 0

    return {
        "total_users": total_users,
        "active_users": active_users,
        "waitlist_users": waitlist_users,
        "total_consultations": total_consultations,
        "total_medications": total_medications,
        "total_pharmacies": total_pharmacies,
        "total_pharmacy_chains": total_pharmacy_chains,
        "pending_waitlist": pending_waitlist,
        "total_prescription_shares": total_prescription_shares,
    }

@router.post("/invitations/generate", status_code=status.HTTP_201_CREATED)
async def generate_invitations(
    payload: GenerateInvitePayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Gera N tokens de convite novos."""
    new_invites = []
    try:
        for _ in range(payload.quantity):
            token = secrets.token_urlsafe(32)
            invite = Invitation(token=token, is_used=False, created_at=datetime.now(timezone.utc))
            db.add(invite)
            new_invites.append(token)
        
        await db.commit()
        logger.info(f"Admin {admin.email} gerou {payload.quantity} novos convites.")
        return {"message": "Convites gerados com sucesso.", "tokens": new_invites}
    except Exception as e:
        await db.rollback()
        logger.error(f"Erro ao gerar convites: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gerar convites.")

@router.get("/invitations", response_model=List[InviteResponse])
async def list_invitations(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Lista os últimos 50 convites gerados."""
    result = await db.execute(
        select(Invitation)
        .options(selectinload(Invitation.used_by))
        .order_by(Invitation.created_at.desc())
        .limit(50)
    )
    invites = result.scalars().all()
    
    response_data = []
    for inv in invites:
        response_data.append({
            "token": inv.token, 
            "is_used": inv.is_used,
            "used_by_email": inv.used_by.email if inv.used_by else None,
            "created_at": inv.created_at.strftime("%d/%m/%Y %H:%M")
        })
        
    return response_data


@router.delete("/invitations/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Exclui um convite SE ele não tiver sido usado."""
    result = await db.execute(select(Invitation).filter(Invitation.token == token))
    invite = result.scalars().first()
    
    if not invite:
        raise HTTPException(status_code=404, detail="Convite não encontrado.")
    
    if invite.is_used:
        raise HTTPException(status_code=400, detail="Não é possível excluir um convite que já foi utilizado.")
        
    await db.delete(invite)
    await db.commit()
    logger.info(f"Admin {admin.email} excluiu o convite {token}")
    return None


# --- User Management Models ---
class AdminUserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    occupation: str
    country: Optional[str]
    status: str
    verification_status: str
    is_admin: bool = False
    created_at: str

    class Config:
        from_attributes = True


class VerifyUserPayload(BaseModel):
    action: str  # 'approve' or 'reject'
    reason: Optional[str] = None


# --- User Management Endpoints ---

@router.get("/users", response_model=List[AdminUserResponse])
async def list_users(
    filter_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Lista usuarios para gestao admin."""
    query = select(User).order_by(desc(User.created_at)).limit(100)
    
    if filter_status:
        if filter_status == 'manual_review':
            query = query.where(User.verification_status == 'manual_review')
        elif filter_status == 'waitlist':
            query = query.where(User.status == 'waitlist')
        elif filter_status == 'pending':
            query = query.where(User.verification_status == 'pending')
            
    result = await db.execute(query)
    users = result.scalars().all()
    
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "occupation": u.occupation or "",
            "country": u.country,
            "status": u.status,
            "verification_status": u.verification_status or "pending",
            "access_granted": bool(u.access_granted),
            "is_admin": u.is_admin,
            "created_at": u.created_at.strftime("%d/%m/%Y") if u.created_at else ""
        }
        for u in users
    ]


@router.post("/users/{user_id}/verify", status_code=status.HTTP_200_OK)
async def verify_user_manual(
    user_id: int,
    payload: VerifyUserPayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Concede ou revoga ACESSO à plataforma manualmente.

    NÃO mexe em verification_status: a verificação de identidade é do Latreo (única
    fonte de verdade — o Qython não pode forjá-la nem influenciá-la). Isto é só a
    política de ACESSO do Qython, que libera o uso das features de IA sem afirmar que
    o usuário é Latreo-verificado.
    """
    from ..services.email_service import send_verification_revoked_email

    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    if payload.action == 'approve':
        # Concede ACESSO (política do Qython) — NÃO toca em verification_status.
        user.status = 'active'
        user.access_granted = True
        user.verification_notes = f"Acesso concedido manualmente por {admin.email}"
        logger.info(f"User {user.email} access granted by admin {admin.email}")
    elif payload.action == 'reject':
        # Revoga o ACESSO concedido pelo Qython (não mexe na verificação Latreo).
        had_access = user.access_granted
        user.access_granted = False
        user.verification_notes = payload.reason or "Acesso revogado manualmente."
        if had_access:
            lang = getattr(user, 'language_preference', None) or 'pt'
            send_verification_revoked_email(user.email, user.full_name, user.verification_notes, lang)
        logger.info(f"User {user.email} access revoked by admin {admin.email}")
    else:
        raise HTTPException(status_code=400, detail="Acao invalida. Use 'approve' ou 'reject'.")

    await db.commit()
    return {"message": f"Acesso {'concedido' if payload.action == 'approve' else 'revogado'} com sucesso."}


@router.post("/users/{user_id}/send-invite", status_code=status.HTTP_200_OK)
async def send_invite_to_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Gera um convite, associa ao usuário, envia por e-mail e ativa a conta.
    One-click invite from admin panel.
    """
    from ..services.email_service import send_invite_email
    
    # 1. Buscar usuário
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    if user.status == 'active':
        return {"message": "Usuário já está ativo.", "already_active": True}

    # 2. Gerar Token de Convite
    token = secrets.token_urlsafe(32)
    invite = Invitation(
        token=token,
        is_used=True,  # Já marcamos como usado pois estamos vinculando diretamente
        used_by_user_id=user.id,
        created_at=datetime.now(timezone.utc)
    )
    db.add(invite)
    
    # 3. Atualizar Usuário para Ativo
    user.status = 'active'
    
    # 4. Enviar E-mail (Passando o idioma do usuário, ou 'pt' como fallback)
    user_lang = user.language_preference if hasattr(user, 'language_preference') and user.language_preference else "pt"
    email_sent = send_invite_email(user.email, user.full_name, token, lang=user_lang)
    
    if not email_sent:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Falha ao enviar e-mail. Tente novamente.")
        
    await db.commit()
    
    logger.info(f"Admin {admin.email} enviou convite e ativou usuário {user.email}")
    return {"message": f"Convite enviado para {user.email} e conta ativada!", "token": token}


# --- PRIORIDADE 2: MÉTRICAS DE RETENÇÃO E FEEDBACK ---



@router.get("/analytics/engagement", status_code=status.HTTP_200_OK)
async def get_engagement_metrics(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Métricas avançadas: DAU (aprox) e Conversão."""
    one_day_ago = datetime.now(timezone.utc) - timedelta(days=1)
    
    # Usuários ativos nas últimas 24h (baseado em consultas criadas)
    active_users_count = await db.scalar(
        select(func.count(func.distinct(Consultation.user_id)))
        .where(Consultation.created_at >= one_day_ago)
    ) or 0

    # Taxa de Conversão (Waitlist -> Active)
    total_waitlist = await db.scalar(select(func.count(User.id)).where(User.status == 'waitlist')) or 0
    total_active = await db.scalar(select(func.count(User.id)).where(User.status == 'active')) or 0
    
    conversion_rate = 0
    if (total_waitlist + total_active) > 0:
        conversion_rate = (total_active / (total_waitlist + total_active)) * 100

    total_feedbacks = await db.scalar(select(func.count(Feedback.id))) or 0

    return {
        "dau_proxy": active_users_count,
        "conversion_rate": round(conversion_rate, 1),
        "total_feedbacks": total_feedbacks
    }


# =============================================================================
# ANALYTICS DASHBOARD ENDPOINTS
# =============================================================================

@router.get("/analytics/dau-mau")
async def get_dau_mau(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """DAU/WAU/MAU metrics over time using last_login_at."""
    from sqlalchemy import cast, Date

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)

    # DAU per day
    dau_result = await db.execute(
        select(
            cast(User.last_login_at, Date).label('day'),
            func.count(func.distinct(User.id))
        )
        .where(User.last_login_at >= start)
        .group_by(cast(User.last_login_at, Date))
        .order_by(cast(User.last_login_at, Date))
    )
    dau_data = [{"date": str(row[0]), "count": row[1]} for row in dau_result.fetchall()]

    # Current totals
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    dau = await db.scalar(select(func.count(func.distinct(User.id))).where(User.last_login_at >= day_ago)) or 0
    wau = await db.scalar(select(func.count(func.distinct(User.id))).where(User.last_login_at >= week_ago)) or 0
    mau = await db.scalar(select(func.count(func.distinct(User.id))).where(User.last_login_at >= month_ago)) or 0
    total = await db.scalar(select(func.count(User.id)).where(User.status == 'active')) or 0

    # Previous week for comparison
    prev_week_start = week_ago - timedelta(days=7)
    prev_wau = await db.scalar(
        select(func.count(func.distinct(User.id))).where(
            User.last_login_at >= prev_week_start,
            User.last_login_at < week_ago,
        )
    ) or 0

    return {
        "dau": dau, "wau": wau, "mau": mau, "total_active": total,
        "wau_change": wau - prev_wau,
        "daily": dau_data,
    }


@router.get("/analytics/growth")
async def get_growth(
    period: str = "30d",
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """User registration growth grouped by day."""
    from sqlalchemy import cast, Date

    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map.get(period, 30)
    start = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            cast(User.created_at, Date).label('day'),
            func.count(User.id),
        )
        .where(User.created_at >= start)
        .group_by(cast(User.created_at, Date))
        .order_by(cast(User.created_at, Date))
    )

    return {"registrations": [{"date": str(row[0]), "count": row[1]} for row in result.fetchall()]}


@router.get("/analytics/retention")
async def get_retention(
    weeks: int = 8,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """Weekly cohort retention matrix."""
    now = datetime.now(timezone.utc)
    cohorts = []

    for w in range(weeks):
        cohort_start = now - timedelta(weeks=w + 1)
        cohort_end = now - timedelta(weeks=w)

        # Users who registered in this week
        cohort_count = await db.scalar(
            select(func.count(User.id)).where(
                User.created_at >= cohort_start,
                User.created_at < cohort_end,
            )
        ) or 0

        if cohort_count == 0:
            cohorts.append({"week": w, "cohort_size": 0, "retained": []})
            continue

        retained = []
        for rw in range(w + 1):
            ret_start = now - timedelta(weeks=rw + 1)
            ret_end = now - timedelta(weeks=rw)

            ret_count = await db.scalar(
                select(func.count(func.distinct(User.id))).where(
                    User.created_at >= cohort_start,
                    User.created_at < cohort_end,
                    User.last_login_at >= ret_start,
                    User.last_login_at < ret_end,
                )
            ) or 0
            retained.append(round(ret_count / cohort_count * 100, 1))

        cohorts.append({
            "week": w,
            "cohort_start": cohort_start.strftime("%Y-%m-%d"),
            "cohort_size": cohort_count,
            "retained": retained,
        })

    return {"cohorts": cohorts}


@router.get("/analytics/feature-usage")
async def get_feature_usage(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """Feature adoption from user_activity table."""
    start = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            UserActivity.feature,
            func.count(UserActivity.id),
            func.count(func.distinct(UserActivity.user_id)),
        )
        .where(UserActivity.created_at >= start)
        .group_by(UserActivity.feature)
    )

    features = [
        {"feature": row[0], "total_events": row[1], "unique_users": row[2]}
        for row in result.fetchall()
    ]

    return {"features": features, "period_days": days}


@router.get("/analytics/ai-usage")
async def get_ai_usage(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """AI generation usage by type + dracma spend."""
    from ..models import DracmaLedger

    start = datetime.now(timezone.utc) - timedelta(days=days)

    # Generations by feature+action
    result = await db.execute(
        select(
            UserActivity.feature,
            UserActivity.action,
            func.count(UserActivity.id),
        )
        .where(UserActivity.created_at >= start)
        .group_by(UserActivity.feature, UserActivity.action)
        .order_by(func.count(UserActivity.id).desc())
    )

    usage = [
        {"feature": row[0], "action": row[1], "count": row[2]}
        for row in result.fetchall()
    ]

    # Total dracmas consumed in period
    total_consumed = await db.scalar(
        select(func.sum(DracmaLedger.amount - DracmaLedger.remaining))
        .where(DracmaLedger.acquired_at >= start)
    ) or 0

    return {"usage": usage, "total_dracmas_consumed": round(total_consumed, 1), "period_days": days}


# --- PRIORIDADE 3: GESTÃO DE PROMPTS ---

PROMPTS_FILE = os.path.join(Config.CONFIG_DIR, 'system_prompts.json')


@router.get("/prompts", status_code=status.HTTP_200_OK)
async def get_system_prompts(admin: User = Depends(get_current_admin_user)):
    """
    Retorna os prompts atuais da memória do sistema.
    Isso garante que, se o arquivo não existir, os defaults hardcoded sejam retornados.
    """
    # Importação tardia para evitar ciclo e pegar o estado atual da memória
    from ..services.llm_services import current_prompts
    return current_prompts


@router.post("/prompts", status_code=status.HTTP_200_OK)
async def save_system_prompts(
    prompts: dict,
    admin: User = Depends(get_current_admin_user)
):
    """Salva novos prompts e força a atualização no serviço de LLM."""
    os.makedirs(os.path.dirname(PROMPTS_FILE), exist_ok=True)
    with open(PROMPTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(prompts, f, indent=2, ensure_ascii=False)
    
    # Recarrega no serviço de LLM
    try:
        from ..services.llm_services import reload_system_prompts
        reload_system_prompts()
    except ImportError:
        logger.warning("Função reload_system_prompts não encontrada em llm_services")
    
    logger.info(f"Prompts do sistema atualizados por {admin.email}")
    return {"message": "Prompts atualizados com sucesso!"}


# --- PRIORIDADE 4: DETALHAMENTO (DRILL DOWN) ---

@router.get("/details/consultations", status_code=status.HTTP_200_OK)
async def get_consultations_detail(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Lista as últimas consultas com detalhes do usuário."""
    result = await db.execute(
        select(Consultation)
        .options(selectinload(Consultation.user))
        .order_by(Consultation.created_at.desc())
        .limit(limit)
    )
    consultations = result.scalars().all()
    
    return [
        {
            "id": c.id,
            "specialty": c.specialty,
            "is_first": c.is_first_consultation,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "user_email": c.user.email if c.user else "Deletado",
            "user_name": c.user.full_name if c.user else "Usuário Deletado"
        }
        for c in consultations
    ]




# --- PRIORIDADE 5: EXPORTAÇÃO DE LEADS DE MARKETING ---



# --- PRIORIDADE 6: GESTÃO DE BANIMENTO ---

class BanUserPayload(BaseModel):
    reason: str  # Chave do motivo: 'terms_violation', 'security_risk', etc.


@router.post("/users/{user_id}/ban", status_code=status.HTTP_200_OK)
async def ban_user(
    user_id: int,
    payload: BanUserPayload,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Suspende um usuário e envia notificação por e-mail."""
    from ..services.email_service import send_ban_email
    
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Não é possível banir um administrador.")
    
    user.status = 'banned'
    await db.commit()
    
    # Envia e-mail traduzido
    lang = user.language_preference or 'pt'
    send_ban_email(user.email, user.full_name, payload.reason, lang)
    
    logger.info(f"Usuário {user.email} banido por {admin.email}. Motivo: {payload.reason}")
    return {"message": "Usuário suspenso com sucesso."}


@router.post("/users/{user_id}/unban", status_code=status.HTTP_200_OK)
async def unban_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Reativa a conta de um usuário banido."""
    from ..services.email_service import send_unban_email
    
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    user.status = 'active'
    await db.commit()
    
    lang = user.language_preference or 'pt'
    send_unban_email(user.email, user.full_name, lang)
    
    logger.info(f"Usuário {user.email} desbanido por {admin.email}")
    return {"message": "Usuário reativado com sucesso."}


# --- PRIORIDADE 7: ML DATASET STATISTICS (AGGREGATED ONLY - NO RAW DATA) ---



# =============================================================================
# SYSTEM SETTINGS & ADMIN CONTROLS
# =============================================================================

class SettingUpdatePayload(BaseModel):
    value: str
    reason: Optional[str] = None


@router.get("/settings", status_code=status.HTTP_200_OK)
async def get_all_settings(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Get all system settings (admin only)."""
    settings = await SystemSettingsService.get_all(db)
    return settings


@router.get("/settings/public", status_code=status.HTTP_200_OK)
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Get public settings (no auth required - for frontend to check gateway status)."""
    return await SystemSettingsService.get_public_settings(db)


@router.put("/settings/{key}", status_code=status.HTTP_200_OK)
async def update_setting(
    key: str,
    payload: SettingUpdatePayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Update a system setting (admin only)."""
    # Validate key
    valid_keys = SystemSettingsService.DEFAULTS.keys()
    if key not in valid_keys:
        raise HTTPException(status_code=400, detail=f"Invalid setting key: {key}")

    # Get old value for notification
    old_value = await SystemSettingsService.get(key, db)

    # Update setting
    await SystemSettingsService.set(
        key,
        payload.value,
        db,
        user_id=admin.id,
        request=request,
        reason=payload.reason
    )

    # Send notification for critical settings
    critical_settings = [
        "server_maintenance_level",
        "new_registrations_enabled"
    ]
    if key in critical_settings:
        await AdminNotificationService.send_setting_change_notification(
            db,
            key,
            old_value,
            payload.value,
            admin,
            request.client.host if request.client else None
        )

    logger.info(f"Setting {key} updated by {admin.email}: {old_value} -> {payload.value}")
    return {"message": "Setting updated successfully", "key": key, "value": payload.value}


@router.get("/settings/audit-log", status_code=status.HTTP_200_OK)
async def get_settings_audit_log(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Get audit log of settings changes."""
    result = await db.execute(
        select(SettingsAuditLog)
        .options(selectinload(SettingsAuditLog.user))
        .order_by(SettingsAuditLog.changed_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "setting_key": log.setting_key,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "changed_by": log.user.email if log.user else "Sistema",
            "changed_at": log.changed_at.isoformat() if log.changed_at else None,
            "ip_address": log.ip_address,
            "reason": log.reason
        }
        for log in logs
    ]




@router.get("/rate-limits/violations", status_code=status.HTTP_200_OK)
async def get_rate_limit_violations(
    hours: int = 24,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Get rate limit violations for the last N hours."""
    from ..middleware.rate_limiter import get_rate_limit_violations

    try:
        violations = await get_rate_limit_violations(db, hours)
        return {"violations": violations, "period_hours": hours}
    except Exception as e:
        logger.error(f"Error fetching rate limit violations: {e}")
        return {"violations": [], "period_hours": hours, "error": str(e)}




# =============================================================================
# DPO PREFERENCE DATA EXPORT
# =============================================================================







# =============================================================================
# DRACMA LEDGER MANAGEMENT
# =============================================================================













# =============================================================================
# ACADEMIC LIBRARY MANAGEMENT
# =============================================================================

@router.post("/libraries/{library_id}/reindex", status_code=status.HTTP_200_OK)
async def reindex_library(
    library_id: int,
    admin: User = Depends(get_current_admin_user)
):
    """
    Re-indexes all documents of a library into ChromaDB.

    Use this when:
    - ChromaDB collection is missing
    - Documents were uploaded but indexing failed
    - Need to rebuild the vector store
    """
    from ..services.academic_services.library_service import reindex_library_documents

    logger.info(f"Admin {admin.email} triggered reindex for library {library_id}")

    try:
        result = await reindex_library_documents(library_id)

        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result.get("error", "Library not found")
            )

        logger.info(f"Library {library_id} reindex complete: {result}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reindexing library {library_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error reindexing library: {str(e)}"
        )


# =============================================================================
# ML PIPELINE MANAGEMENT
# =============================================================================













# =============================================================================
# QUALITY DECAY DETECTION
# =============================================================================







# =============================================================================
# ITERATIVE REFINEMENT TRACKING
# =============================================================================





