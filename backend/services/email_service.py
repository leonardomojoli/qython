# qython/backend/services/email_service.py
"""
Professional Email Service using Resend
Handles verification emails with beautiful HTML templates
"""

import os
import logging
import resend
from typing import Optional

from ..config import Config

logger = logging.getLogger("qython_logger")

# Initialize Resend with API key
resend.api_key = os.getenv("RESEND_API_KEY")

# Email configuration
MAIL_FROM = os.getenv("MAIL_FROM_EMAIL", "onboarding@resend.dev")

# Public URLs used in email templates — defined as short aliases for readability
WEB_URL = Config.WEB_BASE_URL
API_URL = Config.API_BASE_URL

# Translations for email content
EMAIL_TRANSLATIONS = {
    "pt": {
        "subject": "Qython - Confirme seu cadastro ✓",
        "tagline": "Inteligência Clínica Avançada",
        "welcome": "Bem-vindo à Excelência Médica",
        "hello": "Olá",
        "text": "Obrigado por se juntar ao Qython. Para garantir a segurança da sua conta e acessar nossa plataforma de inteligência clínica, por favor confirme seu e-mail.",
        "button": "✓ Confirmar meu E-mail",
        "alt_text": "Se o botão não funcionar, copie e cole o link abaixo:",
        "expire": "⏱️ Este link expira em 24 horas.",
        "footer": "Se você não criou esta conta, pode ignorar este e-mail com segurança.",
        "rights": "© 2026 Qython, Inc. Todos os direitos reservados.",
        "welcome_subject": "Bem-vindo ao Qython! 🎉",
        "welcome_text": "Sua conta foi ativada com sucesso. Você agora tem acesso completo à nossa plataforma de inteligência clínica.",
        "access_dashboard": "Acessar Dashboard",
        # Invite email translations
        "invite_subject": "Você entrou! Seu acesso ao Qython foi liberado 🔓",
        "invite_title": "Sua vez chegou! 🚀",
        "invite_text_1": "Temos o prazer de informar que sua vaga no <strong>Qython</strong> foi liberada.",
        "invite_text_2": "Você foi selecionado em nossa Lista de Espera e agora tem acesso completo à plataforma de inteligência clínica mais avançada do mercado.",
        "invite_code_label": "SEU CÓDIGO DE ACESSO (JÁ ATIVADO)",
        "invite_button": "Acessar Agora",
        "invite_tip": "<strong>Dica:</strong> Sua conta já está ativa. Basta fazer login com seu e-mail cadastrado.",
        # Registration Complete (Waitlist) translations
        "reg_complete_subject": "Cadastro recebido! 📝 Estamos verificando sua conta",
        "reg_complete_title": "Cadastro Concluído com Sucesso!",
        "reg_complete_hello": "Olá",
        "reg_complete_text_1": "Seu cadastro no <strong>Qython</strong> foi recebido com sucesso!",
        "reg_complete_text_2": "Estamos verificando seus documentos e você receberá um <strong>convite de acesso</strong> por e-mail em breve.",
        "reg_complete_text_3": "Enquanto isso, seu lugar na nossa lista de espera está garantido.",
        "reg_complete_tip": "💡 <strong>Dica:</strong> Fique de olho na sua caixa de entrada (e no spam)!",
        "reg_complete_footer": "Você receberá novidades sobre o Qython em primeira mão.",
        # Enhanced Welcome (Active) translations
        "welcome_subject": "Bem-vindo ao Qython! 🎉 Sua jornada começa agora",
        "welcome_title": "Bem-vindo ao Futuro da Medicina!",
        "welcome_text_1": "Parabéns! Sua conta foi <strong>ativada com sucesso</strong>.",
        "welcome_text_2": "Você agora tem acesso completo à plataforma de inteligência clínica mais avançada do mercado.",
        "welcome_tip_1": "🩺 <strong>Copiloto Clínico:</strong> Converse com nossa IA sobre qualquer tema médico",
        "welcome_tip_2": "📚 <strong>Bibliotecas:</strong> Faça upload de PDFs e converse com seus materiais",
        "welcome_tip_3": "🏆 <strong>Arena:</strong> Treine para provas de residência com simulados",
        "welcome_button": "Acessar o Qython",
        # Ban/Unban translations
        "ban_subject": "Notificação de Suspensão de Conta",
        "ban_title": "Conta Suspensa",
        "ban_intro": "Informamos que o acesso à sua conta foi suspenso devido a uma infração das nossas políticas.",
        "ban_label": "Motivo da Suspensão:",
        "ban_contact": "Caso deseje contestar esta decisão, entre em contato com nosso departamento de Trust & Safety:",
        "reason_terms_violation": "Violação dos Termos de Uso (Geral)",
        "reason_security_risk": "Risco de Segurança / Atividade Suspeita",
        "reason_payment_issue": "Irregularidade no Pagamento / Chargeback",
        "reason_medical_misuse": "Uso Indevido da IA (Violação de Protocolos Médicos)",
        "reason_fraud": "Identidade não verificada / Suspeita de Fraude",
        "reason_abuse": "Comportamento Abusivo / Assédio",
        "unban_subject": "Sua conta foi reativada",
        "unban_title": "Acesso Restaurado",
        "unban_text": "Após revisão, sua conta foi reativada. Pedimos desculpas pelo inconveniente.",
        "login_button": "Acessar Plataforma",
        # Revocation translations
        "revoked_subject": "Ação Necessária: Problema com sua documentação",
        "revoked_title": "Verificação Revogada",
        "revoked_text": "Após uma revisão manual de segurança, identificamos uma inconsistência na documentação enviada anteriormente. Para continuar usando o Qython, por favor envie um novo documento.",
        "revoked_button": "Enviar Novo Documento",
        # Dracma Expiration translations
        # Password Reset translations
        "reset_subject": "Qython - Redefinir sua senha",
        "reset_title": "Redefinir Senha",
        "reset_text": "Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.",
        "reset_button": "Redefinir Minha Senha",
        "reset_expire": "Este link expira em 1 hora.",
        "reset_footer": "Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha permanecerá a mesma.",
        # Material Ready translations
        "material_ready_subject": "Seu material está pronto! 🎓",
        "material_ready_title": "Material Pronto!",
        "material_ready_text": "Seu <strong>{material_type}</strong> &mdash; <em>{material_title}</em> &mdash; foi gerado com sucesso e está pronto para uso.",
        "material_ready_button": "Acessar Material",
    },
    "en": {
        "subject": "Qython - Confirm your registration ✓",
        "tagline": "Advanced Clinical Intelligence",
        "welcome": "Welcome to Medical Excellence",
        "hello": "Hello",
        "text": "Thank you for joining Qython. To ensure the security of your account and access our clinical intelligence platform, please confirm your email.",
        "button": "✓ Confirm my Email",
        "alt_text": "If the button doesn't work, copy and paste the link below:",
        "expire": "⏱️ This link expires in 24 hours.",
        "footer": "If you did not create this account, you can safely ignore this email.",
        "rights": "© 2026 Qython, Inc. All rights reserved.",
        "welcome_subject": "Welcome to Qython! 🎉",
        "welcome_text": "Your account has been activated successfully. You now have full access to our clinical intelligence platform.",
        "access_dashboard": "Access Dashboard",
        # Invite email translations
        "invite_subject": "You're in! Your Qython access is unlocked 🔓",
        "invite_title": "Your turn has arrived! 🚀",
        "invite_text_1": "We are pleased to inform you that your spot at <strong>Qython</strong> has been released.",
        "invite_text_2": "You were selected from our Waitlist and now have full access to the most advanced clinical intelligence platform on the market.",
        "invite_code_label": "YOUR ACCESS CODE (ALREADY ACTIVATED)",
        "invite_button": "Access Now",
        "invite_tip": "<strong>Tip:</strong> Your account is already active. Just log in with your registered email.",
        # Registration Complete (Waitlist) translations
        "reg_complete_subject": "Registration received! 📝 We're verifying your account",
        "reg_complete_title": "Registration Successfully Completed!",
        "reg_complete_hello": "Hello",
        "reg_complete_text_1": "Your registration at <strong>Qython</strong> has been successfully received!",
        "reg_complete_text_2": "We are verifying your documents and you will receive an <strong>access invitation</strong> by email soon.",
        "reg_complete_text_3": "In the meantime, your spot on our waitlist is secured.",
        "reg_complete_tip": "💡 <strong>Tip:</strong> Keep an eye on your inbox (and spam folder)!",
        "reg_complete_footer": "You'll be the first to receive news about Qython.",
        # Enhanced Welcome (Active) translations
        "welcome_subject": "Welcome to Qython! 🎉 Your journey begins now",
        "welcome_title": "Welcome to the Future of Medicine!",
        "welcome_text_1": "Congratulations! Your account has been <strong>successfully activated</strong>.",
        "welcome_text_2": "You now have full access to the most advanced clinical intelligence platform on the market.",
        "welcome_tip_1": "🩺 <strong>Clinical Copilot:</strong> Chat with our AI about any medical topic",
        "welcome_tip_2": "📚 <strong>Libraries:</strong> Upload PDFs and chat with your materials",
        "welcome_tip_3": "🏆 <strong>Arena:</strong> Train for residency exams with simulations",
        "welcome_button": "Access Qython",
        # Ban/Unban translations
        "ban_subject": "Notice of Account Suspension",
        "ban_title": "Account Suspended",
        "ban_intro": "We inform you that access to your account has been suspended due to a violation of our policies.",
        "ban_label": "Reason for Suspension:",
        "ban_contact": "If you wish to appeal this decision, please contact our Trust & Safety department:",
        "reason_terms_violation": "Violation of Terms of Use (General)",
        "reason_security_risk": "Security Risk / Suspicious Activity",
        "reason_payment_issue": "Payment Irregularity / Chargeback",
        "reason_medical_misuse": "Misuse of Medical AI (Violation of Medical Protocols)",
        "reason_fraud": "Unverified Identity / Suspected Fraud",
        "reason_abuse": "Abusive Behavior / Harassment",
        "unban_subject": "Your account has been reactivated",
        "unban_title": "Access Restored",
        "unban_text": "After review, your account has been reactivated. We apologize for the inconvenience.",
        "login_button": "Access Platform",
        # Revocation translations
        "revoked_subject": "Action Required: Issue with your documentation",
        "revoked_title": "Verification Revoked",
        "revoked_text": "After a manual security review, we identified an inconsistency in the previously submitted documentation. To continue using Qython, please submit a new document.",
        "revoked_button": "Submit New Document",
        # Dracma Expiration translations
        # Password Reset translations
        "reset_subject": "Qython - Reset your password",
        "reset_title": "Reset Password",
        "reset_text": "We received a request to reset your account password. Click the button below to create a new password.",
        "reset_button": "Reset My Password",
        "reset_expire": "This link expires in 1 hour.",
        "reset_footer": "If you did not request a password reset, please ignore this email. Your password will remain unchanged.",
        # Material Ready translations
        "material_ready_subject": "Your material is ready! 🎓",
        "material_ready_title": "Material Ready!",
        "material_ready_text": "Your <strong>{material_type}</strong> &mdash; <em>{material_title}</em> &mdash; was generated successfully and is ready to use.",
        "material_ready_button": "Access Material",
    },
    "es": {
        "subject": "Qython - Confirma tu registro ✓",
        "tagline": "Inteligencia Clínica Avanzada",
        "welcome": "Bienvenido a la Excelencia Médica",
        "hello": "Hola",
        "text": "Gracias por unirte a Qython. Para garantizar la seguridad de tu cuenta y acceder a nuestra plataforma de inteligencia clínica, por favor confirma tu correo electrónico.",
        "button": "✓ Confirmar mi Correo",
        "alt_text": "Si el botón no funciona, copia y pega el enlace a continuación:",
        "expire": "⏱️ Este enlace expira en 24 horas.",
        "footer": "Si no creaste esta cuenta, puedes ignorar este correo electrónico de forma segura.",
        "rights": "© 2026 Qython, Inc. Todos los derechos reservados.",
        "welcome_subject": "¡Bienvenido a Qython! 🎉",
        "welcome_text": "Tu cuenta ha sido activada exitosamente. Ahora tienes acceso completo a nuestra plataforma de inteligencia clínica.",
        "access_dashboard": "Acceder al Dashboard",
        # Invite email translations
        "invite_subject": "¡Entraste! Tu acceso a Qython está desbloqueado 🔓",
        "invite_title": "¡Tu turno ha llegado! 🚀",
        "invite_text_1": "Nos complace informarle que su vacante en <strong>Qython</strong> ha sido liberada.",
        "invite_text_2": "Fue seleccionado de nuestra Lista de Espera y ahora tiene acceso completo a la plataforma de inteligencia clínica más avanzada del mercado.",
        "invite_code_label": "TU CÓDIGO DE ACCESO (YA ACTIVADO)",
        "invite_button": "Acceder Ahora",
        "invite_tip": "<strong>Consejo:</strong> Tu cuenta ya está activa. Solo inicia sesión con tu correo registrado.",
        # Registration Complete (Waitlist) translations
        "reg_complete_subject": "¡Registro recibido! 📝 Estamos verificando tu cuenta",
        "reg_complete_title": "¡Registro Completado con Éxito!",
        "reg_complete_hello": "Hola",
        "reg_complete_text_1": "¡Tu registro en <strong>Qython</strong> fue recibido con éxito!",
        "reg_complete_text_2": "Estamos verificando tus documentos y recibirás una <strong>invitación de acceso</strong> por correo electrónico pronto.",
        "reg_complete_text_3": "Mientras tanto, tu lugar en nuestra lista de espera está asegurado.",
        "reg_complete_tip": "💡 <strong>Consejo:</strong> ¡Mantente atento a tu bandeja de entrada (y a spam)!",
        "reg_complete_footer": "Serás el primero en recibir novedades sobre Qython.",
        # Enhanced Welcome (Active) translations
        "welcome_subject": "¡Bienvenido a Qython! 🎉 Tu viaje comienza ahora",
        "welcome_title": "¡Bienvenido al Futuro de la Medicina!",
        "welcome_text_1": "¡Felicidades! Tu cuenta ha sido <strong>activada con éxito</strong>.",
        "welcome_text_2": "Ahora tienes acceso completo a la plataforma de inteligencia clínica más avanzada del mercado.",
        "welcome_tip_1": "🩺 <strong>Copiloto Clínico:</strong> Conversa con nuestra IA sobre cualquier tema médico",
        "welcome_tip_2": "📚 <strong>Bibliotecas:</strong> Sube PDFs y conversa con tus materiales",
        "welcome_tip_3": "🏆 <strong>Arena:</strong> Entrena para exámenes de residencia con simulaciones",
        "welcome_button": "Acceder a Qython",
        # Ban/Unban translations
        "ban_subject": "Notificación de Suspensión de Cuenta",
        "ban_title": "Cuenta Suspendida",
        "ban_intro": "Le informamos que el acceso a su cuenta ha sido suspendido debido a una infracción de nuestras políticas.",
        "ban_label": "Motivo de la Suspensión:",
        "ban_contact": "Si desea apelar esta decisión, contacte a nuestro departamento de Trust & Safety:",
        "reason_terms_violation": "Violación de los Términos de Uso (General)",
        "reason_security_risk": "Riesgo de Seguridad / Actividad Sospechosa",
        "reason_payment_issue": "Irregularidad en el Pago / Contracargo",
        "reason_medical_misuse": "Uso Indebido de la IA Médica (Violación de Protocolos)",
        "reason_fraud": "Identidad no verificada / Sospecha de Fraude",
        "reason_abuse": "Comportamiento Abusivo / Acoso",
        "unban_subject": "Su cuenta ha sido reactivada",
        "unban_title": "Acceso Restaurado",
        "unban_text": "Tras una revisión, su cuenta ha sido reactivada. Disculpe las molestias.",
        "login_button": "Acceder a la Plataforma",
        # Revocation translations
        "revoked_subject": "Acción Requerida: Problema con su documentación",
        "revoked_title": "Verificación Revocada",
        "revoked_text": "Tras una revisión manual de seguridad, identificamos una inconsistencia en la documentación enviada anteriormente. Para continuar usando Qython, por favor envíe un nuevo documento.",
        "revoked_button": "Enviar Nuevo Documento",
        # Dracma Expiration translations
        # Password Reset translations
        "reset_subject": "Qython - Restablecer tu contraseña",
        "reset_title": "Restablecer Contraseña",
        "reset_text": "Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón de abajo para crear una nueva contraseña.",
        "reset_button": "Restablecer Mi Contraseña",
        "reset_expire": "Este enlace expira en 1 hora.",
        "reset_footer": "Si no solicitaste restablecer tu contraseña, ignora este correo. Tu contraseña no cambiará.",
        # Material Ready translations
        "material_ready_subject": "¡Tu material está listo! 🎓",
        "material_ready_title": "¡Material Listo!",
        "material_ready_text": "Tu <strong>{material_type}</strong> &mdash; <em>{material_title}</em> &mdash; fue generado con éxito y está listo para usar.",
        "material_ready_button": "Acceder al Material",
    }
}


def get_translation(lang: str) -> dict:
    """Get translation dict for language, fallback to Portuguese."""
    return EMAIL_TRANSLATIONS.get(lang, EMAIL_TRANSLATIONS["pt"])


def get_verification_email_template(verification_link: str, user_name: str = "Usuário", lang: str = "pt") -> str:
    """
    Template de email de verificação com tema escuro Qython.
    Suporta: pt, en, es
    """
    t = get_translation(lang)
    lang_code = {"pt": "pt-BR", "en": "en-US", "es": "es-ES"}.get(lang, "pt-BR")
    
    return f"""
<!DOCTYPE html>
<html lang="{lang_code}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Qython</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a14;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a14;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #12151f; border-radius: 16px; border: 1px solid #333; overflow: hidden;">
                    
                    <!-- Header with logo -->
                    <tr>
                        <td style="background: linear-gradient(180deg, rgba(102, 39, 205, 0.15) 0%, #12151f 100%); padding: 35px 30px 20px 30px; text-align: center;">
                            <!-- Link wrapper para bloquear download no Gmail -->
                            <a href="#" style="pointer-events: none; display: inline-block; line-height: 0;">
                                <img src="{WEB_URL}/assets/images/branding/qython-logo-full.png?v=2" alt="Qython" width="180" style="display: block; margin: 0 auto; border: 0;">
                            </a>
                            <p style="color: rgba(255,255,255,0.6); margin: 15px 0 0 0; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">{t['tagline']}</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 50px 40px; text-align: center;">
                            <!-- Saudação personalizada primeiro -->
                            <p style="color: #03dac6; font-size: 18px; margin: 0 0 15px 0;">
                                {t['hello']}, {user_name}!
                            </p>
                            
                            <h2 style="color: #ffffff; margin: 0 0 25px 0; font-size: 24px; font-weight: 600;">
                                {t['welcome']}
                            </h2>
                            
                            <p style="color: #cccccc; font-size: 16px; line-height: 1.7; margin: 0 0 35px 0;">
                                {t['text']}
                            </p>
                            
                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="border-radius: 50px; background: linear-gradient(135deg, #03dac6 0%, #00b4a0 100%);">
                                        <a href="{verification_link}" 
                                           style="display: inline-block; padding: 16px 40px; color: #0a0a14; 
                                                  text-decoration: none; font-weight: 700; font-size: 16px;
                                                  letter-spacing: 0.5px;">
                                            {t['button']}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #888888; font-size: 14px; margin: 40px 0 15px 0;">
                                {t['alt_text']}
                            </p>
                            
                            <p style="color: #6627cd; font-size: 12px; word-break: break-all; 
                                      background: rgba(102, 39, 205, 0.1); padding: 15px; 
                                      border-radius: 8px; border: 1px solid rgba(102, 39, 205, 0.3);">
                                {verification_link}
                            </p>
                            
                            <p style="color: #666666; font-size: 13px; margin: 30px 0 0 0;">
                                {t['expire']}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #0a0a14; padding: 15px 40px; text-align: center; border-top: 1px solid #222;">
                            <p style="color: #666666; font-size: 11px; margin: 0 0 5px 0;">
                                {t['rights']}
                            </p>
                            <p style="color: #555555; font-size: 10px; margin: 0;">
                                {t['footer']}
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""


def send_verification_email(email: str, token: str, user_name: str = "Usuário", lang: str = "pt") -> bool:
    """
    Sends a verification email using Resend.
    
    Args:
        email: Recipient email address
        token: JWT verification token
        user_name: User's name for personalization
        lang: Language code (pt, en, es)
        
    Returns:
        True if email was sent successfully, False otherwise
    """
    # Build verification URL (points to backend endpoint)
    verification_link = f"{API_URL}/auth/register/verify-email?token={token}"
    
    # Get translations
    t = get_translation(lang)
    
    # Check if Resend is configured
    if not resend.api_key:
        logger.warning(f"RESEND_API_KEY não configurada. Email para {email} não enviado.")
        logger.info(f"[DEV] Link de verificação: {verification_link}")
        return False
    
    try:
        html_content = get_verification_email_template(verification_link, user_name, lang)
        
        params = {
            "from": f"Qython <{MAIL_FROM}>",
            "to": [email],
            "subject": t['subject'],
            "html": html_content,
        }
        
        response = resend.Emails.send(params)
        
        if response and response.get("id"):
            logger.info(f"Email de verificação enviado para {email}. ID: {response['id']}")
            return True
        else:
            logger.error(f"Resend retornou resposta inesperada: {response}")
            return False
            
    except Exception as e:
        logger.error(f"Erro ao enviar email via Resend para {email}: {str(e)}")
        # Don't break registration if email fails
        return False

def send_welcome_email(email: str, user_name: str = "Usuário", lang: str = "pt") -> bool:
    """
    Sends a premium welcome email after account activation.
    Supports i18n: pt, en, es
    """
    if not resend.api_key:
        logger.warning("RESEND_API_KEY não configurada. Welcome email não enviado.")
        return False
    
    t = get_translation(lang)
    lang_code = {"pt": "pt-BR", "en": "en-US", "es": "es-ES"}.get(lang, "pt-BR")
    dashboard_link = f"{WEB_URL}/login"
    
    try:
        html_content = f"""
        <!DOCTYPE html>
        <html lang="{lang_code}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Qython</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a14; color: #fff;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a14;">
                <tr>
                    <td align="center" style="padding: 20px;">
                        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #12151f; border-radius: 16px; border: 1px solid #333; overflow: hidden;">
                            
                            <!-- HEADER (Logo) -->
                            <tr>
                                <td align="center" style="padding: 35px 30px 20px 30px; text-align: center;">
                                    <a href="#" style="pointer-events: none; display: inline-block; line-height: 0;">
                                        <img src="{WEB_URL}/assets/images/branding/qython-logo-full.png?v=2" alt="Qython" width="180" style="display: block; margin: 0 auto; border: 0; user-select: none;" oncontextmenu="return false;">
                                    </a>
                                </td>
                            </tr>

                            <!-- BANNER DE BOAS-VINDAS -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #03dac6 0%, #00b4a0 100%); padding: 40px; text-align: center;">
                                    <h1 style="margin: 0; color: #0a0a14; font-size: 28px; font-weight: 700;">{t.get('welcome_title', 'Bem-vindo ao Futuro da Medicina!')}</h1>
                                </td>
                            </tr>

                            <!-- CONTEÚDO -->
                            <tr>
                                <td style="padding: 40px; background-color: #12151f;">
                                    <p style="font-size: 16px; color: #cccccc; margin: 0 0 20px 0;">{t.get('hello', 'Olá')}, <strong style="color: #ffffff;">{user_name}</strong>!</p>
                                    
                                    <p style="font-size: 15px; color: #cccccc; line-height: 1.6; margin: 0 0 15px 0;">
                                        {t.get('welcome_text_1', 'Parabéns! Sua conta foi <strong>ativada com sucesso</strong>.')}
                                    </p>
                                    <p style="font-size: 15px; color: #cccccc; line-height: 1.6; margin: 0 0 30px 0;">
                                        {t.get('welcome_text_2', 'Você agora tem acesso completo à plataforma de inteligência clínica mais avançada do mercado.')}
                                    </p>
                                    
                                    <!-- DICAS -->
                                    <div style="background: rgba(3, 218, 198, 0.05); border: 1px solid rgba(3, 218, 198, 0.2); border-radius: 12px; padding: 20px; margin: 20px 0;">
                                        <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;">{t.get('welcome_tip_1', '🩺 <strong>Copiloto Clínico:</strong> Converse com nossa IA sobre qualquer tema médico')}</p>
                                        <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;">{t.get('welcome_tip_2', '📚 <strong>Bibliotecas:</strong> Faça upload de PDFs e converse com seus materiais')}</p>
                                        <p style="margin: 0; font-size: 14px; color: #e0e0e0;">{t.get('welcome_tip_3', '🏆 <strong>Arena:</strong> Treine para provas de residência com simulados')}</p>
                                    </div>

                                    <!-- BOTÃO -->
                                    <div style="text-align: center; margin-top: 35px; margin-bottom: 20px;">
                                        <a href="{dashboard_link}" style="background: linear-gradient(135deg, #6627cd 0%, #8b5cf6 100%); color: #ffffff; padding: 16px 40px; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(102, 39, 205, 0.4);">
                                            {t.get('welcome_button', 'Acessar o Qython')}
                                        </a>
                                    </div>
                                </td>
                            </tr>

                            <!-- FOOTER -->
                            <tr>
                                <td style="background-color: #0d0f16; padding: 20px; text-align: center; border-top: 1px solid #222;">
                                    <p style="margin: 0; color: #444444; font-size: 11px;">
                                        {t.get('rights', '© 2026 Qython, Inc. Todos os direitos reservados.')}
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        params = {
            "from": f"Qython <{MAIL_FROM}>",
            "to": [email],
            "subject": t.get('welcome_subject', 'Bem-vindo ao Qython! 🎉'),
            "html": html_content,
        }
        
        response = resend.Emails.send(params)
        logger.info(f"Welcome email (premium) enviado para {email}")
        return True
        
    except Exception as e:
        logger.error(f"Erro ao enviar welcome email: {str(e)}")
        return False


def send_registration_complete_email(email: str, user_name: str = "Usuário", lang: str = "pt") -> bool:
    """
    Sends a registration confirmation email for users entering the waitlist.
    Supports i18n: pt, en, es
    """
    if not resend.api_key:
        logger.warning("RESEND_API_KEY não configurada. Registration complete email não enviado.")
        return False
    
    t = get_translation(lang)
    lang_code = {"pt": "pt-BR", "en": "en-US", "es": "es-ES"}.get(lang, "pt-BR")
    
    try:
        html_content = f"""
        <!DOCTYPE html>
        <html lang="{lang_code}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Qython</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a14; color: #fff;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a14;">
                <tr>
                    <td align="center" style="padding: 20px;">
                        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #12151f; border-radius: 16px; border: 1px solid #333; overflow: hidden;">
                            
                            <!-- HEADER (Logo) -->
                            <tr>
                                <td align="center" style="padding: 35px 30px 20px 30px; text-align: center;">
                                    <a href="#" style="pointer-events: none; display: inline-block; line-height: 0;">
                                        <img src="{WEB_URL}/assets/images/branding/qython-logo-full.png?v=2" alt="Qython" width="180" style="display: block; margin: 0 auto; border: 0; user-select: none;" oncontextmenu="return false;">
                                    </a>
                                </td>
                            </tr>

                            <!-- BANNER -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #6627cd 0%, #0a0a14 100%); padding: 40px; text-align: center;">
                                    <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                        {t.get('reg_complete_title', 'Cadastro Concluído com Sucesso!')}
                                    </h1>
                                </td>
                            </tr>

                            <!-- CONTEÚDO -->
                            <tr>
                                <td style="padding: 40px; background-color: #12151f;">
                                    <p style="font-size: 16px; color: #cccccc; margin: 0 0 20px 0;">
                                        {t.get('reg_complete_hello', 'Olá')}, <strong style="color: #ffffff;">{user_name}</strong>!
                                    </p>
                                    
                                    <p style="font-size: 15px; color: #cccccc; line-height: 1.6; margin: 0 0 15px 0;">
                                        {t.get('reg_complete_text_1', 'Seu cadastro no <strong>Qython</strong> foi recebido com sucesso!')}
                                    </p>
                                    <p style="font-size: 15px; color: #cccccc; line-height: 1.6; margin: 0 0 15px 0;">
                                        {t.get('reg_complete_text_2', 'Estamos verificando seus documentos e você receberá um <strong>convite de acesso</strong> por e-mail em breve.')}
                                    </p>
                                    <p style="font-size: 15px; color: #cccccc; line-height: 1.6; margin: 0 0 30px 0;">
                                        {t.get('reg_complete_text_3', 'Enquanto isso, seu lugar na nossa lista de espera está garantido.')}
                                    </p>
                                    
                                    <!-- DICA -->
                                    <div style="background: rgba(102, 39, 205, 0.1); border: 1px dashed rgba(102, 39, 205, 0.4); border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
                                        <p style="margin: 0; font-size: 15px; color: #e0e0e0;">
                                            {t.get('reg_complete_tip', '💡 <strong>Dica:</strong> Fique de olho na sua caixa de entrada (e no spam)!')}
                                        </p>
                                    </div>
                                    
                                    <p style="font-size: 13px; color: #888888; text-align: center; margin-top: 30px;">
                                        {t.get('reg_complete_footer', 'Você receberá novidades sobre o Qython em primeira mão.')}
                                    </p>
                                </td>
                            </tr>

                            <!-- FOOTER -->
                            <tr>
                                <td style="background-color: #0d0f16; padding: 20px; text-align: center; border-top: 1px solid #222;">
                                    <p style="margin: 0; color: #444444; font-size: 11px;">
                                        {t.get('rights', '© 2026 Qython, Inc. Todos os direitos reservados.')}
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        params = {
            "from": f"Qython <{MAIL_FROM}>",
            "to": [email],
            "subject": t.get('reg_complete_subject', 'Cadastro recebido! 📝'),
            "html": html_content,
        }
        
        response = resend.Emails.send(params)
        logger.info(f"Registration complete email enviado para {email}")
        return True
        
    except Exception as e:
        logger.error(f"Erro ao enviar registration complete email: {str(e)}")
        return False


def send_invite_email(email: str, user_name: str, token: str, lang: str = "pt") -> bool:
    """
    Envia um e-mail internacionalizado informando que o usuário saiu da Waitlist.
    """
    if not resend.api_key:
        logger.warning("Resend API key not configured")
        return False
    
    # Obtém as traduções baseadas no idioma
    t = get_translation(lang)
    lang_code = {"pt": "pt-BR", "en": "en-US", "es": "es-ES"}.get(lang, "pt-BR")
        
    try:
        login_link = f"{WEB_URL}/login"
        
        html_content = f"""
        <!DOCTYPE html>
        <html lang="{lang_code}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Qython</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a14; color: #fff;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a14;">
                <tr>
                    <td align="center" style="padding: 20px;">
                        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #12151f; border-radius: 16px; border: 1px solid #333; overflow: hidden;">
                            
                            <!-- HEADER (Logo) -->
                            <tr>
                                <td align="center" style="padding: 35px 30px 20px 30px; text-align: center;">
                                    <a href="#" style="pointer-events: none; display: inline-block; line-height: 0;">
                                        <img src="{WEB_URL}/assets/images/branding/qython-logo-full.png?v=2" alt="Qython" width="180" style="display: block; margin: 0 auto; border: 0; user-select: none;" oncontextmenu="return false;">
                                    </a>
                                </td>
                            </tr>

                            <!-- BANNER DE BOAS-VINDAS -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #6627cd 0%, #0a0a14 100%); padding: 40px; text-align: center;">
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">{t['invite_title']}</h1>
                                </td>
                            </tr>

                            <!-- CONTEÚDO -->
                            <tr>
                                <td style="padding: 40px; background-color: #12151f;">
                                    <p style="font-size: 16px; color: #cccccc; margin: 0 0 20px 0;">{t['hello']}, <strong style="color: #ffffff;">{user_name}</strong>.</p>
                                    
                                    <p style="font-size: 15px; color: #cccccc; line-height: 1.6; margin: 0 0 30px 0;">
                                        {t['invite_text_1']} 
                                        {t['invite_text_2']}
                                    </p>
                                    
                                    <!-- BOX DO CÓDIGO -->
                                    <div style="background: rgba(3, 218, 198, 0.05); border: 1px dashed #03dac6; border-radius: 12px; padding: 20px; margin: 30px 0; text-align: center;">
                                        <p style="margin: 0 0 10px 0; font-size: 11px; color: #03dac6; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">{t['invite_code_label']}</p>
                                        <p style="margin: 0; font-size: 28px; color: #ffffff; font-family: 'Courier New', monospace; letter-spacing: 3px; font-weight: 700;">{token}</p>
                                    </div>

                                    <!-- BOTÃO -->
                                    <div style="text-align: center; margin-top: 35px; margin-bottom: 20px;">
                                        <a href="{login_link}" style="background: linear-gradient(135deg, #03dac6 0%, #00b4a0 100%); color: #0a0a14; padding: 16px 40px; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(3, 218, 198, 0.3);">
                                            {t['invite_button']}
                                        </a>
                                    </div>
                                    
                                    <p style="font-size: 13px; color: #888888; text-align: center; margin-top: 30px;">
                                        {t['invite_tip']}
                                    </p>
                                </td>
                            </tr>

                            <!-- FOOTER -->
                            <tr>
                                <td style="background-color: #0d0f16; padding: 20px; text-align: center; border-top: 1px solid #222;">
                                    <p style="margin: 0; color: #444444; font-size: 11px;">
                                        {t['rights']}
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        params = {
            "from": f"Qython <{MAIL_FROM}>",
            "to": [email],
            "subject": t['invite_subject'],
            "html": html_content,
        }
        
        resend.Emails.send(params)
        logger.info(f"Convite enviado para {email} (Lang: {lang})")
        return True
        
    except Exception as e:
        logger.error(f"Erro ao enviar convite: {str(e)}")
        return False


def send_ban_email(email: str, user_name: str, reason_key: str, lang: str = "pt") -> bool:
    """
    Envia e-mail de banimento traduzido baseado em uma chave de motivo.
    """
    if not resend.api_key: return False
    
    t = get_translation(lang)
    
    # Busca o texto do motivo no idioma do usuário
    reason_text = t.get(f"reason_{reason_key}", t['reason_terms_violation'])
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Segoe UI', sans-serif; background-color: #f4f4f4; padding: 40px; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; border-top: 5px solid #ff4444; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
            <h1 style="color: #d32f2f; margin-top: 0; font-size: 24px;">{t['ban_title']}</h1>
            <p style="font-size: 16px;">{t['hello']}, <strong>{user_name}</strong>.</p>
            <p style="font-size: 16px; line-height: 1.6;">{t['ban_intro']}</p>
            
            <div style="background: #fff5f5; padding: 20px; border-radius: 6px; border: 1px solid #ffcdd2; margin: 25px 0;">
                <p style="margin: 0; font-size: 12px; color: #d32f2f; text-transform: uppercase; font-weight: bold;">{t['ban_label']}</p>
                <p style="margin: 5px 0 0 0; font-size: 18px; color: #333; font-weight: 600;">{reason_text}</p>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                {t['ban_contact']} <br>
                <a href="mailto:legal@qython.ai" style="color: #6627cd; text-decoration: none; font-weight: bold;">legal@qython.ai</a>
            </p>
        </div>
    </body>
    </html>
    """
    try:
        resend.Emails.send({
            "from": f"Qython Trust & Safety <{MAIL_FROM}>", 
            "to": [email], 
            "subject": t['ban_subject'], 
            "html": html_content
        })
        logger.info(f"Email de banimento enviado para {email}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar email de banimento: {e}")
        return False


def send_unban_email(email: str, user_name: str, lang: str = "pt") -> bool:
    """
    Envia e-mail de reativação de conta.
    """
    if not resend.api_key: return False
    t = get_translation(lang)
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Segoe UI', sans-serif; background-color: #f4f4f4; padding: 40px; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; border-top: 5px solid #00c853; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
            <h1 style="color: #2e7d32; margin-top: 0; font-size: 24px;">{t['unban_title']}</h1>
            <p style="font-size: 16px;">{t['hello']}, <strong>{user_name}</strong>.</p>
            <p style="font-size: 16px; line-height: 1.6;">{t['unban_text']}</p>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="{WEB_URL}/login" style="display: inline-block; background: #00c853; color: white; padding: 14px 30px; text-decoration: none; border-radius: 50px; font-weight: bold;">
                    {t['login_button']}
                </a>
            </div>
        </div>
    </body>
    </html>
    """
    try:
        resend.Emails.send({
            "from": f"Qython Support <{MAIL_FROM}>", 
            "to": [email], 
            "subject": t['unban_subject'], 
            "html": html_content
        })
        logger.info(f"Email de reativação enviado para {email}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar email de reativação: {e}")
        return False


def send_verification_revoked_email(email: str, user_name: str, reason: str, lang: str = "pt") -> bool:
    """
    Envia e-mail de revogação de verificação com o motivo.
    """
    if not resend.api_key: return False
    t = get_translation(lang)
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: 'Segoe UI', sans-serif; background-color: #f4f4f4; padding: 40px; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; border-top: 5px solid #ff9800; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
            <h1 style="color: #e65100; margin-top: 0; font-size: 24px;">{t['revoked_title']}</h1>
            <p style="font-size: 16px;">{t['hello']}, <strong>{user_name}</strong>.</p>
            <p style="font-size: 16px; line-height: 1.6;">{t['revoked_text']}</p>
            
            <div style="background: #fff3e0; padding: 20px; border-radius: 6px; border: 1px solid #ffe0b2; margin: 25px 0;">
                <p style="margin: 0; font-size: 12px; color: #e65100; text-transform: uppercase; font-weight: bold;">MOTIVO:</p>
                <p style="margin: 5px 0 0 0; font-size: 16px; color: #333;">{reason}</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="{WEB_URL}/login" style="display: inline-block; background: #e65100; color: white; padding: 14px 30px; text-decoration: none; border-radius: 50px; font-weight: bold;">
                    {t['revoked_button']}
                </a>
            </div>
        </div>
    </body>
    </html>
    """
    try:
        resend.Emails.send({
            "from": f"Qython Security <{MAIL_FROM}>", 
            "to": [email], 
            "subject": t['revoked_subject'], 
            "html": html_content
        })
        logger.info(f"Email de revogação enviado para {email}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar email de revogação: {e}")
        return False




def send_password_reset_email(email: str, token: str, user_name: str = "Usuário", lang: str = "pt") -> bool:
    """
    Sends a password reset email using Resend.
    """
    reset_link = f"{WEB_URL}/reset-password?token={token}"
    t = get_translation(lang)
    lang_code = {"pt": "pt-BR", "en": "en-US", "es": "es-ES"}.get(lang, "pt-BR")

    if not resend.api_key:
        logger.warning(f"RESEND_API_KEY não configurada. Reset email para {email} não enviado.")
        logger.info(f"[DEV] Link de reset: {reset_link}")
        return False

    try:
        html_content = f"""
<!DOCTYPE html>
<html lang="{lang_code}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Qython</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a14;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a14;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #12151f; border-radius: 16px; border: 1px solid #333; overflow: hidden;">

                    <!-- Header with logo -->
                    <tr>
                        <td style="background: linear-gradient(180deg, rgba(102, 39, 205, 0.15) 0%, #12151f 100%); padding: 35px 30px 20px 30px; text-align: center;">
                            <a href="#" style="pointer-events: none; display: inline-block; line-height: 0;">
                                <img src="{WEB_URL}/assets/images/branding/qython-logo-full.png?v=2" alt="Qython" width="180" style="display: block; margin: 0 auto; border: 0;">
                            </a>
                            <p style="color: rgba(255,255,255,0.6); margin: 15px 0 0 0; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">{t['tagline']}</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 50px 40px; text-align: center;">
                            <p style="color: #03dac6; font-size: 18px; margin: 0 0 15px 0;">
                                {t['hello']}, {user_name}!
                            </p>

                            <h2 style="color: #ffffff; margin: 0 0 25px 0; font-size: 24px; font-weight: 600;">
                                {t.get('reset_title', 'Redefinir Senha')}
                            </h2>

                            <p style="color: #cccccc; font-size: 16px; line-height: 1.7; margin: 0 0 35px 0;">
                                {t.get('reset_text', 'Recebemos uma solicitação para redefinir a senha da sua conta.')}
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="border-radius: 50px; background: linear-gradient(135deg, #6627cd 0%, #8b5cf6 100%);">
                                        <a href="{reset_link}"
                                           style="display: inline-block; padding: 16px 40px; color: #ffffff;
                                                  text-decoration: none; font-weight: 700; font-size: 16px;
                                                  letter-spacing: 0.5px;">
                                            {t.get('reset_button', 'Redefinir Minha Senha')}
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #888888; font-size: 14px; margin: 40px 0 15px 0;">
                                {t['alt_text']}
                            </p>

                            <p style="color: #6627cd; font-size: 12px; word-break: break-all;
                                      background: rgba(102, 39, 205, 0.1); padding: 15px;
                                      border-radius: 8px; border: 1px solid rgba(102, 39, 205, 0.3);">
                                {reset_link}
                            </p>

                            <p style="color: #666666; font-size: 13px; margin: 30px 0 0 0;">
                                {t.get('reset_expire', 'Este link expira em 1 hora.')}
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #0a0a14; padding: 15px 40px; text-align: center; border-top: 1px solid #222;">
                            <p style="color: #666666; font-size: 11px; margin: 0 0 5px 0;">
                                {t['rights']}
                            </p>
                            <p style="color: #555555; font-size: 10px; margin: 0;">
                                {t.get('reset_footer', 'Se você não solicitou a redefinição de senha, ignore este e-mail.')}
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
        params = {
            "from": f"Qython <{MAIL_FROM}>",
            "to": [email],
            "subject": t.get('reset_subject', 'Qython - Redefinir sua senha'),
            "html": html_content,
        }

        response = resend.Emails.send(params)

        if response and response.get("id"):
            logger.info(f"Email de reset de senha enviado para {email}. ID: {response['id']}")
            return True
        else:
            logger.error(f"Resend retornou resposta inesperada: {response}")
            return False

    except Exception as e:
        logger.error(f"Erro ao enviar email de reset via Resend para {email}: {str(e)}")
        return False


def send_material_ready_email(
    email: str,
    user_name: str,
    material_type: str,
    material_title: str,
    link: str,
    lang: str = "pt"
) -> bool:
    """
    Sends a notification email when a material (podcast, video, simulado, slideshow) is ready.
    """
    if not resend.api_key:
        logger.warning("RESEND_API_KEY not configured. Material ready email not sent.")
        return False

    t = get_translation(lang)
    lang_code = {"pt": "pt-BR", "en": "en-US", "es": "es-ES"}.get(lang, "pt-BR")

    # Friendly material type names
    type_labels = {
        "pt": {"podcast": "Podcast", "video": "Videoaula", "simulado": "Simulado", "slideshow": "Slideshow"},
        "en": {"podcast": "Podcast", "video": "Video Lesson", "simulado": "Quiz", "slideshow": "Slideshow"},
        "es": {"podcast": "Podcast", "video": "Videolección", "simulado": "Simulacro", "slideshow": "Slideshow"},
    }
    friendly_type = type_labels.get(lang, type_labels["pt"]).get(material_type, material_type.capitalize())

    text_body = t.get('material_ready_text', '').replace('{material_type}', friendly_type).replace('{material_title}', material_title)

    try:
        html_content = f"""
<!DOCTYPE html>
<html lang="{lang_code}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Qython</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a14;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a14;">
        <tr>
            <td align="center" style="padding: 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #12151f; border-radius: 16px; border: 1px solid #333; overflow: hidden;">
                    <!-- HEADER -->
                    <tr>
                        <td align="center" style="padding: 35px 30px 20px 30px;">
                            <a href="#" style="pointer-events: none; display: inline-block; line-height: 0;">
                                <img src="{WEB_URL}/assets/images/branding/qython-logo-full.png?v=2" alt="Qython" width="180" style="display: block; margin: 0 auto; border: 0;">
                            </a>
                        </td>
                    </tr>
                    <!-- BANNER -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #03dac6 0%, #00b4a0 100%); padding: 40px; text-align: center;">
                            <h1 style="margin: 0; color: #0a0a14; font-size: 28px; font-weight: 700;">{t.get('material_ready_title', 'Material Pronto!')}</h1>
                        </td>
                    </tr>
                    <!-- CONTENT -->
                    <tr>
                        <td style="padding: 40px; background-color: #12151f;">
                            <p style="font-size: 16px; color: #cccccc; margin: 0 0 20px 0;">{t.get('hello', 'Olá')}, <strong style="color: #ffffff;">{user_name}</strong>!</p>
                            <p style="font-size: 15px; color: #cccccc; line-height: 1.6; margin: 0 0 30px 0;">{text_body}</p>
                            <!-- BUTTON -->
                            <div style="text-align: center; margin-top: 35px; margin-bottom: 20px;">
                                <a href="{link}" style="background: linear-gradient(135deg, #6627cd 0%, #8b5cf6 100%); color: #ffffff; padding: 16px 40px; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 50px; display: inline-block; box-shadow: 0 4px 15px rgba(102, 39, 205, 0.4);">
                                    {t.get('material_ready_button', 'Acessar Material')}
                                </a>
                            </div>
                        </td>
                    </tr>
                    <!-- FOOTER -->
                    <tr>
                        <td style="background-color: #0d0f16; padding: 20px; text-align: center; border-top: 1px solid #222;">
                            <p style="margin: 0; color: #444444; font-size: 11px;">{t.get('rights', '© 2026 Qython, Inc. Todos os direitos reservados.')}</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""

        params = {
            "from": f"Qython <{MAIL_FROM}>",
            "to": [email],
            "subject": t.get('material_ready_subject', 'Seu material está pronto! 🎓'),
            "html": html_content,
        }

        resend.Emails.send(params)
        logger.info(f"Material ready email sent to {email} ({material_type})")
        return True

    except Exception as e:
        logger.error(f"Error sending material ready email: {str(e)}")
        return False




_UNSUB_LABEL = {
    "pt": "Não quer mais estes e-mails? Cancelar inscrição",
    "en": "Don't want these emails? Unsubscribe",
    "es": "¿No quieres estos correos? Cancelar suscripción",
}










logger.info("Email Service (Resend) inicializado")



