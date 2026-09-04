# qython/backend/services/admin_notifications.py
"""
Admin Notification Service
Sends email notifications to administrators for critical system events
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..config import Config
from ..models import User

logger = logging.getLogger("qython_logger")


class AdminNotificationService:
    """Service for sending notifications to admin users"""

    @classmethod
    async def get_admin_emails(cls, db: AsyncSession) -> list[str]:
        """Get list of all admin email addresses"""
        result = await db.execute(select(User).filter(User.is_admin == True))
        admins = result.scalars().all()
        return [admin.email for admin in admins]

    @classmethod
    async def send_setting_change_notification(
        cls,
        db: AsyncSession,
        setting_key: str,
        old_value: str,
        new_value: str,
        admin_user: Optional[User] = None,
        ip_address: Optional[str] = None
    ) -> bool:
        """Send notification when a critical setting is changed"""
        try:
            from .email_service import resend, MAIL_FROM

            if not resend.api_key:
                logger.warning("Cannot send admin notification: Resend not configured")
                return False

            admin_emails = await cls.get_admin_emails(db)
            if not admin_emails:
                return False

            # Human-readable setting names
            setting_names = {
                "payment_gateway_stripe_enabled": "Gateway Stripe",
                "payment_gateway_binance_enabled": "Gateway Binance Pay",
                "server_maintenance_level": "Nível de Manutenção",
                "new_registrations_enabled": "Novos Cadastros",
                "rate_limit_enabled": "Rate Limiting",
                "auto_maintenance_enabled": "Auto-Manutenção",
            }

            setting_display = setting_names.get(setting_key, setting_key)
            changed_by = admin_user.email if admin_user else "Sistema"

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <body style="font-family: 'Segoe UI', sans-serif; background-color: #1a1a2e; padding: 40px; color: #fff;">
                <div style="max-width: 600px; margin: 0 auto; background: #16213e; padding: 40px; border-radius: 12px; border-top: 4px solid #6627cd;">
                    <h1 style="color: #bb86fc; margin-top: 0;">Configuração Alterada</h1>

                    <p style="font-size: 16px; color: #e0e0e0;">
                        Uma configuração do sistema foi alterada.
                    </p>

                    <div style="background: rgba(102, 39, 205, 0.1); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(102, 39, 205, 0.3);">
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Configuração:</strong> {setting_display}</p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Valor anterior:</strong> <span style="color: #ff6b6b;">{old_value}</span></p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Novo valor:</strong> <span style="color: #03dac6;">{new_value}</span></p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Alterado por:</strong> {changed_by}</p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>IP:</strong> {ip_address or 'N/A'}</p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Horário:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
                    </div>

                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{Config.WEB_BASE_URL}/admin" style="display: inline-block; background: #6627cd; color: white; padding: 14px 30px; text-decoration: none; border-radius: 50px; font-weight: bold;">
                            Acessar Admin
                        </a>
                    </div>
                </div>
            </body>
            </html>
            """

            for email in admin_emails:
                resend.Emails.send({
                    "from": f"Qython Admin <{MAIL_FROM}>",
                    "to": [email],
                    "subject": f"[Qython Admin] Configuração alterada: {setting_display}",
                    "html": html_content
                })

            logger.info(f"Setting change notification sent for {setting_key}")
            return True

        except Exception as e:
            logger.error(f"Failed to send setting change notification: {e}")
            return False

    @classmethod
    async def send_rate_limit_abuse_alert(
        cls,
        db: AsyncSession,
        ip_address: str,
        violation_count: int,
        endpoint: Optional[str] = None
    ) -> bool:
        """Send alert when an IP exceeds rate limit multiple times"""
        try:
            from .email_service import resend, MAIL_FROM

            if not resend.api_key:
                return False

            # Only alert if violation count is significant
            if violation_count < 10:
                return False

            admin_emails = await cls.get_admin_emails(db)
            if not admin_emails:
                return False

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <body style="font-family: 'Segoe UI', sans-serif; background-color: #1a1a2e; padding: 40px; color: #fff;">
                <div style="max-width: 600px; margin: 0 auto; background: #16213e; padding: 40px; border-radius: 12px; border-top: 4px solid #ff6b6b;">
                    <h1 style="color: #ff6b6b; margin-top: 0;">Alerta de Rate Limit</h1>

                    <p style="font-size: 16px; color: #e0e0e0;">
                        Um endereço IP está excedendo repetidamente os limites de requisições.
                    </p>

                    <div style="background: rgba(255, 107, 107, 0.1); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(255, 107, 107, 0.3);">
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>IP:</strong> {ip_address}</p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Violações:</strong> {violation_count} nas últimas 24h</p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Endpoint mais acessado:</strong> {endpoint or 'Diversos'}</p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Horário:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
                    </div>

                    <p style="font-size: 14px; color: #888;">
                        Considere verificar se há atividade maliciosa ou ajustar os limites no painel admin.
                    </p>

                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{Config.WEB_BASE_URL}/admin" style="display: inline-block; background: #ff6b6b; color: white; padding: 14px 30px; text-decoration: none; border-radius: 50px; font-weight: bold;">
                            Ver Detalhes
                        </a>
                    </div>
                </div>
            </body>
            </html>
            """

            for email in admin_emails:
                resend.Emails.send({
                    "from": f"Qython Security <{MAIL_FROM}>",
                    "to": [email],
                    "subject": f"[Qython] Alerta de Rate Limit: {ip_address}",
                    "html": html_content
                })

            logger.warning(f"Rate limit abuse alert sent for IP {ip_address} ({violation_count} violations)")
            return True

        except Exception as e:
            logger.error(f"Failed to send rate limit abuse alert: {e}")
            return False

    @classmethod
    async def send_tls_expiry_alert(
        cls,
        db: AsyncSession,
        findings: list[dict]
    ) -> bool:
        """
        Alerta de certificado TLS perto de vencer (ou já vencido).

        A renovação automática do certbot dispara aos 30 dias do vencimento. Se um
        certificado chega a menos que isso, a renovação está QUEBRADA — foi o que
        aconteceu em ago/2026: a migração p/ a Hetzner tirou o location do ACME dos
        vhosts, o certbot falhou em silêncio por um mês e o certificado venceu com
        o site no ar. Este alerta existe para que isso não volte a passar batido.

        `findings`: [{"host": str, "days": int, "expires": str}], já filtrado.
        """
        try:
            from .email_service import resend, MAIL_FROM

            if not resend.api_key or not findings:
                return False

            admin_emails = await cls.get_admin_emails(db)
            if not admin_emails:
                return False

            expirado = any(f["days"] <= 0 for f in findings)
            cor = "#ff6b6b" if expirado else "#f0a020"
            titulo = "Certificado TLS VENCIDO" if expirado else "Certificado TLS perto de vencer"

            linhas = "".join(
                f'<p style="margin: 5px 0; color: #e0e0e0;"><strong>{f["host"]}:</strong> '
                f'{"VENCIDO há " + str(abs(f["days"])) + " dia(s)" if f["days"] <= 0 else str(f["days"]) + " dia(s) restantes"}'
                f' — expira em {f["expires"]}</p>'
                for f in findings
            )

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <body style="font-family: 'Segoe UI', sans-serif; background-color: #1a1a2e; padding: 40px; color: #fff;">
                <div style="max-width: 600px; margin: 0 auto; background: #16213e; padding: 40px; border-radius: 12px; border-top: 4px solid {cor};">
                    <h1 style="color: {cor}; margin-top: 0;">{titulo}</h1>

                    <p style="font-size: 16px; color: #e0e0e0;">
                        A renovação automática do Let's Encrypt dispara aos 30 dias do vencimento.
                        Um certificado abaixo disso significa que a renovação <strong>não está
                        funcionando</strong> — não espere que se resolva sozinha.
                    </p>

                    <div style="background: rgba(255, 107, 107, 0.1); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(255, 107, 107, 0.3);">
                        {linhas}
                        <p style="margin: 15px 0 5px 0; color: #e0e0e0;"><strong>Verificado em:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
                    </div>

                    <p style="font-size: 14px; color: #888;">
                        Diagnóstico no servidor:<br>
                        <code style="color: #aaa;">systemctl status certbot.service</code><br>
                        <code style="color: #aaa;">sudo certbot renew --dry-run</code><br>
                        <code style="color: #aaa;">curl -sI http://qython.ai/.well-known/acme-challenge/x</code><br>
                        O último precisa responder 404 do webroot. Se responder 301, o location do
                        ACME sumiu do vhost e a validação vai falhar.
                    </p>
                </div>
            </body>
            </html>
            """

            for email in admin_emails:
                resend.Emails.send({
                    "from": f"Qython Infra <{MAIL_FROM}>",
                    "to": [email],
                    "subject": f"[Qython] {titulo}: {findings[0]['host']}",
                    "html": html_content
                })

            logger.warning(f"TLS expiry alert sent: {findings}")
            return True

        except Exception as e:
            logger.error(f"Failed to send TLS expiry alert: {e}")
            return False

    @classmethod
    async def send_new_admin_notification(
        cls,
        db: AsyncSession,
        new_admin: User,
        promoted_by: Optional[User] = None
    ) -> bool:
        """Send notification when a new admin is added"""
        try:
            from .email_service import resend, MAIL_FROM

            if not resend.api_key:
                return False

            admin_emails = await cls.get_admin_emails(db)
            if not admin_emails:
                return False

            promoted_by_name = promoted_by.email if promoted_by else "Sistema"

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <body style="font-family: 'Segoe UI', sans-serif; background-color: #1a1a2e; padding: 40px; color: #fff;">
                <div style="max-width: 600px; margin: 0 auto; background: #16213e; padding: 40px; border-radius: 12px; border-top: 4px solid #03dac6;">
                    <h1 style="color: #03dac6; margin-top: 0;">Novo Administrador</h1>

                    <p style="font-size: 16px; color: #e0e0e0;">
                        Um novo administrador foi adicionado ao sistema.
                    </p>

                    <div style="background: rgba(3, 218, 198, 0.1); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(3, 218, 198, 0.3);">
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Novo Admin:</strong> {new_admin.full_name} ({new_admin.email})</p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Promovido por:</strong> {promoted_by_name}</p>
                        <p style="margin: 5px 0; color: #e0e0e0;"><strong>Horário:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
                    </div>
                </div>
            </body>
            </html>
            """

            for email in admin_emails:
                if email != new_admin.email:  # Don't notify the new admin about themselves
                    resend.Emails.send({
                        "from": f"Qython Admin <{MAIL_FROM}>",
                        "to": [email],
                        "subject": f"[Qython] Novo Administrador: {new_admin.full_name}",
                        "html": html_content
                    })

            logger.info(f"New admin notification sent for {new_admin.email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send new admin notification: {e}")
            return False


# Singleton instance
admin_notifications = AdminNotificationService()
