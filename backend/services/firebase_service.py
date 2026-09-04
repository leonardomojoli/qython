# qython/backend/services/firebase_service.py
"""
Firebase Admin SDK service for secure phone verification.

This service validates Firebase ID Tokens to cryptographically verify
that a user has proven ownership of a phone number via SMS.
"""

import logging
import os
from typing import Optional

import firebase_admin
from firebase_admin import credentials, auth
from fastapi import HTTPException, status

from ..config import Config

logger = logging.getLogger("qython_logger")

# Initialize Firebase Admin SDK
_firebase_initialized = False

def _initialize_firebase():
    """Initialize Firebase Admin SDK with service account credentials."""
    global _firebase_initialized
    
    if _firebase_initialized or firebase_admin._apps:
        return True
    
    cred_path = Config.FIREBASE_CREDENTIALS_PATH
    
    try:
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            logger.info(f"Firebase Admin inicializado com sucesso usando: {cred_path}")
            _firebase_initialized = True
            return True
        else:
            logger.warning(
                f"Arquivo de credenciais Firebase não encontrado em: {cred_path}. "
                "A validação de telefone não funcionará até que você configure as credenciais."
            )
            return False
    except Exception as e:
        logger.error(f"Erro ao inicializar Firebase Admin: {e}")
        return False

# Try to initialize on module load
_initialize_firebase()


def verify_phone_token(token: str) -> str:
    """
    Validates the Firebase ID Token and returns the verified phone number.
    
    This is the "Zero Trust" verification - the backend asks Google directly
    if this token is legitimate and what phone number it represents.
    
    Args:
        token: The Firebase ID Token (JWT) from the frontend
        
    Returns:
        The verified phone number in E.164 format (e.g., +5511999999999)
        
    Raises:
        HTTPException: If token is invalid, expired, or doesn't contain a phone number
    """
    # Ensure Firebase is initialized
    if not _firebase_initialized and not _initialize_firebase():
        logger.error("Firebase não está configurado. Não é possível validar o telefone.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de verificação de telefone não está configurado."
        )
    
    try:
        # Verify the token's cryptographic signature with Google
        decoded_token = auth.verify_id_token(token)
        
        # Extract the phone number from the verified token
        phone_number = decoded_token.get('phone_number')
        
        if not phone_number:
            logger.warning(f"Token válido mas sem phone_number. UID: {decoded_token.get('uid')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token válido, mas sem número de telefone verificado."
            )
        
        logger.info(f"Telefone verificado com sucesso via Firebase: {phone_number}")
        return phone_number

    except auth.ExpiredIdTokenError:
        logger.warning("Token de telefone expirado recebido.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A verificação de telefone expirou. Por favor, verifique novamente."
        )
    except auth.InvalidIdTokenError as e:
        logger.warning(f"Token de telefone inválido: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de verificação de telefone inválido."
        )
    except auth.RevokedIdTokenError:
        logger.warning("Token de telefone revogado recebido.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de verificação revogado. Por favor, verifique novamente."
        )
    except Exception as e:
        logger.error(f"Erro inesperado na validação do token Firebase: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno na validação do telefone."
        )


def is_firebase_configured() -> bool:
    """Check if Firebase is properly configured and ready for use."""
    return _firebase_initialized or _initialize_firebase()


def verify_firebase_token(token: str) -> dict:
    """
    Validates ANY Firebase ID Token (Google, Phone, Email, etc.).
    Returns the full decoded payload.
    
    This is useful for Google Sign-In where we need email AND name.
    
    Args:
        token: The Firebase ID Token (JWT) from the frontend
        
    Returns:
        Dict with user info: uid, email, name, phone_number (if present), etc.
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    if not _firebase_initialized and not _initialize_firebase():
        logger.error("Firebase não está configurado.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de autenticação não está configurado."
        )
    
    try:
        decoded_token = auth.verify_id_token(token)
        email = decoded_token.get('email', '')
        masked_email = email[:3] + '***' + email[email.index('@'):] if '@' in email else '***'
        logger.info(f"Token Firebase validado. UID: {decoded_token.get('uid')}, Email: {masked_email}")
        return decoded_token
        
    except auth.ExpiredIdTokenError:
        logger.warning("Token Firebase expirado.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada. Por favor, faça login novamente."
        )
    except auth.InvalidIdTokenError as e:
        logger.warning(f"Token Firebase inválido: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação inválido."
        )
    except Exception as e:
        logger.error(f"Erro na validação do token Firebase: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno na autenticação."
        )
