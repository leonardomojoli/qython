"""Pareamento do celular com a conta do médico.

O computador (app desktop ou o web do servidor) pede um código de uso único, que o médico
digita ou escaneia (QR code) no celular. A troca do código pelo segredo do aparelho (`claim`)
cria um `PairedDevice`; dali em diante o celular renova tokens curtos de acesso apresentando o
segredo (`exchange`), e o médico pode revogar o aparelho a qualquer hora.

Garantias:
  - O código tem 8 caracteres de um alfabeto de 32 (40 bits), vale 5 minutos e só serve uma vez.
    As rotas limitam as tentativas por origem; adivinhar não é viável nesse prazo.
  - Só os hashes (SHA-256) do código e do segredo do aparelho ficam no banco.
  - O segredo do aparelho só aparece na resposta do `claim`; perdido, o celular pareia de novo.
  - Conta banida ou inativa não pareia nem renova.
"""
from __future__ import annotations

import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import PairedDevice, PairingCode, User

logger = logging.getLogger("qython_logger")

# Sem 0/O e 1/I: o médico pode ter de digitar o código lendo a tela do computador.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8
CODE_TTL = timedelta(minutes=5)
DEVICE_NAME_MAX = 120


class PairingError(Exception):
    """Falha do pareamento, com o status HTTP que a rota deve devolver."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


INVALID_CODE = PairingError(400, "Código inválido ou expirado. Gere outro no computador.")
INVALID_DEVICE = PairingError(401, "Aparelho não reconhecido. Pareie o celular de novo.")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(raw: str) -> str:
    """Maiúsculas e só letras e números: aceita 'abcd-efgh', 'ABCD EFGH' e colado com espaços."""
    return re.sub(r"[^A-Z0-9]", "", (raw or "").upper())


def format_code(code: str) -> str:
    return f"{code[:4]}-{code[4:]}" if len(code) == CODE_LENGTH else code


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _clean_name(name: Optional[str]) -> str:
    name = re.sub(r"\s+", " ", (name or "").strip())
    return name[:DEVICE_NAME_MAX] or "Celular"


def _ensure_user_can_pair(user: Optional[User]) -> User:
    if user is None or user.status != "active":
        raise PairingError(403, "Esta conta não pode usar o celular pareado.")
    return user


async def create_code(db: AsyncSession, user: User) -> Tuple[str, datetime]:
    """Gera o código do usuário. Um por vez: os anteriores, usados ou não, são apagados."""
    await db.execute(delete(PairingCode).where(PairingCode.user_id == user.id))
    code = new_code()
    expires_at = _now() + CODE_TTL
    db.add(PairingCode(user_id=user.id, code_hash=hash_secret(code), expires_at=expires_at))
    await db.commit()
    return code, expires_at


async def claim(db: AsyncSession, code: str, device_name: str, platform: Optional[str]) -> Tuple[User, PairedDevice, str]:
    """Troca o código pelo aparelho pareado. Devolve (usuário, aparelho, segredo do aparelho)."""
    normalized = normalize_code(code)
    if len(normalized) != CODE_LENGTH:
        raise INVALID_CODE
    row = (await db.execute(
        select(PairingCode).where(PairingCode.code_hash == hash_secret(normalized)).with_for_update()
    )).scalars().first()
    if row is None or row.used_at is not None or row.expires_at <= _now():
        raise INVALID_CODE
    user = _ensure_user_can_pair((await db.execute(select(User).where(User.id == row.user_id))).scalars().first())

    secret = secrets.token_urlsafe(32)
    device = PairedDevice(
        user_id=user.id, name=_clean_name(device_name),
        platform=(platform or "")[:20] or None, token_hash=hash_secret(secret),
    )
    row.used_at = _now()
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return user, device, secret


async def exchange(db: AsyncSession, device_secret: str) -> Tuple[User, PairedDevice]:
    """O segredo do aparelho vale um acesso curto: devolve (usuário, aparelho) ou recusa."""
    if not device_secret:
        raise INVALID_DEVICE
    device = (await db.execute(
        select(PairedDevice).where(PairedDevice.token_hash == hash_secret(device_secret))
    )).scalars().first()
    if device is None or device.revoked_at is not None:
        raise INVALID_DEVICE
    user = _ensure_user_can_pair((await db.execute(select(User).where(User.id == device.user_id))).scalars().first())
    device.last_seen_at = _now()
    await db.commit()
    return user, device


async def list_devices(db: AsyncSession, user: User) -> List[PairedDevice]:
    return list((await db.execute(
        select(PairedDevice)
        .where(PairedDevice.user_id == user.id, PairedDevice.revoked_at.is_(None))
        .order_by(PairedDevice.created_at.desc())
    )).scalars().all())


async def revoke(db: AsyncSession, user: User, device_id: int) -> PairedDevice:
    device = (await db.execute(
        select(PairedDevice).where(PairedDevice.id == device_id, PairedDevice.user_id == user.id)
    )).scalars().first()
    if device is None:
        raise PairingError(404, "Aparelho não encontrado.")
    if device.revoked_at is None:
        device.revoked_at = _now()
        await db.commit()
    return device
