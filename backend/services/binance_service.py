# qython/backend/services/binance_service.py

import time
import json
import hmac
import hashlib
import requests
import string
import random
import logging
from ..config import Config

logger = logging.getLogger("qython_logger")

BASE_URL = "https://bpay.binanceapi.com"  # Use URL de sandbox para testes se necessário

def generate_nonce(length=32):
    return ''.join(random.choice(string.ascii_letters) for _ in range(length))

def get_signature(payload, timestamp, nonce):
    payload_str = f"{timestamp}\n{nonce}\n{json.dumps(payload)}\n"
    return hmac.new(
        Config.BINANCE_PAY_SECRET_KEY.encode('utf-8'),
        payload_str.encode('utf-8'),
        hashlib.sha512
    ).hexdigest().upper()

def create_binance_order(order_id: str, amount: float, goods_name: str, buyer_email: str = None):
    """
    Cria uma ordem de pagamento na Binance Pay.
    """
    endpoint = "/binancepay/openapi/v2/order"
    timestamp = str(int(time.time() * 1000))
    nonce = generate_nonce()

    payload = {
        "env": {"terminalType": "WEB"},
        "merchantTradeNo": order_id,
        "orderAmount": float(amount),
        "currency": "USDT",
        "goods": {
            "goodsType": "02", # 02 = Virtual Goods
            "goodsCategory": "Z000",
            "referenceGoodsId": order_id,
            "goodsName": goods_name[:250], # Limite de caracteres
            "goodsDetail": "Qython Medical AI Services"
        },
        "returnUrl": f"{Config.WEB_BASE_URL}/profile?payment=success",
        "cancelUrl": f"{Config.WEB_BASE_URL}/pricing?payment=cancelled"
    }

    signature = get_signature(payload, timestamp, nonce)

    headers = {
        "Content-Type": "application/json",
        "BinancePay-Timestamp": timestamp,
        "BinancePay-Nonce": nonce,
        "BinancePay-Certificate-SN": Config.BINANCE_PAY_API_KEY,
        "BinancePay-Signature": signature
    }

    try:
        response = requests.post(f"{BASE_URL}{endpoint}", headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        
        if result.get("status") == "SUCCESS":
            return result["data"] # Contém checkoutUrl e qrCodeUrl
        else:
            logger.error(f"Erro Binance Pay: {result}")
            raise Exception(f"Erro na criação da ordem Binance: {result.get('errorMessage')}")

    except Exception as e:
        logger.error(f"Exceção ao chamar Binance Pay: {e}")
        raise

def verify_binance_webhook(headers, body_str):
    """
    Verifica a assinatura do webhook da Binance com proteção contra replay attacks.
    """
    try:
        timestamp = headers.get("BinancePay-Timestamp")
        nonce = headers.get("BinancePay-Nonce")
        signature = headers.get("BinancePay-Signature")

        if not timestamp or not nonce or not signature:
            logger.warning("Webhook Binance com headers incompletos.")
            return False

        # Replay protection: reject webhooks older than 5 minutes
        try:
            webhook_time = int(timestamp)
            current_time = int(time.time() * 1000)  # Binance uses milliseconds
            if abs(current_time - webhook_time) > 300000:  # 5 minutes
                logger.warning(f"Webhook Binance rejeitado por timestamp expirado: {timestamp}")
                return False
        except (ValueError, TypeError):
            logger.warning(f"Webhook Binance com timestamp inválido: {timestamp}")
            return False

        payload = f"{timestamp}\n{nonce}\n{body_str}\n"

        calculated_signature = hmac.new(
            Config.BINANCE_PAY_SECRET_KEY.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha512
        ).hexdigest().upper()

        return hmac.compare_digest(calculated_signature, signature)
    except Exception as e:
        logger.error(f"Erro na verificação do webhook Binance: {e}")
        return False
