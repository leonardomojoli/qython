# tests/backend/test_latreo_verification.py
"""Standalone tests for Latreo webhook signature verification.

Run directly (no pytest harness in this repo):
    python3 tests/backend/test_latreo_verification.py

Validates that backend/services/latreo_client.verify_webhook_signature matches
Latreo's Stripe-style signing exactly: HMAC-SHA256 over f"{t}.{body}" with the
shared whsec_ secret, header format "t=<unix>,v1=<hex>", 300s replay window.
"""
import hashlib
import hmac
import os
import sys
import time

# Import the backend as the `qython.backend` package (mirrors the other scripts
# in tests/backend). project root is .../olympos, package dir is .../olympos/qython.
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, project_root)

# Config validates these at import time; set throwaway values for the test.
os.environ.setdefault('JWT_SECRET_KEY', 'x' * 40)
os.environ.setdefault('DATABASE_URL', 'sqlite+aiosqlite:///:memory:')

SECRET = 'whsec_' + 'a' * 64
os.environ['LATREO_WEBHOOK_SECRET'] = SECRET

from qython.backend.services.latreo_client import verify_webhook_signature  # noqa: E402


def _sign(body: bytes, secret: str, ts: int) -> str:
    signed = f"{ts}.".encode('ascii') + body
    digest = hmac.new(secret.encode('ascii'), signed, hashlib.sha256).hexdigest()
    return f"t={ts},v1={digest}"


def test_valid_signature():
    body = b'{"id":"evt_1","type":"verification.approved","data":{"user_id":42,"tier":"bronze"}}'
    header = _sign(body, SECRET, int(time.time()))
    assert verify_webhook_signature(body, header, SECRET) is True


def test_expired_timestamp_fails():
    body = b'{"type":"verification.approved"}'
    header = _sign(body, SECRET, int(time.time()) - 3600)  # 1h old, outside 300s
    assert verify_webhook_signature(body, header, SECRET) is False


def test_tampered_body_fails():
    body = b'{"type":"verification.approved","data":{"tier":"bronze"}}'
    header = _sign(body, SECRET, int(time.time()))
    tampered = b'{"type":"verification.approved","data":{"tier":"strong"}}'
    assert verify_webhook_signature(tampered, header, SECRET) is False


def test_wrong_secret_fails():
    body = b'{"type":"verification.approved"}'
    header = _sign(body, SECRET, int(time.time()))
    assert verify_webhook_signature(body, header, 'whsec_' + 'b' * 64) is False


def test_malformed_and_missing_header():
    body = b'{}'
    assert verify_webhook_signature(body, None, SECRET) is False
    assert verify_webhook_signature(body, '', SECRET) is False
    assert verify_webhook_signature(body, 'garbage', SECRET) is False
    assert verify_webhook_signature(body, 't=abc,v1=def', SECRET) is False


def test_uses_config_secret_by_default():
    # When no explicit secret is passed, it falls back to Config.LATREO_WEBHOOK_SECRET.
    body = b'{"type":"verification.rejected"}'
    header = _sign(body, SECRET, int(time.time()))
    assert verify_webhook_signature(body, header) is True


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {fn.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
