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
    total_revenue: float
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
    
    # Receita total (soma de transações positivas)
    total_revenue = await db.scalar(select(func.sum(Transaction.amount)).where(Transaction.amount > 0)) or 0.0

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
        "total_revenue": total_revenue,
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

@router.get("/feedbacks", status_code=status.HTTP_200_OK)
async def get_recent_feedbacks(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Retorna os feedbacks mais recentes para análise de qualidade."""
    result = await db.execute(
        select(Feedback)
        .options(selectinload(Feedback.user))
        .order_by(Feedback.created_at.desc())
        .limit(limit)
    )
    feedbacks = result.scalars().all()
    
    return [
        {
            "id": fb.id,
            "feedback_type": fb.feedback_type,
            "feedback_text": fb.feedback_text,
            "content_type": fb.content_type,
            "created_at": fb.created_at.isoformat() if fb.created_at else None,
            "user": {"full_name": fb.user.full_name if fb.user else "Anônimo"}
        }
        for fb in feedbacks
    ]


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

PROMPTS_FILE = os.path.join(Config.PROJECT_ROOT, 'config', 'system_prompts.json')


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


@router.get("/details/finance", status_code=status.HTTP_200_OK)
async def get_finance_detail(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Lista as últimas transações com detalhes."""
    result = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.user))
        .order_by(Transaction.timestamp.desc())
        .limit(limit)
    )
    transactions = result.scalars().all()
    
    # Agregação simples de receita por produto
    product_revenue = {}
    for t in transactions:
        if t.status == 'completed':
            prod = t.description or "Outros"
            product_revenue[prod] = product_revenue.get(prod, 0) + t.amount

    return {
        "transactions": [
            {
                "id": t.id,
                "amount": t.amount,
                "currency": t.currency,
                "provider": t.provider,
                "description": t.description,
                "status": t.status,
                "date": t.timestamp.isoformat() if t.timestamp else None,
                "user_email": t.user.email if t.user else "Deletado",
                "user_name": t.user.full_name if t.user else "Usuário Deletado"
            }
            for t in transactions
        ],
        "product_breakdown": product_revenue
    }


# --- PRIORIDADE 5: EXPORTAÇÃO DE LEADS DE MARKETING ---

@router.get("/export/marketing-leads", status_code=status.HTTP_200_OK)
async def export_marketing_leads(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Gera um CSV com usuários que aceitaram receber marketing.
    Campos: Nome, Email, Ocupação, País, Data de Cadastro, Status.
    """
    # Buscar usuários com consentimento de marketing
    result = await db.execute(
        select(User)
        .where(User.marketing_consent == True)
        .order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    
    # Criar CSV em memória
    output = StringIO()
    writer = csv.writer(output)
    
    # Cabeçalho
    writer.writerow(['Nome Completo', 'Email', 'Ocupação', 'País', 'Data Cadastro', 'Status'])
    
    # Dados
    for user in users:
        writer.writerow([
            user.full_name,
            user.email,
            user.occupation,
            user.country or 'N/A',
            user.created_at.strftime("%Y-%m-%d") if user.created_at else 'N/A',
            user.status
        ])
    
    output.seek(0)
    
    # Retornar como arquivo para download
    response = StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv"
    )
    response.headers["Content-Disposition"] = "attachment; filename=qython_marketing_leads.csv"
    return response


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

@router.get("/ml-dataset-stats", status_code=status.HTTP_200_OK)
async def get_ml_dataset_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Retorna estatísticas agregadas do dataset de treinamento.
    SEGURANÇA: Nenhum dado bruto de paciente é exposto via API.
    """
    
    # === 1. TRAINING DATA STATS ===
    total_training = await db.scalar(select(func.count(TrainingData.id))) or 0
    ready_for_training = await db.scalar(
        select(func.count(TrainingData.id)).where(TrainingData.ready_for_training == True)
    ) or 0
    
    # By source type
    source_result = await db.execute(
        select(TrainingData.source_type, func.count(TrainingData.id))
        .group_by(TrainingData.source_type)
    )
    by_source = {row[0]: row[1] for row in source_result.fetchall()}
    
    # By quality score
    quality_labels = {-2: 'rejected', -1: 'dislike', 0: 'neutral', 1: 'like', 2: 'gold', 3: 'platinum'}
    quality_result = await db.execute(
        select(TrainingData.quality_score, func.count(TrainingData.id))
        .group_by(TrainingData.quality_score)
    )
    by_quality_raw = {row[0]: row[1] for row in quality_result.fetchall()}
    by_quality = {quality_labels.get(k, str(k)): v for k, v in by_quality_raw.items()}
    
    return {
        "training_data": {
            "total_entries": total_training,
            "ready_for_training": ready_for_training,
            "by_source": by_source,
            "by_quality": by_quality
        },
        "_security_note": "Only aggregated statistics are exposed. Raw patient data is kept on server only."
    }


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
        "payment_gateway_stripe_enabled",
        "payment_gateway_binance_enabled",
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


@router.get("/metrics", status_code=status.HTTP_200_OK)
async def get_server_metrics(
    hours: int = 24,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Get server metrics for the last N hours."""
    from ..services.server_monitor import ServerMonitor

    metrics_history = await ServerMonitor.get_metrics_history(db, hours)
    latest = await ServerMonitor.get_latest_metrics(db)

    return {
        "latest": {
            "cpu_percent": latest.cpu_percent if latest else None,
            "memory_percent": latest.memory_percent if latest else None,
            "disk_percent": latest.disk_percent if latest else None,
            "active_connections": latest.active_connections if latest else None,
            "timestamp": latest.timestamp.isoformat() if latest and latest.timestamp else None
        } if latest else None,
        "history": metrics_history,
        "count": len(metrics_history)
    }


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


@router.post("/maintenance/override", status_code=status.HTTP_200_OK)
async def override_auto_maintenance(
    hours: int = 1,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Override auto-maintenance for specified hours."""
    if hours < 1 or hours > 24:
        raise HTTPException(status_code=400, detail="Hours must be between 1 and 24")

    await SystemSettingsService.set_auto_maintenance_override(
        db,
        hours,
        user_id=admin.id,
        request=request
    )

    logger.info(f"Auto-maintenance overridden for {hours} hours by {admin.email}")
    return {"message": f"Auto-maintenance disabled for {hours} hour(s)"}


# =============================================================================
# DPO PREFERENCE DATA EXPORT
# =============================================================================

@router.get("/export/dpo/stats", status_code=status.HTTP_200_OK)
async def get_dpo_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Get statistics about preference data for DPO training."""
    from ..services.preference_service import get_preference_stats

    stats = await get_preference_stats(db)
    return stats


@router.get("/export/dpo/jsonl", status_code=status.HTTP_200_OK)
async def export_dpo_jsonl(
    source_type: Optional[str] = None,
    min_confidence: float = 0.0,
    language: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Export preference pairs in JSONL format for DPO training.

    Compatible with TRL (Transformers Reinforcement Learning) and TorchTune.

    Query params:
    - source_type: Filter by source (e.g., 'chat_regeneration', 'icd10_correction')
    - min_confidence: Minimum confidence score (0.0-1.0)
    - language: Filter by language code (e.g., 'pt-BR', 'en')

    Returns:
    - JSONL file download with format: {"prompt": "...", "chosen": "...", "rejected": "..."}
    """
    from ..services.preference_service import export_dpo_jsonl_validated as do_export

    source_types = [source_type] if source_type else None

    try:
        output_path, report = await do_export(
            db=db,
            exporter_user_id=admin.id,
            source_types=source_types,
            min_confidence=min_confidence,
            language=language,
        )
        await db.commit()

        with open(output_path, 'r', encoding='utf-8') as f:
            content = f.read()

        filename = output_path.split('/')[-1].split('\\')[-1]

        response = StreamingResponse(
            iter([content]),
            media_type="application/jsonlines"
        )
        response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        response.headers["X-Qython-Export-Summary"] = json.dumps(report.summary)

        return response

    except Exception as e:
        await db.rollback()
        logger.error(f"Error exporting DPO JSONL: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error exporting DPO data: {str(e)}"
        )


@router.get("/export/dpo/parquet", status_code=status.HTTP_200_OK)
async def export_dpo_parquet(
    source_type: Optional[str] = None,
    min_confidence: float = 0.0,
    language: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Export preference pairs in Parquet format for DPO training.

    Parquet is more efficient for large datasets and is the preferred format
    for Hugging Face Datasets.

    Query params:
    - source_type: Filter by source (e.g., 'chat_regeneration', 'icd10_correction')
    - min_confidence: Minimum confidence score (0.0-1.0)
    - language: Filter by language code (e.g., 'pt-BR', 'en')

    Returns:
    - Parquet file download
    """
    from ..services.preference_service import export_dpo_parquet_validated as do_export

    source_types = [source_type] if source_type else None

    try:
        output_path, report = await do_export(
            db=db,
            exporter_user_id=admin.id,
            source_types=source_types,
            min_confidence=min_confidence,
            language=language,
        )
        await db.commit()

        with open(output_path, 'rb') as f:
            content = f.read()

        filename = output_path.split('/')[-1].split('\\')[-1]

        response = StreamingResponse(
            iter([content]),
            media_type="application/octet-stream"
        )
        response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        response.headers["X-Qython-Export-Summary"] = json.dumps(report.summary)

        return response

    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Parquet export requires pandas and pyarrow. Use JSONL export instead."
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Error exporting DPO Parquet: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error exporting DPO data: {str(e)}"
        )


# =============================================================================
# DRACMA LEDGER MANAGEMENT
# =============================================================================

@router.post("/dracma/process-expirations", status_code=status.HTTP_200_OK)
async def process_dracma_expirations(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Processa dracmas expirados, marcando-os como 'expired'.
    Deve ser chamado manualmente ou por um cron job.
    """
    from ..services.billing_service import process_expired_dracmas

    try:
        num_batches, total_amount = await process_expired_dracmas(db)
        return {
            "message": "Expiration processing completed",
            "batches_expired": num_batches,
            "total_dracmas_expired": total_amount
        }
    except Exception as e:
        logger.error(f"Error processing dracma expirations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing expirations: {str(e)}"
        )


@router.post("/dracma/send-expiration-notifications/{days}", status_code=status.HTTP_200_OK)
async def send_dracma_expiration_notifications(
    days: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Envia notificações de expiração para usuários com dracmas expirando.

    Args:
        days: Dias até expiração (30, 7, ou 1)
    """
    from ..services.billing_service import get_expiring_soon_notifications, mark_notification_sent
    from ..services.email_service import send_dracma_expiration_email

    if days not in [30, 7, 1]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Days must be 30, 7, or 1"
        )

    try:
        notifications = await get_expiring_soon_notifications(db, days)
        sent_count = 0
        failed_count = 0

        for notification in notifications:
            # Extract language from preference
            lang = notification["language"][:2] if notification["language"] else "pt"

            success = send_dracma_expiration_email(
                email=notification["email"],
                user_name=notification["full_name"],
                amount=notification["total_expiring"],
                days_until_expiration=days,
                lang=lang
            )

            if success:
                sent_count += 1
                # Mark batches as notified
                ledger_ids = [b["ledger_id"] for b in notification["batches"]]
                await mark_notification_sent(ledger_ids, days, db)
            else:
                failed_count += 1

        return {
            "message": f"Notifications sent for {days}-day expiration warning",
            "users_notified": sent_count,
            "failed": failed_count,
            "total_users": len(notifications)
        }
    except Exception as e:
        logger.error(f"Error sending expiration notifications: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error sending notifications: {str(e)}"
        )


@router.post("/dracma/migrate-user/{user_id}", status_code=status.HTTP_200_OK)
async def migrate_user_to_ledger(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Migra o saldo de dracmas de um usuário específico para o ledger.
    """
    from ..services.billing_service import migrate_user_dracmas_to_ledger

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        entry = await migrate_user_dracmas_to_ledger(user, db)
        await db.commit()

        if entry:
            return {
                "message": "User migrated to ledger",
                "user_id": user_id,
                "amount_migrated": entry.amount,
                "expires_at": entry.expires_at.isoformat()
            }
        else:
            return {
                "message": "User has no balance to migrate or already migrated",
                "user_id": user_id
            }
    except Exception as e:
        logger.error(f"Error migrating user {user_id} to ledger: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error migrating user: {str(e)}"
        )


@router.post("/dracma/migrate-all-users", status_code=status.HTTP_200_OK)
async def migrate_all_users_to_ledger(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Migra todos os usuários com saldo de dracmas para o ledger.
    CUIDADO: Este endpoint pode demorar para muitos usuários.
    """
    from ..services.billing_service import migrate_user_dracmas_to_ledger

    # Buscar usuários com saldo > 0
    result = await db.execute(
        select(User).where(User.dracmas > 0)
    )
    users = result.scalars().all()

    migrated_count = 0
    skipped_count = 0
    errors = []

    for user in users:
        try:
            entry = await migrate_user_dracmas_to_ledger(user, db)
            if entry:
                migrated_count += 1
            else:
                skipped_count += 1
        except Exception as e:
            errors.append({"user_id": user.id, "error": str(e)})
            logger.error(f"Error migrating user {user.id}: {e}")

    await db.commit()

    return {
        "message": "Migration completed",
        "total_users": len(users),
        "migrated": migrated_count,
        "skipped": skipped_count,
        "errors": errors[:10]  # Limitar erros retornados
    }


@router.get("/dracma/user/{user_id}/balance", status_code=status.HTTP_200_OK)
async def get_user_dracma_balance(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Retorna o breakdown detalhado do saldo de dracmas de um usuário.
    """
    from ..services.billing_service import get_user_balance_breakdown

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    breakdown = await get_user_balance_breakdown(user, db)

    return {
        "user_id": user_id,
        "email": user.email,
        "legacy_balance": user.dracmas,
        **breakdown
    }


@router.get("/dracma/expiration-stats", status_code=status.HTTP_200_OK)
async def get_dracma_expiration_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Retorna estatísticas de expiração de dracmas no sistema.
    """
    from ..models import DracmaLedger

    now = datetime.now(timezone.utc)
    thirty_days = now + timedelta(days=30)
    seven_days = now + timedelta(days=7)
    one_day = now + timedelta(days=1)

    # Total ativo
    total_active = await db.scalar(
        select(func.sum(DracmaLedger.remaining))
        .where(DracmaLedger.status == 'active')
        .where(DracmaLedger.expires_at > now)
    ) or 0

    # Expirando em 30 dias
    expiring_30d = await db.scalar(
        select(func.sum(DracmaLedger.remaining))
        .where(DracmaLedger.status == 'active')
        .where(DracmaLedger.expires_at <= thirty_days)
        .where(DracmaLedger.expires_at > now)
    ) or 0

    # Expirando em 7 dias
    expiring_7d = await db.scalar(
        select(func.sum(DracmaLedger.remaining))
        .where(DracmaLedger.status == 'active')
        .where(DracmaLedger.expires_at <= seven_days)
        .where(DracmaLedger.expires_at > now)
    ) or 0

    # Expirando em 1 dia
    expiring_1d = await db.scalar(
        select(func.sum(DracmaLedger.remaining))
        .where(DracmaLedger.status == 'active')
        .where(DracmaLedger.expires_at <= one_day)
        .where(DracmaLedger.expires_at > now)
    ) or 0

    # Total já expirado
    total_expired = await db.scalar(
        select(func.sum(DracmaLedger.remaining))
        .where(DracmaLedger.status == 'expired')
    ) or 0

    # Breakdown por fonte
    result = await db.execute(
        select(DracmaLedger.source, func.sum(DracmaLedger.remaining))
        .where(DracmaLedger.status == 'active')
        .where(DracmaLedger.expires_at > now)
        .group_by(DracmaLedger.source)
    )
    by_source = {row[0]: row[1] for row in result.all()}

    return {
        "total_active": total_active,
        "expiring_in_30_days": expiring_30d,
        "expiring_in_7_days": expiring_7d,
        "expiring_in_1_day": expiring_1d,
        "total_expired": total_expired,
        "by_source": by_source
    }


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

@router.get("/ml/stats", status_code=status.HTTP_200_OK)
async def get_ml_pipeline_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Comprehensive ML pipeline statistics:
    - Training data by creation_method, bloom_level, generation_number
    - PII detection stats
    - Holdout set size
    - Preference pairs by source
    """
    from ..services.rlaif_service import get_rlaif_stats

    stats = await get_rlaif_stats(db)
    return stats


@router.post("/ml/holdout/build", status_code=status.HTTP_200_OK)
async def build_holdout_set(
    target_count: int = 500,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Build/expand the held-out evaluation set from highest-quality entries.
    Entries marked as holdout are NEVER used for training.
    """
    from ..services.rlaif_service import build_evaluation_holdout

    if target_count < 50 or target_count > 5000:
        raise HTTPException(status_code=400, detail="target_count must be between 50 and 5000")

    result = await build_evaluation_holdout(db, target_count=target_count)
    return result


@router.post("/ml/rlaif/run", status_code=status.HTTP_200_OK)
async def trigger_rlaif_batch(
    batch_size: int = 50,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Manually trigger an RLAIF AI-as-Judge batch.
    Scores unreviewed TrainingData entries with quality_score=0.
    """
    from ..services.rlaif_service import batch_judge_training_data

    if batch_size < 1 or batch_size > 200:
        raise HTTPException(status_code=400, detail="batch_size must be between 1 and 200")

    logger.info(f"Admin {admin.email} triggered RLAIF batch (size={batch_size})")
    result = await batch_judge_training_data(db, batch_size=batch_size)
    return result


@router.post("/ml/self-play/run", status_code=status.HTTP_200_OK)
async def trigger_self_play(
    batch_size: int = 20,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Manually trigger self-play preference pair generation.
    Generates synthetic DPO pairs from high-quality prompts.
    """
    from ..services.rlaif_service import self_play_generate_preferences

    if batch_size < 1 or batch_size > 50:
        raise HTTPException(status_code=400, detail="batch_size must be between 1 and 50")

    logger.info(f"Admin {admin.email} triggered self-play (size={batch_size})")
    result = await self_play_generate_preferences(db, batch_size=batch_size)
    return result


@router.get("/export/sft/jsonl", status_code=status.HTTP_200_OK)
async def export_sft_jsonl(
    source_type: Optional[str] = None,
    creation_method: Optional[str] = None,
    bloom_level: Optional[str] = None,
    max_generation: int = None,
    exclude_pii: bool = True,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Export training data in SFT (Supervised Fine-Tuning) JSONL format.

    Format: {"instruction": "...", "output": "...", "metadata": {...}}

    Filters:
    - source_type: Filter by source type
    - creation_method: Filter by 'human', 'ai_generated', 'hybrid'
    - bloom_level: Filter by Bloom's taxonomy level
    - max_generation: Exclude data from generation > N (prevent model collapse)
    - exclude_pii: Exclude entries with detected PII (default: True)

    Pre-export validator (LGPD compliance, mandatory):
      - drops entries whose user revoked consent or was deleted
      - drops entries whose consent has expired
      - re-runs PII detection against current patterns
      - records the export in dataset_export_logs (proof of minimization)
    """
    from sqlalchemy import and_
    from ..services.export_validator_service import (
        register_export, validate_entries_for_export,
    )

    query = select(TrainingData).where(
        and_(
            TrainingData.ready_for_training == True,
            TrainingData.is_evaluation_holdout == False,
            TrainingData.excluded_due_to_revocation == False,
        )
    )

    if source_type:
        query = query.where(TrainingData.source_type == source_type)
    if creation_method:
        query = query.where(TrainingData.creation_method == creation_method)
    if bloom_level:
        query = query.where(TrainingData.bloom_level == bloom_level)
    if max_generation is not None:
        query = query.where(TrainingData.generation_number <= max_generation)
    if exclude_pii:
        query = query.where(TrainingData.pii_detected == False)

    # Deprecated source types never enter training exports by default.
    # chat_off_topic (the old medicine-only refusals) must NOT teach the model to
    # refuse — the classifier gate that produced them was removed in 2026-05. An
    # admin can still inspect/pull them by passing source_type explicitly.
    DEPRECATED_TRAINING_SOURCES = ("chat_off_topic",)
    if not source_type:
        query = query.where(
            TrainingData.source_type.notin_(DEPRECATED_TRAINING_SOURCES)
        )

    result = await db.execute(query)
    candidates = list(result.scalars().all())

    # LGPD-mandatory validation step
    report = await validate_entries_for_export(
        db, candidates, enforce_pii_recheck=exclude_pii,
    )

    # Build JSONL content from the validated subset
    lines = []
    anon_levels_seen = set()
    for entry in report.valid:
        meta = entry.metadata_info or {}
        anon_levels_seen.add(entry.anonymization_level or "legacy")
        record = {
            "instruction": entry.input_data,
            "output": entry.output_data,
            "metadata": {
                "source_type": entry.source_type,
                "creation_method": entry.creation_method,
                "generation_number": entry.generation_number,
                "bloom_level": entry.bloom_level,
                "quality_score": entry.quality_score,
                "difficulty_score": entry.difficulty_score,
                "specialty": meta.get("specialty"),
                "lang": meta.get("lang", "pt-BR"),
                "anonymization_level": entry.anonymization_level,
            }
        }
        if entry.references:
            record["references"] = entry.references
        lines.append(json.dumps(record, ensure_ascii=False))

    content = "\n".join(lines)
    content_bytes = content.encode("utf-8")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"sft_{timestamp}.jsonl"

    # Persist the export log (Art. 12 proof of minimization)
    level = (
        "anon" if anon_levels_seen == {"anon"}
        else "pseudo" if anon_levels_seen == {"pseudo"}
        else "mixed"
    )
    await register_export(
        db,
        exporter_user_id=admin.id,
        export_type="sft_jsonl",
        dataset_bytes=content_bytes,
        report=report,
        anonymization_level=level,
        metadata={
            "filters": {
                "source_type": source_type,
                "creation_method": creation_method,
                "bloom_level": bloom_level,
                "max_generation": max_generation,
                "exclude_pii": exclude_pii,
            },
            "filename": filename,
        },
    )
    await db.commit()

    response = StreamingResponse(
        iter([content_bytes]),
        media_type="application/jsonlines"
    )
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.headers["X-Qython-Export-Summary"] = json.dumps(report.summary)
    return response


@router.post("/ml/pii/rescan", status_code=status.HTTP_200_OK)
async def rescan_pii(
    batch_size: int = 500,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Re-scan all training data entries with the current PII detector patterns.

    Use this after adding new country patterns to pii_detector.py so that
    existing entries get correctly flagged retroactively.

    Processes in batches to avoid memory issues on large datasets.
    """
    from ..services.pii_detector import detect_and_summarize

    total_scanned = 0
    total_flagged = 0
    total_cleared = 0

    while True:
        result = await db.execute(
            select(TrainingData)
            .order_by(TrainingData.id)
            .offset(total_scanned)
            .limit(batch_size)
        )
        entries = result.scalars().all()

        if not entries:
            break

        for entry in entries:
            pii_result = detect_and_summarize(entry.input_data or "", entry.output_data or "")
            new_flag = pii_result["pii_detected"]

            if new_flag != entry.pii_detected:
                entry.pii_detected = new_flag
                meta = entry.metadata_info or {}
                if new_flag:
                    meta["pii_types"] = pii_result["pii_types"]
                    meta["pii_count"] = pii_result["pii_count"]
                else:
                    meta.pop("pii_types", None)
                    meta.pop("pii_count", None)
                entry.metadata_info = meta

                if new_flag:
                    total_flagged += 1
                else:
                    total_cleared += 1

        total_scanned += len(entries)
        await db.commit()

        logger.info(f"[PII RESCAN] Progress: {total_scanned} scanned, {total_flagged} newly flagged, {total_cleared} cleared")

    logger.info(
        f"[PII RESCAN] Complete by {admin.email}: "
        f"{total_scanned} scanned, {total_flagged} flagged, {total_cleared} cleared"
    )
    return {
        "total_scanned": total_scanned,
        "newly_flagged": total_flagged,
        "cleared": total_cleared,
    }


# =============================================================================
# QUALITY DECAY DETECTION
# =============================================================================

@router.post("/ml/quality/snapshot", status_code=status.HTTP_200_OK)
async def create_quality_snapshot(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Create a quality snapshot of the training data pool.
    Computes metrics, checks thresholds, and saves to DB.
    Returns snapshot data, alerts, and health status.
    """
    from ..services.quality_decay_service import save_quality_snapshot

    logger.info(f"Admin {admin.email} triggered quality snapshot")
    result = await save_quality_snapshot(db)
    return result


@router.get("/ml/quality/history", status_code=status.HTTP_200_OK)
async def get_quality_snapshot_history(
    limit: int = 12,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Get historical quality snapshots for trend visualization.
    Default: last 12 snapshots (~3 months of weekly data).
    """
    from ..services.quality_decay_service import get_quality_history

    if limit < 1 or limit > 52:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 52")

    history = await get_quality_history(db, limit=limit)
    return {"snapshots": history, "count": len(history)}


@router.get("/ml/quality/readiness", status_code=status.HTTP_200_OK)
async def check_training_readiness(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Assess whether the dataset is ready for fine-tuning.
    Runs all readiness checks and returns pass/fail for each.
    """
    from ..services.quality_decay_service import get_training_readiness

    result = await get_training_readiness(db)
    return result


# =============================================================================
# ITERATIVE REFINEMENT TRACKING
# =============================================================================

@router.get("/ml/refinements/stats", status_code=status.HTTP_200_OK)
async def get_refinement_statistics(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Get statistics about refinement chains: counts by type, step distribution, etc.
    """
    from ..services.refinement_tracking_service import get_refinement_stats

    stats = await get_refinement_stats(db)
    return stats


@router.get("/ml/refinements/chain/{training_data_id}", status_code=status.HTTP_200_OK)
async def get_training_data_refinement_chain(
    training_data_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Get the full refinement chain for a specific training data entry.
    Shows the complete history of refinements (predecessors and successors).
    """
    from ..services.refinement_tracking_service import get_refinement_chain

    chain = await get_refinement_chain(db, training_data_id)
    return {"training_data_id": training_data_id, "chain": chain, "length": len(chain)}


@router.get("/export/refinement-pairs/jsonl", status_code=status.HTTP_200_OK)
async def export_refinement_pairs_jsonl(
    refinement_type: Optional[str] = None,
    max_step: Optional[int] = None,
    limit: int = 1000,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """
    Export refinement pairs in DPO JSONL format.
    Each pair: prompt=input, chosen=refined_output, rejected=original_output.

    Filters:
    - refinement_type: 'self_critique', 'user_edit', 'regeneration', 'rlaif_judge'
    - max_step: Only include refinements up to this step
    - limit: Max pairs (default 1000)
    """
    from ..services.refinement_tracking_service import export_refinement_pairs

    if limit < 1 or limit > 10000:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 10000")

    pairs = await export_refinement_pairs(
        db, refinement_type=refinement_type, max_step=max_step, limit=limit
    )

    lines = [json.dumps(p, ensure_ascii=False) for p in pairs]
    content = "\n".join(lines)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"refinement_pairs_{timestamp}.jsonl"

    response = StreamingResponse(
        iter([content]),
        media_type="application/jsonlines"
    )
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
