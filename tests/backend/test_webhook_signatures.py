"""Webhooks públicos (pagamento e verificação): sem segredo configurado, ou com ele vazio, nada passa.

Rodar: python tests/backend/test_webhook_signatures.py
"""
import hashlib
import hmac
import os
import sys
import time

os.environ.setdefault("JWT_SECRET_KEY", "k" * 48)
os.environ.setdefault("DATABASE_URL", "postgresql://t:t@127.0.0.1:1/t")
os.environ.setdefault("QYTHON_ALLOW_EPHEMERAL_KEK", "1")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.config import Config  # noqa: E402
from backend.services import binance_service, dlocal_service, latreo_client  # noqa: E402

BODY = '{"bizStatus":"PAY_SUCCESS","data":"{}"}'


def binance_headers(secret: str, body: str = BODY):
    ts = str(int(time.time() * 1000))
    nonce = "n0nce"
    sig = hmac.new(secret.encode(), f"{ts}\n{nonce}\n{body}\n".encode(), hashlib.sha512).hexdigest().upper()
    return {"BinancePay-Timestamp": ts, "BinancePay-Nonce": nonce, "BinancePay-Signature": sig}


def with_config(**values):
    class Ctx:
        def __enter__(self):
            self.old = {k: getattr(Config, k) for k in values}
            for k, v in values.items():
                setattr(Config, k, v)

        def __exit__(self, *exc):
            for k, v in self.old.items():
                setattr(Config, k, v)

    return Ctx()


def test_binance_com_chave_vazia_ou_ausente_recusa_assinatura_forjada():
    for secret in ("", None):
        with with_config(BINANCE_PAY_SECRET_KEY=secret):
            assert binance_service.verify_binance_webhook(binance_headers(""), BODY) is False


def test_binance_com_chave_aceita_so_a_assinatura_certa():
    with with_config(BINANCE_PAY_SECRET_KEY="segredo-de-verdade"):
        assert binance_service.verify_binance_webhook(binance_headers("segredo-de-verdade"), BODY) is True
        assert binance_service.verify_binance_webhook(binance_headers("outro"), BODY) is False
        assert binance_service.verify_binance_webhook(binance_headers("segredo-de-verdade"), BODY + " ") is False


def test_dlocal_sem_chaves_recusa():
    sig = hmac.new(b"", b"x" + BODY.encode(), hashlib.sha256).hexdigest()
    for api, secret in (("", ""), (None, None), ("x", ""), ("", "y")):
        with with_config(DLOCAL_API_KEY=api, DLOCAL_SECRET_KEY=secret):
            assert dlocal_service.verify_notification(BODY.encode(), f"V2-HMAC-SHA256, Signature: {sig}") is False


def test_lastreo_sem_segredo_recusa():
    for secret in ("", None):
        with with_config(LATREO_WEBHOOK_SECRET=secret):
            assert latreo_client.verify_webhook_signature(BODY.encode(), f"t={int(time.time())},v1=abc") is False


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
