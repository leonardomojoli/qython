# qython/backend/routes/billing_routes.py

import logging
import stripe
import os
import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db
from ..models import User, Transaction
from ..security import get_current_active_user
from ..services import billing_service, binance_service, dlocal_service
from ..services.system_settings_service import SystemSettingsService

logger = logging.getLogger("qython_logger")

# Configurar Stripe
stripe.api_key = os.getenv('STRIPE_API_KEY')

router = APIRouter()

# --- Payloads ---

class CheckoutPayload(BaseModel):
    planKey: Optional[str] = None # ex: 'resident'
    interval: Optional[str] = None # 'monthly' ou 'annual'
    packId: Optional[str] = None   # ex: 'pack_small'
    provider: str = 'stripe'       # 'stripe' ou 'binance'
    type: Optional[str] = 'subscription' # 'subscription' ou 'one_time'

# --- Endpoints ---

@router.post("/create-checkout-session")
async def create_checkout_session(
    payload: CheckoutPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Endpoint unificado para criar sessões de pagamento (Stripe ou Binance).
    """
    # Check if gateway is enabled
    if payload.provider == 'stripe':
        if not await SystemSettingsService.is_stripe_enabled(db):
            raise HTTPException(
                status_code=503,
                detail="Os pagamentos via Stripe estão temporariamente indisponíveis. Tente novamente mais tarde."
            )
    elif payload.provider == 'binance':
        if not await SystemSettingsService.is_binance_enabled(db):
            raise HTTPException(
                status_code=503,
                detail="Os pagamentos via Binance Pay estão temporariamente indisponíveis. Tente novamente mais tarde."
            )
    elif payload.provider == 'dlocal':
        if not await SystemSettingsService.is_dlocal_enabled(db):
            raise HTTPException(
                status_code=503,
                detail="Os pagamentos via dLocal estão temporariamente indisponíveis. Tente novamente mais tarde."
            )

    # Determina a chave do item na tabela de preços
    item_key = ""
    if payload.packId:
        item_key = payload.packId
    elif payload.planKey and payload.interval:
        item_key = f"{payload.planKey}_{payload.interval}"
    else:
        raise HTTPException(status_code=400, detail="Dados de produto incompletos.")

    return await billing_service.process_checkout(
        user=current_user,
        item_key=item_key,
        provider=payload.provider,
        db=db
    )

# --- WEBHOOKS ---

@router.post("/stripe-webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None), db: AsyncSession = Depends(get_db)):
    webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')
    if not webhook_secret:
        logger.error("STRIPE_WEBHOOK_SECRET não configurado. Rejeitando webhook.")
        raise HTTPException(status_code=500, detail="Webhook não configurado")
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=stripe_signature, secret=webhook_secret
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail="Erro no webhook Stripe")

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        # Recupera metadados
        user_id = session.get('metadata', {}).get('user_id')
        item_key = session.get('metadata', {}).get('item_key')
        
        if user_id and item_key:
            await _fulfill_order(db, int(user_id), item_key, 'stripe', session['id'])

    return {"status": "success"}

@router.post("/binance-webhook")
async def binance_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Webhook para notificações da Binance Pay.
    """
    headers = request.headers
    body_bytes = await request.body()
    body_str = body_bytes.decode('utf-8')

    # 1. Verificar Assinatura (Segurança Crítica)
    if not binance_service.verify_binance_webhook(headers, body_str):
        logger.warning("Assinatura inválida no webhook da Binance.")
        raise HTTPException(status_code=400, detail="Assinatura inválida")

    data = json.loads(body_str)
    biz_status = data.get('bizStatus')
    
    if biz_status == 'PAY_SUCCESS':
        data_content = json.loads(data.get('data', '{}'))
        merchant_trade_no = data_content.get('merchantTradeNo') # Nosso reference_id
        
        # O reference_id tem formato: user_id_item_key_uuid
        # Ex: 15_pack_small_a1b2c3d4
        try:
            parts = merchant_trade_no.split('_')
            user_id = int(parts[0])
            # Reconstrói o item_key (pode ter underscores no meio)
            item_key = "_".join(parts[1:-1]) 
            
            await _fulfill_order(db, user_id, item_key, 'binance', merchant_trade_no)
        except Exception as e:
            logger.error(f"Erro ao processar webhook Binance: {e}")

    return {"returnCode": "SUCCESS", "returnMessage": None}

@router.post("/dlocal-webhook")
async def dlocal_webhook(request: Request, authorization: str = Header(None), db: AsyncSession = Depends(get_db)):
    """
    Webhook do dLocal Go. O corpo é mínimo ({"payment_id": "..."}) e NÃO traz o status —
    consultamos o pagamento p/ obtê-lo (fonte da verdade). Assinatura HMAC-SHA256 no header
    Authorization (V2-HMAC-SHA256, Signature: <hex>).
    """
    raw = await request.body()

    if not dlocal_service.verify_notification(raw, authorization):
        logger.warning("Assinatura inválida no webhook dLocal.")
        raise HTTPException(status_code=400, detail="Assinatura inválida")

    try:
        data = json.loads(raw.decode('utf-8'))
    except Exception:
        data = {}

    payment_id = data.get('payment_id')
    if not payment_id:
        # Possível notificação de assinatura (payload distinto) — VERIFICAR formato no sandbox.
        logger.info(f"[dLocal] Notificação sem payment_id (verificar formato): {data}")
        return {"status": "ignored"}

    try:
        payment = dlocal_service.get_payment(str(payment_id))
    except Exception as e:
        logger.error(f"[dLocal] Falha ao consultar pagamento {payment_id}: {e}")
        raise HTTPException(status_code=500, detail="Erro ao consultar pagamento")

    status_val = (payment.get('status') or '').upper()
    if status_val != 'PAID':
        logger.info(f"[dLocal] Pagamento {payment_id} status={status_val} (sem fulfillment)")
        return {"status": "ok"}

    # order_id carrega nosso reference_id (user_id_item_key_uuid). Em execuções de assinatura
    # a cobrança pode trazer o ref via plano/descrição — VERIFICAR mapeamento no sandbox.
    reference_id = payment.get('order_id') or ''
    if not reference_id:
        logger.warning(f"[dLocal] Pagamento {payment_id} PAID sem order_id (provável assinatura). VERIFICAR mapeamento.")
        return {"status": "ok"}

    try:
        parts = reference_id.split('_')
        user_id = int(parts[0])
        item_key = "_".join(parts[1:-1])
        await _fulfill_order(db, user_id, item_key, 'dlocal', reference_id)
    except Exception as e:
        logger.error(f"[dLocal] Erro no fulfillment {reference_id}: {e}")

    return {"status": "success"}

async def _fulfill_order(db: AsyncSession, user_id: int, item_key: str, provider: str, tx_id: str):
    """
    Lógica central para entregar o produto (Plano ou Dracmas) após pagamento confirmado.
    """
    logger.info(f"[BILLING] Fulfillment iniciado: user_id={user_id}, item={item_key}, provider={provider}, tx_id={tx_id}")

    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()

    if not user:
        logger.warning(f"[BILLING] Fulfillment falhou: user_id={user_id} não encontrado. tx_id={tx_id}, provider={provider}")
        return

    product_data = billing_service.PRICING_TABLE.get(item_key)
    if not product_data:
        return

    # Verifica se já processamos essa transação (Idempotência básica)
    # Para Binance, atualizamos a transação 'pending'. Para Stripe, criamos nova.
    existing_tx = None
    if provider in ('binance', 'dlocal'):
        res = await db.execute(select(Transaction).filter(Transaction.provider_tx_id == tx_id))
        existing_tx = res.scalars().first()
    
    if existing_tx and existing_tx.status == 'completed':
        logger.info(f"Transação {tx_id} já processada.")
        return

    # Entrega do Produto
    if "pack" in item_key:
        # É compra de Dracmas
        dracmas_amount = product_data.get('dracmas', 0)
        user.dracmas = (user.dracmas or 0) + dracmas_amount
        # Credita também no LEDGER (expiração de 365d p/ compras) — o saldo legado
        # (user.dracmas) sozinho não entra no FIFO/expiração. Espelha o padrão dos
        # créditos mensais (que fazem ambos).
        await billing_service.add_dracmas_to_ledger(
            user=user,
            amount=dracmas_amount,
            source='purchase',
            db=db,
            description=f"Compra de {dracmas_amount} dracmas ({provider})",
        )
        desc = f"Compra de {dracmas_amount} Dracmas ({provider})"
    else:
        # É Assinatura
        # Extrai o plano do item_key (ex: resident_monthly -> resident)
        plan_name = item_key.split('_')[0]
        user.subscription_plan = plan_name
        
        # Bônus mensal de Dracmas (se aplicável, adicione lógica aqui)
        # Ex: if plan_name == 'resident': user.dracmas += 5000
        
        desc = f"Assinatura {product_data['name']} ({provider})"

    # Atualiza ou Cria Transação
    if existing_tx:
        existing_tx.status = 'completed'
        existing_tx.description = desc # Atualiza descrição
    else:
        new_tx = Transaction(
            user_id=user.id,
            amount=product_data['amount_usd'],
            currency='USDT' if provider == 'binance' else 'USD',
            provider=provider,
            provider_tx_id=tx_id,
            description=desc,
            status='completed'
        )
        db.add(new_tx)

    await db.commit()
    logger.info(f"Pedido processado com sucesso para User {user.id}: {item_key}")


# --- User Balance Endpoints ---

@router.get("/balance")
async def get_balance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Returns the user's current drachma balance from the ledger system.
    Used by frontend to check if user can afford a feature.
    """
    if current_user.is_admin:
        return {"balance": "infinito"}

    breakdown = await billing_service.get_user_balance_breakdown(current_user, db)
    return {"balance": breakdown["total"]}


@router.get("/balance/breakdown")
async def get_balance_breakdown(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Returns detailed balance breakdown with expiration info for the current user.
    """
    breakdown = await billing_service.get_user_balance_breakdown(current_user, db)
    return breakdown