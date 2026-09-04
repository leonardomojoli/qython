# qython/backend/services/encryption_service.py
"""
Field-level encryption service.

Provides Fernet-based symmetric encryption for sensitive columns (CPF, RG,
clinical notes, etc.). Used via SQLAlchemy TypeDecorator so encryption is
transparent on read/write.

Keys live in env vars (never committed) and are loaded lazily so module import
does not fail in environments where they are not yet configured (CI, fresh
checkouts).

Two KEKs are supported:
- QYTHON_FIELD_KEK: encrypts at-rest sensitive columns (User, Patient, Consultation)
- QYTHON_TOKEN_KEK: deterministic tokenization for ML pseudonymization (same
  input -> same token, scoped per user, never plain on disk)

Rotation: a future migration may add KEK versioning (encrypted_field_v1, v2).
For now we assume one active key at a time.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import LargeBinary, String, TypeDecorator

logger = logging.getLogger(__name__)

_field_cipher: Optional[Fernet] = None
_token_kek: Optional[bytes] = None


def _load_field_cipher() -> Fernet:
    global _field_cipher
    if _field_cipher is not None:
        return _field_cipher

    raw = os.getenv("QYTHON_FIELD_KEK")
    if not raw:
        # Dev/test fallback. Logs loudly so production cannot accidentally rely on it.
        if os.getenv("QYTHON_ALLOW_EPHEMERAL_KEK") == "1":
            ephemeral = Fernet.generate_key()
            logger.warning(
                "QYTHON_FIELD_KEK not set. Using EPHEMERAL key — encrypted columns "
                "will NOT be readable after restart. Set QYTHON_FIELD_KEK in .env "
                "for any non-throwaway environment."
            )
            _field_cipher = Fernet(ephemeral)
            return _field_cipher
        raise RuntimeError(
            "QYTHON_FIELD_KEK is not set. Generate with "
            "`python -c 'from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())'` and set in .env. "
            "Set QYTHON_ALLOW_EPHEMERAL_KEK=1 only for throwaway local dev."
        )

    try:
        _field_cipher = Fernet(raw.encode() if isinstance(raw, str) else raw)
    except Exception as exc:
        raise RuntimeError(
            f"QYTHON_FIELD_KEK is malformed: {exc}. "
            "It must be a 32-byte url-safe base64-encoded Fernet key."
        ) from exc

    return _field_cipher


def _load_token_kek() -> bytes:
    global _token_kek
    if _token_kek is not None:
        return _token_kek

    raw = os.getenv("QYTHON_TOKEN_KEK")
    if not raw:
        if os.getenv("QYTHON_ALLOW_EPHEMERAL_KEK") == "1":
            ephemeral = os.urandom(32)
            logger.warning(
                "QYTHON_TOKEN_KEK not set. Using EPHEMERAL key — pseudonym tokens "
                "will NOT be stable across restarts."
            )
            _token_kek = ephemeral
            return _token_kek
        raise RuntimeError(
            "QYTHON_TOKEN_KEK is not set. Generate with "
            "`python -c 'import os, base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())'` "
            "and set in .env."
        )

    try:
        # Accept either url-safe base64 (preferred) or raw 32-byte string
        if len(raw) == 32:
            _token_kek = raw.encode() if isinstance(raw, str) else raw
        else:
            _token_kek = base64.urlsafe_b64decode(raw.encode() if isinstance(raw, str) else raw)
        if len(_token_kek) != 32:
            raise ValueError(f"decoded key length is {len(_token_kek)}, expected 32")
    except Exception as exc:
        raise RuntimeError(
            f"QYTHON_TOKEN_KEK is malformed: {exc}. "
            "Must be a 32-byte url-safe base64-encoded value."
        ) from exc

    return _token_kek


def encrypt_value(plaintext: Optional[str]) -> Optional[bytes]:
    if plaintext is None or plaintext == "":
        return None
    cipher = _load_field_cipher()
    return cipher.encrypt(plaintext.encode("utf-8"))


def decrypt_value(token: Optional[bytes]) -> Optional[str]:
    if token is None:
        return None
    cipher = _load_field_cipher()
    try:
        return cipher.decrypt(token).decode("utf-8")
    except InvalidToken:
        logger.error("Failed to decrypt field — token is invalid or KEK was rotated without re-encryption.")
        return None


def pseudonymize(scope: str, value: str) -> str:
    """Deterministic, opaque pseudonym. Same (scope, value) always produces
    the same token; without the KEK, the token reveals nothing.

    Example: pseudonymize('user', '12345') -> 'QY_user_a1b2c3d4...'
    """
    if value is None or value == "":
        return ""
    kek = _load_token_kek()
    mac = hmac.new(kek, f"{scope}:{value}".encode("utf-8"), hashlib.sha256).digest()
    short = base64.urlsafe_b64encode(mac).decode("utf-8").rstrip("=")[:32]
    return f"QY_{scope}_{short}"


def lookup_hash(value: Optional[str], scope: str = "default") -> Optional[str]:
    """Deterministic SHA-256-with-pepper for equality lookups on encrypted columns.

    Use this when you need a `WHERE x = :y` query on a column that is stored
    as ciphertext (BYTEA). Add a sibling `<col>_lookup String(64)` column,
    populate it via this helper on insert/update, index it, and query against
    that instead of the encrypted column.

    The "pepper" is QYTHON_TOKEN_KEK, so the hash is non-trivially reversible
    without the secret. Use `scope` to bind the hash to a column context so
    the same plaintext in different columns yields different hashes.

    Schema example:
        class User(Base):
            cpf          = Column(EncryptedString, nullable=True)
            cpf_lookup   = Column(String(64), nullable=True, index=True)

    Insert/update example:
        user.cpf = "12345678900"
        user.cpf_lookup = lookup_hash(user.cpf, scope="user.cpf")

    Query example:
        stmt = select(User).where(User.cpf_lookup == lookup_hash(input_cpf, scope="user.cpf"))

    Returns hex digest (64 chars) or None if value is falsy.
    """
    if value is None or value == "":
        return None
    kek = _load_token_kek()
    mac = hmac.new(kek, f"{scope}:{value}".encode("utf-8"), hashlib.sha256)
    return mac.hexdigest()


class EncryptedString(TypeDecorator):
    """
    SQLAlchemy column type that transparently encrypts/decrypts a string.

    Stores ciphertext as LargeBinary in Postgres. The plaintext value is
    encrypted on flush and decrypted on load.

    Usage:
        class User(Base):
            cpf = Column(EncryptedString(), nullable=True)

    Notes:
        - Indexing on encrypted columns is meaningless (ciphertext is opaque).
        - For equality lookups on encrypted fields, store a separate hash
          column (e.g. cpf_lookup = sha256(cpf)).
        - JSON values: use EncryptedJSON helper or serialize manually.
    """

    impl = LargeBinary
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt_value(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        # Postgres LargeBinary comes back as memoryview/bytes
        token = bytes(value) if not isinstance(value, bytes) else value
        return decrypt_value(token)


class EncryptedJSON(TypeDecorator):
    """
    Encrypts arbitrary JSON-serializable Python values. Stores ciphertext of
    the serialized JSON. Reverse on read.

    Use when the field is JSON in plaintext but needs encryption (e.g.
    Patient.allergies, Patient.chronic_conditions).
    """

    impl = LargeBinary
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        import json
        return encrypt_value(json.dumps(value, ensure_ascii=False))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        import json
        token = bytes(value) if not isinstance(value, bytes) else value
        plain = decrypt_value(token)
        if plain is None:
            return None
        try:
            return json.loads(plain)
        except json.JSONDecodeError:
            logger.error("EncryptedJSON: failed to parse decrypted payload")
            return None


__all__ = [
    "EncryptedString",
    "EncryptedJSON",
    "encrypt_value",
    "decrypt_value",
    "pseudonymize",
    "lookup_hash",
]
