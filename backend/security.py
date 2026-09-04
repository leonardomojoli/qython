# qython/backend/security.py

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from .config import Config
from .database import get_db
from .models import User

# Configurar logging
logger = logging.getLogger("qython_logger")

# --- Configuração de Hashing de Senha ---
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

# --- Configuração de JWT ---
SECRET_KEY = Config.JWT_SECRET_KEY
ALGORITHM = Config.JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = Config.ACCESS_TOKEN_EXPIRE_MINUTES
VERIFICATION_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 60  # 1 hour

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# --- Funções de Senha ---

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica se a senha em texto plano corresponde ao hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Gera o hash de uma senha usando o esquema padrão (bcrypt)."""
    return pwd_context.hash(password)

# --- Funções de Token ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Cria um token de acesso JWT."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_verification_token(data: dict):
    """Cria um token JWT de curta duração para verificação de email."""
    expires = timedelta(minutes=VERIFICATION_TOKEN_EXPIRE_MINUTES)
    return create_access_token(data=data, expires_delta=expires)


def create_unsubscribe_token(user_id: int) -> str:
    """Token JWT sem expiração para descadastro de e-mails de ciclo de vida
    (1 clique, sem login). O claim `purpose` impede uso cruzado com outros tokens."""
    return jwt.encode(
        {"sub": str(user_id), "purpose": "unsubscribe"},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def verify_unsubscribe_token(token: str) -> Optional[int]:
    """Valida o token de descadastro e retorna o user_id, ou None se inválido."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "unsubscribe":
            return None
        return int(payload["sub"])
    except (JWTError, ValueError, KeyError, TypeError):
        return None


def verify_verification_token(token: str) -> Optional[str]:
    """Verifica um token de verificação e retorna o email se for válido."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError:
        return None

def create_password_reset_token(email: str) -> str:
    """Cria um token JWT para reset de senha (expira em 1h)."""
    expires = timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    return create_access_token(
        data={"sub": email, "purpose": "password_reset"},
        expires_delta=expires
    )

def verify_password_reset_token(token: str) -> Optional[str]:
    """Verifica um token de reset de senha. Retorna email se válido e purpose correto."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        purpose: str = payload.get("purpose")
        if email is None or purpose != "password_reset":
            return None
        return email
    except JWTError:
        return None

def verify_access_token(token: str) -> Optional[dict]:
    """Decode a JWT access token without Depends (standalone, for WebSocket use).
    Returns payload dict with user_id, or None on failure."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            return None
        return payload
    except JWTError:
        return None

# --- Dependência de Autenticação ---

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    """
    Dependência para obter o usuário atual a partir do token JWT.
    Lança exceções se o token for inválido ou o usuário não for encontrado.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            logger.warning("Token JWT sem 'user_id'.")
            raise credentials_exception
    except JWTError as e:
        logger.warning(f"Erro de decodificação do JWT: {e}")
        raise credentials_exception

    # Async query using select
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if user is None:
        logger.warning(f"Usuário com ID {user_id} do token não encontrado no banco.")
        raise credentials_exception
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependência que usa get_current_user e verifica se o usuário está ativo.
    Esta é a dependência que a maioria das rotas protegidas deve usar.
    """
    if current_user.status != "active":
        logger.warning(f"Tentativa de acesso por usuário inativo: {current_user.email} (status: {current_user.status})")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo ou não verificado")
    return current_user