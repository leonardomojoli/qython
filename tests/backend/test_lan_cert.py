# tests/backend/test_lan_cert.py
"""Certificado autoassinado da porta da rede local (backend/lan_cert.py).

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_lan_cert.py

O celular só aceita o certificado cuja impressão digital veio no QR code, então o que importa aqui é
que a impressão digital seja de fato o SHA-256 do certificado, que a chave pertença a ele e que dois
certificados nunca tenham a mesma impressão.
"""
import hashlib
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, ROOT)

from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from backend.lan_cert import generate_certificate  # noqa: E402


def test_impressao_digital_e_o_sha256_do_certificado_em_der():
    made = generate_certificate()
    cert = x509.load_pem_x509_certificate(made['cert_pem'].encode())
    der = cert.public_bytes(serialization.Encoding.DER)
    assert made['fingerprint'] == hashlib.sha256(der).hexdigest()
    assert len(made['fingerprint']) == 64 and made['fingerprint'] == made['fingerprint'].lower()


def test_a_chave_e_do_certificado():
    made = generate_certificate()
    cert = x509.load_pem_x509_certificate(made['cert_pem'].encode())
    key = serialization.load_pem_private_key(made['key_pem'].encode(), password=None)
    pub = lambda k: k.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)  # noqa: E731
    assert pub(cert.public_key()) == pub(key.public_key())


def test_validade_longa_e_sem_poder_de_autoridade():
    cert = x509.load_pem_x509_certificate(generate_certificate(days=3650)['cert_pem'].encode())
    span = cert.not_valid_after_utc - cert.not_valid_before_utc
    assert 3600 <= span.days <= 3660, span
    assert cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca is False


def test_cada_instalacao_tem_o_seu():
    a, b = generate_certificate(), generate_certificate()
    assert a['fingerprint'] != b['fingerprint'] and a['key_pem'] != b['key_pem']


def test_pem_no_formato_esperado():
    made = generate_certificate()
    assert made['cert_pem'].startswith('-----BEGIN CERTIFICATE-----')
    assert made['key_pem'].startswith('-----BEGIN PRIVATE KEY-----')


if __name__ == '__main__':
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print(f'ok   {name}')
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f'FAIL {name}: {type(exc).__name__}: {exc}')
    sys.exit(1 if failed else 0)
