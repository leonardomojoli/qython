# qython/backend/services/edition_service.py
"""
O que esta instalação exige e oferece, decidido pela configuração e não pelo código.

Fora do SaaS, ninguém tem a chave do Cloudflare, o projeto Firebase ou a conta do
Resend. Cada trava do cadastro passa a valer só quando o serviço dela está
configurado: sem isso, um Qython recém-instalado não conseguiria criar a primeira
conta. Quem expõe o servidor na internet configura os serviços e as travas voltam.

`public_config` é o que o front lê ao abrir, para mostrar só os passos que valem.
"""

import os

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Config
from ..models import User
from . import firebase_service, llm_provider
from .system_settings_service import SystemSettingsService


def captcha_required() -> bool:
    return bool(os.getenv("CLOUDFLARE_SECRET_KEY"))


def phone_verification_required() -> bool:
    return firebase_service.is_firebase_configured()


def email_verification_required() -> bool:
    """E-mail de confirmação e de recuperação de senha dependem do Resend."""
    return bool(os.getenv("RESEND_API_KEY"))


def professional_verification_available() -> bool:
    """Verificação de CRM/matrícula pelo Lastreo."""
    return bool(Config.LATREO_API_KEY)


async def has_users(db: AsyncSession) -> bool:
    return bool((await db.execute(select(func.count(User.id)))).scalar())


async def public_config(db: AsyncSession) -> dict:
    captcha = captcha_required()
    return {
        "edition": Config.EDITION,
        "billing_enabled": Config.BILLING_ENABLED,
        # Instalação sem nenhuma conta: o front leva direto ao cadastro do dono.
        "setup_required": not await has_users(db),
        "registration": {
            "enabled": await SystemSettingsService.is_registration_enabled(db),
            "invite_required": await SystemSettingsService.is_invite_required(db),
            "captcha": captcha,
            "captcha_site_key": os.getenv("CLOUDFLARE_SITE_KEY") if captcha else None,
            "phone_verification": phone_verification_required(),
            "email_verification": email_verification_required(),
            "professional_verification": professional_verification_available(),
        },
        "google_login": firebase_service.is_firebase_configured(),
        "password_reset_by_email": email_verification_required(),
        # Provedor de IA e o que ele faz (busca na web, imagem, áudio): o front avisa
        # nos recursos que dependem do Gemini quando a IA de texto é local.
        "ai": llm_provider.capabilities(),
    }
