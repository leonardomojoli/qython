"""Tokens JWT do backend (PyJWT, HS256): o que vale como acesso e o que não vale.

Rodar: python tests/backend/test_jwt_tokens.py
"""
import base64
import json
import os
import sys
from datetime import timedelta

os.environ.setdefault("JWT_SECRET_KEY", "k" * 48)
os.environ.setdefault("DATABASE_URL", "postgresql://t:t@127.0.0.1:1/t")
os.environ.setdefault("QYTHON_ALLOW_EPHEMERAL_KEK", "1")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import jwt  # noqa: E402

from backend import security  # noqa: E402


def b64(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def test_ida_e_volta():
    token = security.create_access_token({"sub": "a@b.com", "user_id": 7, "device_id": 3})
    payload = security.verify_access_token(token)
    assert payload["user_id"] == 7 and payload["device_id"] == 3 and payload["sub"] == "a@b.com"
    assert isinstance(token, str)


def test_token_vencido_nao_vale():
    token = security.create_access_token({"sub": "a@b.com", "user_id": 7}, expires_delta=timedelta(seconds=-5))
    assert security.verify_access_token(token) is None


def test_assinatura_adulterada_ou_segredo_errado_nao_valem():
    token = security.create_access_token({"sub": "a@b.com", "user_id": 7})
    head, body, sig = token.split(".")
    assert security.verify_access_token(f"{head}.{body}.{sig[:-2]}AA") is None
    forged = jwt.encode({"sub": "a@b.com", "user_id": 7}, "outro-segredo" * 4, algorithm=security.ALGORITHM)
    assert security.verify_access_token(forged) is None


def test_algoritmo_none_e_outros_nao_valem():
    sem_assinatura = f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64({'sub': 'a@b.com', 'user_id': 1})}."
    assert security.verify_access_token(sem_assinatura) is None
    hs384 = jwt.encode({"sub": "a@b.com", "user_id": 1}, security.SECRET_KEY, algorithm="HS384")
    assert security.verify_access_token(hs384) is None


def test_tokens_de_outros_usos_nao_servem_de_acesso():
    # O de reset de senha compartilha o segredo mas não traz user_id.
    assert security.verify_access_token(security.create_password_reset_token("a@b.com")) is None
    # E o de acesso não serve de reset.
    access = security.create_access_token({"sub": "a@b.com", "user_id": 7})
    assert security.verify_password_reset_token(access) is None


def test_reset_ida_e_volta():
    assert security.verify_password_reset_token(security.create_password_reset_token("a@b.com")) == "a@b.com"


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, "->", repr(exc))
    sys.exit(1 if failed else 0)
