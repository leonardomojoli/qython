# qython/backend/services/connector_service.py
"""Helpers de conexão dos Conectores (Drive etc.) usados por rotas e pipeline.

- Resolve a conexão ativa de um usuário.
- Minta access tokens sob demanda a partir do refresh token cifrado, com um
  cache in-process com margem de segurança (access token NUNCA é persistido).
- Marca a conexão como revogada quando o provider devolve invalid_grant, para
  a UI oferecer reconexão (banner) e as ações de add retornarem 403.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import UserCloudConnection
from . import cloud_storage
from .cloud_storage import CloudAuthRevoked

logger = logging.getLogger("qython_logger")

# cache in-process: {connection_id: (access_token, monotonic_expiry)}
# Margem de 120s evita usar token à beira de expirar (Drive devolveria 401).
_TOKEN_CACHE: dict = {}
_EXPIRY_MARGIN_SECONDS = 120


async def get_connection(
    db: AsyncSession, user_id: int, provider: str = "gdrive", only_active: bool = True,
) -> Optional[UserCloudConnection]:
    """Conexão do usuário para o provider (por padrão, só status='active')."""
    stmt = select(UserCloudConnection).filter(
        UserCloudConnection.user_id == user_id,
        UserCloudConnection.provider == provider,
    )
    if only_active:
        stmt = stmt.filter(UserCloudConnection.status == "active")
    result = await db.execute(stmt)
    return result.scalars().first()


async def get_access_token(db: AsyncSession, connection: UserCloudConnection) -> str:
    """Access token válido para a conexão (cache → refresh). CloudAuthRevoked
    marca a conexão como revogada antes de propagar."""
    cached = _TOKEN_CACHE.get(connection.id)
    if cached and cached[1] > time.monotonic():
        return cached[0]

    provider = cloud_storage.get_provider(connection.provider)
    try:
        tokens = await provider.refresh_access_token(connection.refresh_token)
    except CloudAuthRevoked:
        await mark_revoked(db, connection)
        raise
    access_token = tokens["access_token"]
    ttl = max(int(tokens.get("expires_in", 3600)) - _EXPIRY_MARGIN_SECONDS, 60)
    _TOKEN_CACHE[connection.id] = (access_token, time.monotonic() + ttl)

    from datetime import datetime, timezone
    connection.last_refresh_at = datetime.now(timezone.utc)
    await db.commit()
    return access_token


async def mark_revoked(db: AsyncSession, connection: UserCloudConnection) -> None:
    """Token morreu (invalid_grant/permissões): conexão exige reconexão do usuário."""
    _TOKEN_CACHE.pop(connection.id, None)
    if connection.status != "revoked":
        connection.status = "revoked"
        await db.commit()
        logger.warning(
            f"[CONNECTOR] Conexão {connection.provider} do user {connection.user_id} "
            f"marcada como revogada (reconexão necessária)."
        )


def drop_cached_token(connection_id: int) -> None:
    """Invalida o cache (usado no disconnect)."""
    _TOKEN_CACHE.pop(connection_id, None)


async def schedule_legacy_migration(user_id: int) -> None:
    """Migração dos docs legados server-side do usuário para o Drive dele, disparada ao
    conectar (background task do callback). Best-effort: falha aqui não quebra a conexão —
    os legados seguem servíveis do disco e um novo connect re-tenta."""
    from .academic_services.library_service import migrate_user_legacy_docs
    try:
        result = await migrate_user_legacy_docs(user_id)
        logger.info(f"[MIGRATE] pós-connect user {user_id}: {result}")
    except Exception as e:
        logger.error(f"[MIGRATE] falha na migração pós-connect do user {user_id}: {e}", exc_info=True)
