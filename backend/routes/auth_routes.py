# qython/backend/routes/auth_routes.py

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Form, UploadFile, File, BackgroundTasks, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm

from ..config import Config
from ..rate_limiter import limiter
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db
from ..models import User, Invitation
from ..services.captcha_service import verify_captcha
from ..services.email_service import send_verification_email, send_welcome_email, send_registration_complete_email, send_password_reset_email
from ..services import firebase_service
from ..services import audit_service
from ..services.system_settings_service import SystemSettingsService
from ..security import create_access_token, get_password_hash, verify_password, create_verification_token, verify_verification_token, create_password_reset_token, verify_password_reset_token

# Configurar logging
logger = logging.getLogger("qython_logger")

router = APIRouter()

# --- Pydantic Models ---

class RegisterStep1Form:
    def __init__(
        self,
        captcha_token: str = Form(...),
        email: EmailStr = Form(...),
        password: str = Form(...),
        full_name: str = Form(...),
        occupation: str = Form(...),
        specialty: Optional[str] = Form(None),  # Medical specialty (optional for doctors)
        # Optional: web collects + verifies a phone; mobile sign-up may omit it.
        phone_number: Optional[str] = Form(None),
        country: Optional[str] = Form(None),
        referral_source: Optional[str] = Form(None),
        university: Optional[str] = Form(None),
        period: Optional[str] = Form(None),
        matricula: Optional[str] = Form(None),
        identifier_type: Optional[str] = Form(None),
        identifier_number: Optional[str] = Form(None),
        invite_token: Optional[str] = Form(None),
        phone_verification_token: Optional[str] = Form(None),
        google_id_token: Optional[str] = Form(None),
        language: Optional[str] = Form("pt"),
        marketing_consent: bool = Form(False),
        latreo_session_id: Optional[str] = Form(None),  # médico verificado via embed Latreo
    ):
        self.captcha_token = captcha_token
        self.email = email
        self.password = password
        self.full_name = full_name
        self.occupation = occupation
        self.specialty = specialty
        self.phone_number = phone_number
        self.country = country
        self.referral_source = referral_source
        self.university = university
        self.period = period
        self.matricula = matricula
        self.identifier_type = identifier_type
        self.identifier_number = identifier_number
        self.invite_token = invite_token
        self.phone_verification_token = phone_verification_token
        self.google_id_token = google_id_token
        self.language = language
        self.marketing_consent = marketing_consent
        self.latreo_session_id = latreo_session_id

class RegisterStep2Payload(BaseModel):
    email: EmailStr
    token: str

class LoginData(BaseModel):
    email: EmailStr
    password: str

class GoogleLoginPayload(BaseModel):
    token: str

class ResendVerificationPayload(BaseModel):
    email: EmailStr

class ForgotPasswordPayload(BaseModel):
    email: EmailStr

class ResetPasswordPayload(BaseModel):
    token: str
    new_password: str

# --- Endpoints ---

@router.post("/google", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def google_login(
    request: Request,
    payload: GoogleLoginPayload,
    db: AsyncSession = Depends(get_db)
):
    """
    Login ou Início de Cadastro via Google.
    """
    decoded_token = firebase_service.verify_firebase_token(payload.token)
    email = decoded_token.get('email')
    name = decoded_token.get('name', '')
    
    if not email:
        raise HTTPException(status_code=400, detail="Token do Google não contém email.")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()

    # CENÁRIO A: Usuário já existe -> Faz Login
    if user:
        if user.status == 'email_pending':
            user.status = 'waitlist'
            logger.info(f"Usuário {email} ativado via Google Sign-In.")

        # Track last login timestamp
        user.last_login_at = datetime.now(timezone.utc)
        await db.commit()

        access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
        
        return {
            "action": "login",
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "is_admin": user.is_admin,
                "full_name": user.full_name,
                "status": user.status,
                "profile_picture": user.profile_picture,
                "verification_status": user.verification_status,
                "access_granted": user.access_granted,
                "onboarding_completed": user.onboarding_completed,
                "subscription_plan": user.subscription_plan
            }
        }

    # CENÁRIO B: Usuário Novo -> Manda para Registro
    else:
        return {
            "action": "register",
            "email": email,
            "full_name": name,
            "message": "Complete seu cadastro profissional."
        }


@router.post("/register/step1", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def register_step1(
    request: Request,
    background_tasks: BackgroundTasks,
    form_data: RegisterStep1Form = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """
    Registro inteligente. Retorna JWT se for Google Auth.
    """
    # Check if registrations are enabled
    if not await SystemSettingsService.is_registration_enabled(db):
        raise HTTPException(
            status_code=503,
            detail="Novos cadastros estão temporariamente pausados. Por favor, tente novamente mais tarde."
        )

    if not form_data.captcha_token or not verify_captcha(form_data.captcha_token):
        raise HTTPException(status_code=400, detail="CAPTCHA inválido")

    if not form_data.google_id_token:
        pwd = form_data.password
        if len(pwd) < 8 or not any(c.isupper() for c in pwd) or not any(c.isdigit() for c in pwd):
            raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 8 caracteres, incluindo 1 letra maiúscula e 1 número.")

    result = await db.execute(select(User).where(User.email == form_data.email))
    existing_user = result.scalars().first()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    # --- LÓGICA DE VALIDAÇÃO GOOGLE ---
    is_google_verified = False
    if form_data.google_id_token:
        try:
            decoded = firebase_service.verify_firebase_token(form_data.google_id_token)
            if decoded.get('email') == form_data.email:
                is_google_verified = True
        except Exception as e:
            logger.warning(f"Falha ao validar Google Token no registro: {e}")

    # Convite
    valid_invite = None
    if form_data.invite_token:
        result = await db.execute(select(Invitation).where(
            Invitation.token == form_data.invite_token,
            Invitation.is_used == False
        ).with_for_update())
        valid_invite = result.scalars().first()

    # Telefone — verificação OBRIGATÓRIA. Todo cadastro precisa de um número
    # provado via Firebase SMS (ativo de marketing/WhatsApp + anti-fraude).
    if not form_data.phone_verification_token:
        raise HTTPException(status_code=400, detail="Verificação de telefone obrigatória.")
    # verify_phone_token valida o ID token assinado pelo Firebase e devolve o
    # número verificado em E.164; levanta HTTPException(400) se inválido/expirado.
    final_phone_number = firebase_service.verify_phone_token(form_data.phone_verification_token)
    phone_is_verified = True

    # Status Inicial. `require_invite` (system setting, default False) decide se quem
    # verifica precisa de convite (waitlist) ou entra direto. Religável no admin sem deploy.
    invite_required = await SystemSettingsService.is_invite_required(db)
    initial_status = 'email_pending'
    if is_google_verified:
        if valid_invite or not invite_required:
            initial_status = 'active'
        else:
            initial_status = 'waitlist'

    # Dracmas Iniciais: 150 (base) + 150 (bônus estudante) = 300 para estudantes
    # Suficiente para ~100 msgs de chat ou ~36 resumos - teste adequado das features
    is_student = form_data.occupation == 'Estudante de Medicina'
    plan_dracmas = 150.0
    student_bonus = 150.0 if is_student else 0.0
    initial_dracmas = plan_dracmas + student_bonus

    # Plano de assinatura: todos começam com 'interno'
    # Outros planos (residente, staff, especialista, institucional) são selecionados depois
    subscription_plan = 'interno'

    new_user = User(
        email=form_data.email,
        password_hash=get_password_hash(form_data.password),
        full_name=form_data.full_name,
        occupation=form_data.occupation,
        specialty=form_data.specialty,
        phone_number=final_phone_number,
        phone_verified=phone_is_verified,
        country=form_data.country,
        referral_source=form_data.referral_source,
        university=form_data.university,
        period=form_data.period,
        matricula=form_data.matricula,
        identifier_type=form_data.identifier_type,
        identifier_number=form_data.identifier_number,
        status=initial_status,
        subscription_plan=subscription_plan,
        profile_picture='default-profile.png',
        dracmas=initial_dracmas,
        verification_status='pending',
        marketing_consent=form_data.marketing_consent
    )
    db.add(new_user)
    await db.flush()

    if valid_invite:
        valid_invite.used_by_user_id = new_user.id
        if is_google_verified:
            valid_invite.is_used = True

    await db.commit()
    logger.info(f"Usuário {new_user.email} criado. Status: {initial_status}")

    # Verificação Latreo (médico OU estudante): se o usuário concluiu o embed
    # durante o cadastro, confirma o resultado server-side (fonte da verdade) e
    # marca como verificado. A biometria ficou no Latreo — aqui só lemos o desfecho.
    # Falha não bloqueia o cadastro: segue 'pending' e o banner cobra depois.
    # Gate por presença de session_id (médico e estudante recebem um pelo formulário) —
    # 'occupation' é texto localizado (Médico/Doctor), não confiável pra branch.
    if form_data.latreo_session_id:
        try:
            from ..services import latreo_client
            sess = await latreo_client.get_verification_session(form_data.latreo_session_id)
            new_user.latreo_session_id = form_data.latreo_session_id
            # latreo_doctor_id guarda a identidade Latreo estável: doctor_user_id
            # (médico) ou student_user_id (estudante) — o mesmo id na migração
            # estudante → médico.
            latreo_uid = sess.get('doctor_user_id')
            if latreo_uid is None:
                latreo_uid = sess.get('student_user_id')
            if latreo_uid is not None:
                new_user.latreo_doctor_id = latreo_uid
            # 'completed' == verified — NÃO gatear por final_tier: sessão de
            # ESTUDANTE volta final_tier=null (o tier mora em /client/students),
            # então resolve_verification_tier o resolve. Gatear por final_tier
            # deixava TODO estudante preso em 'pending' apesar do Latreo aprovado.
            if sess.get('status') == 'completed':
                new_user.verification_status = 'verified'
                new_user.verification_tier = await latreo_client.resolve_verification_tier(sess)
                new_user.verification_provider = 'latreo'
                new_user.verified_at = datetime.now(timezone.utc)
            new_user.last_verification_check_at = datetime.now(timezone.utc)
            await db.commit()
            logger.info(f"Latreo verification confirmed for {new_user.email}: status={new_user.verification_status} tier={new_user.verification_tier}")
        except Exception as e:
            logger.warning(f"[LATREO] confirm at register failed for {new_user.email}: {e}")

    # RESPOSTA FINAL
    if not is_google_verified:
        # Fluxo Email: Envia verificação
        email_token = create_verification_token(data={"sub": form_data.email})
        send_verification_email(form_data.email, email_token, form_data.full_name, form_data.language)
        return {"message": "Token enviado.", "email": form_data.email, "status": "email_pending"}
    else:
        # Fluxo Google: Retorna JWT imediatamente (Auto-Login)
        access_token = create_access_token(data={"sub": new_user.email, "user_id": new_user.id})
        
        if initial_status == 'active':
            send_welcome_email(form_data.email, form_data.full_name, form_data.language or "pt")
        elif initial_status == 'waitlist':
            # Email de confirmação para quem vai para lista de espera
            background_tasks.add_task(
                send_registration_complete_email,
                form_data.email,
                form_data.full_name,
                form_data.language or "pt"
            )
        
        return {
            "message": "Cadastro concluído.",
            "email": form_data.email,
            "status": initial_status,
            "access_token": access_token,
            "user": {
                "id": new_user.id,
                "email": new_user.email,
                "full_name": new_user.full_name,
                "status": new_user.status,
                "is_admin": new_user.is_admin,
                "access_granted": new_user.access_granted,
                "onboarding_completed": new_user.onboarding_completed
            }
        }


@router.get("/register/verify-email")
@limiter.limit("5/minute")
async def verify_email(request: Request, token: str, db: AsyncSession = Depends(get_db)):
    FRONTEND_URL = Config.WEB_BASE_URL
    email = verify_verification_token(token)
    if not email:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=invalid_token", status_code=302)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if not user:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=user_not_found", status_code=302)

    if user.status == 'email_pending':
        invite_result = await db.execute(select(Invitation).where(Invitation.used_by_user_id == user.id))
        invite = invite_result.scalars().first()
        
        invite_required = await SystemSettingsService.is_invite_required(db)
        if invite:
            user.status = 'active'
            invite.is_used = True
            await db.commit()
            return RedirectResponse(url=f"{FRONTEND_URL}/login?verified=true&status=active", status_code=302)
        elif not invite_required:
            # Sem fricção (default): e-mail verificado entra direto como ativo.
            user.status = 'active'
            await db.commit()
            return RedirectResponse(url=f"{FRONTEND_URL}/login?verified=true&status=active", status_code=302)
        else:
            user.status = 'waitlist'
            await db.commit()
            return RedirectResponse(url=f"{FRONTEND_URL}/login?verified=true&status=waitlist", status_code=302)
            
    elif user.status in ['active', 'waitlist']:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?already_verified=true&status={user.status}", status_code=302)
    else:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=invalid_status", status_code=302)


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    # Support login with email OR username
    login_input = form_data.username.strip().lower()
    
    if '@' in login_input:
        # Login with email
        result = await db.execute(select(User).where(User.email == login_input))
    else:
        # Login with username
        result = await db.execute(select(User).where(User.username == login_input))
    
    user = result.scalars().first()

    # Timing-safe: always run verify_password to prevent user enumeration
    if not user:
        verify_password(form_data.password, "$2b$12$Wpp1Cpz/ZS/2RAqJQeAjH.g5ihBlZSorPsAM744rdzEngphqgwb1C")
        await audit_service.log(
            db, action='auth.login.failed', actor_role='anonymous',
            metadata={'login_input': login_input[:120], 'reason': 'user_not_found'},
            request=request, commit=True,
        )
        raise HTTPException(status_code=401, detail="Email, usuário ou senha incorretos")

    if not verify_password(form_data.password, user.password_hash):
        await audit_service.log(
            db, action='auth.login.failed', actor_role='anonymous',
            affected_user_id=user.id,
            metadata={'reason': 'bad_password'},
            request=request, commit=True,
        )
        raise HTTPException(status_code=401, detail="Email, usuário ou senha incorretos")

    if user.status == 'banned':
        await audit_service.log(
            db, action='auth.login.blocked', actor_user_id=user.id,
            affected_user_id=user.id,
            metadata={'reason': 'banned'}, request=request, commit=True,
        )
        raise HTTPException(status_code=403, detail="Esta conta foi suspensa. Verifique seu e-mail para mais detalhes.")

    if user.status == 'email_pending':
         await audit_service.log(
             db, action='auth.login.blocked', actor_user_id=user.id,
             affected_user_id=user.id,
             metadata={'reason': 'email_pending'}, request=request, commit=True,
         )
         raise HTTPException(status_code=403, detail="Conta não ativada. Verifique seu email.")

    # Permite login para 'waitlist' para ver a tela de espera
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})

    # Track last login timestamp
    user.last_login_at = datetime.now(timezone.utc)
    await audit_service.log_login(db, user_id=user.id, success=True, request=request)
    await db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "is_admin": user.is_admin,
            "full_name": user.full_name,
            "status": user.status,
            "profile_picture": user.profile_picture,
            "verification_status": user.verification_status,
            "access_granted": user.access_granted,
            "onboarding_completed": user.onboarding_completed,
            "subscription_plan": user.subscription_plan
        }
    }


@router.post("/resend-verification", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def resend_verification_email_endpoint(request: Request, payload: ResendVerificationPayload, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalars().first()
    if not user or user.status not in ['pending', 'email_pending']:
        return {"message": "Se aplicável, um novo link foi enviado."}

    email_token = create_verification_token(data={"sub": user.email})
    send_verification_email(user.email, email_token, user.full_name)
    return {"message": "E-mail reenviado."}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def forgot_password(request: Request, payload: ForgotPasswordPayload, db: AsyncSession = Depends(get_db)):
    """
    Solicita reset de senha. Sempre retorna sucesso (anti user-enumeration).
    """
    # Always return same response to prevent user enumeration
    generic_response = {"message": "Se o email estiver cadastrado, você receberá um link de recuperação."}

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalars().first()

    if not user or user.status == 'banned':
        # Timing-safe: hash a dummy password to keep response time consistent
        verify_password("dummy", "$2b$12$Wpp1Cpz/ZS/2RAqJQeAjH.g5ihBlZSorPsAM744rdzEngphqgwb1C")
        return generic_response

    token = create_password_reset_token(user.email)
    lang = getattr(user, 'language_preference', 'pt') or 'pt'
    send_password_reset_email(user.email, token, user.full_name or "Usuário", lang)

    return generic_response


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def reset_password(request: Request, payload: ResetPasswordPayload, db: AsyncSession = Depends(get_db)):
    """
    Redefine a senha usando um token JWT de reset.
    """
    email = verify_password_reset_token(payload.token)
    if not email:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado.")

    # Validate password strength (same rules as registration)
    pwd = payload.new_password
    if len(pwd) < 8 or not any(c.isupper() for c in pwd) or not any(c.isdigit() for c in pwd):
        raise HTTPException(
            status_code=400,
            detail="A senha deve ter no mínimo 8 caracteres, incluindo 1 letra maiúscula e 1 número."
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado.")

    user.password_hash = get_password_hash(pwd)
    await db.commit()

    logger.info(f"Senha redefinida com sucesso para {email}")
    return {"message": "Senha redefinida com sucesso."}
