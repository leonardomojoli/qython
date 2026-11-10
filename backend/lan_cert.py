"""Certificado TLS autoassinado do app desktop para a porta da rede local (pareamento do celular).

O celular não confia numa autoridade: ele recebe, pelo QR code, a impressão digital (SHA-256 do
certificado em DER) e só aceita um certificado com exatamente essa impressão. Por isso o certificado
não precisa de autoridade nem de endereço certo; o que importa é ser estável (o QR code e o celular
já pareado dependem dele) e a chave privada ficar no cofre do computador.

Chave ECDSA P-256 (curta, rápida, aceita pelo Android e pelo Node). Validade longa de propósito:
renovar quebraria o pareamento de todos os aparelhos, e a segurança vem da impressão digital, não do
prazo. Para trocar o certificado, o médico desliga e liga o acesso do celular e pareia de novo.
"""
from __future__ import annotations

import datetime
import hashlib
from typing import Dict

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID


def generate_certificate(days: int = 3650, common_name: str = "Qython (computador)") -> Dict[str, str]:
    """Gera a chave e o certificado. Devolve `cert_pem`, `key_pem` e `fingerprint` (SHA-256 do DER,
    hexadecimal minúsculo, 64 caracteres)."""
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Qython"),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))  # folga para relógio de celular adiantado
        .not_valid_after(now + datetime.timedelta(days=days))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost"), x509.DNSName("qython.local")]), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    der = cert.public_bytes(serialization.Encoding.DER)
    return {
        "cert_pem": cert.public_bytes(serialization.Encoding.PEM).decode("ascii"),
        "key_pem": key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        ).decode("ascii"),
        "fingerprint": hashlib.sha256(der).hexdigest(),
    }
