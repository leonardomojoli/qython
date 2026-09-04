# qython/backend/services/dlocal_service.py
"""
Integração dLocal Go (cartão + PIX/boleto + métodos locais LatAm; cobrança cross-border
liquidando na entidade do Uruguai). Espelha o padrão do binance_service: cliente HTTP
síncrono (requests) chamado a partir do process_checkout assíncrono.

Auth (todas as chamadas): header `Authorization: Bearer <API_KEY>:<SECRET_KEY>`.
Webhook (notificações): HMAC-SHA256 — a assinatura é
    HMAC(sha256, API_KEY + raw_body, SECRET_KEY)
e chega no header `Authorization: V2-HMAC-SHA256, Signature: <hex>`. O corpo é mínimo
(`{"payment_id": "..."}`), SEM status — é preciso CONSULTAR o pagamento p/ saber o status.

Docs: https://docs.dlocalgo.com  ·  base sbx: api-sbx.dlocalgo.com  ·  base live: api.dlocalgo.com
"""

import hmac
import hashlib
import logging
import requests
from ..config import Config

logger = logging.getLogger("qython_logger")

_SBX_BASE = "https://api-sbx.dlocalgo.com"
_LIVE_BASE = "https://api.dlocalgo.com"


def _base_url() -> str:
    return _LIVE_BASE if (Config.DLOCAL_ENV or "sbx").lower() == "live" else _SBX_BASE


def _headers() -> dict:
    # dLocal Go: Bearer <API_KEY>:<SECRET_KEY>
    return {
        "Authorization": f"Bearer {Config.DLOCAL_API_KEY}:{Config.DLOCAL_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def create_payment(amount: float, currency: str, order_id: str, description: str,
                   notification_url: str, success_url: str, back_url: str,
                   country: str = None, payer: dict = None) -> dict:
    """
    Cria um pagamento avulso (POST /v1/payments). Retorna o JSON do dLocal,
    que inclui `id`, `status` e `redirect_url` (checkout hospedado p/ redirecionar o cliente).
    """
    body = {
        "amount": float(amount),
        "currency": currency,
        "order_id": order_id,
        "description": (description or "")[:100],
        "notification_url": notification_url,
        "success_url": success_url,
        "back_url": back_url,
    }
    if country:
        body["country"] = country
    if payer:
        body["payer"] = payer

    resp = requests.post(f"{_base_url()}/v1/payments", headers=_headers(), json=body, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_payment(payment_id: str) -> dict:
    """Consulta um pagamento por id (GET /v1/payments/{id}) — fonte da verdade do status no webhook."""
    resp = requests.get(f"{_base_url()}/v1/payments/{payment_id}", headers=_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def create_plan(name: str, description: str, amount: float, currency: str,
                frequency_type: str, notification_url: str, success_url: str,
                back_url: str, country: str = None, frequency_value: int = 1) -> dict:
    """
    Cria um plano de assinatura (POST /v1/subscription/plan). Retorna o JSON com
    `id`, `plan_token` e `subscribe_url` (link de checkout que o cliente usa p/ assinar).
    frequency_type: DAILY | WEEKLY | MONTHLY | YEARLY.
    """
    body = {
        "name": (name or "")[:128],
        "description": (description or "")[:200],
        "amount": float(amount),
        "currency": currency,
        "frequency_type": frequency_type,
        "frequency_value": frequency_value,
        "notification_url": notification_url,
        "success_url": (success_url or "")[:200],
        "back_url": back_url,
    }
    if country:
        body["country"] = country

    resp = requests.post(f"{_base_url()}/v1/subscription/plan", headers=_headers(), json=body, timeout=30)
    resp.raise_for_status()
    return resp.json()


def verify_notification(raw_body: bytes, authorization_header: str) -> bool:
    """
    Valida a notificação do dLocal Go.
      Signature = HMAC_sha256(API_KEY + raw_body, SECRET_KEY)
    O header é `Authorization: V2-HMAC-SHA256, Signature: <hex>`.
    """
    if not authorization_header or not Config.DLOCAL_API_KEY or not Config.DLOCAL_SECRET_KEY:
        return False
    # Extrai o hex após 'Signature:'
    sig = authorization_header.split("Signature:")[-1].strip() if "Signature:" in authorization_header else ""
    if not sig:
        return False

    body_str = raw_body.decode("utf-8") if isinstance(raw_body, (bytes, bytearray)) else str(raw_body)
    message = f"{Config.DLOCAL_API_KEY}{body_str}"
    calculated = hmac.new(
        Config.DLOCAL_SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    try:
        return hmac.compare_digest(calculated, sig)
    except Exception:
        return False
