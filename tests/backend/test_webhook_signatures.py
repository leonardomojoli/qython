"""Webhook público do Lastreo (verificação de médicos): sem segredo configurado, ou com ele vazio, nada passa.

Rodar: python tests/backend/test_webhook_signatures.py
"""
import os
import sys
import time

os.environ.setdefault("JWT_SECRET_KEY", "k" * 48)
os.environ.setdefault("DATABASE_URL", "postgresql://t:t@127.0.0.1:1/t")
os.environ.setdefault("QYTHON_ALLOW_EPHEMERAL_KEK", "1")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.config import Config  # noqa: E402
from backend.services import latreo_client  # noqa: E402

BODY = '{"bizStatus":"PAY_SUCCESS","data":"{}"}'


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
