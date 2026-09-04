# qython/backend/services/billing_service.py
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Tuple
from fastapi import HTTPException, status
from ..models import User, Transaction, DracmaLedger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from . import binance_service, dlocal_service
import stripe
from ..config import Config

logger = logging.getLogger("qython_logger")

# --- ECONOMIA DE DRACMAS (SOURCE OF TRUTH) ---
# Taxa base: 1 dracma = $0.01 USD → 100 dracmas = $1,00.
# ⚠️ MUDANÇA (jul/2026): antes 0.0035, que era a linha de CUSTO-alvo por dracma e vinha
# sendo confundida com receita ao dimensionar features (fazia a prova de concurso parecer
# deficitária quando não era). A taxa agora reflete o PREÇO DE VENDA real — é exatamente
# o que os pacotes Starter/Popular praticam ($5/500 e $20/2.000 = $0,01/dracma).
# Como usar: uma feature de N dracmas é sustentável se custar menos que N × 0,01 para
# servir. Ex.: prova de concurso = 100 dracmas ($1,00) contra ~$0,75 de custo medido.
# ⚠️ Ressalvas ao usar isto como receita: (a) pacotes maiores têm desconto de volume e
# saem a $0,00875 (Pro) e $0,0075 (Enterprise) por dracma — no piso, 100 dracmas rendem
# $0,75; (b) dracmas concedidos de graça (250/mês do plano interno, bônus) não têm
# receita atrás. A margem realizada é sempre ≤ a nominal.
# Nenhum fluxo de cobrança usa esta constante: o checkout cobra PRICING_TABLE[].amount_usd.
DRACMA_BASE_RATE = 0.01  # USD por dracma (preço de venda de referência)

# --- POLÍTICA DE EXPIRAÇÃO DE DRACMAS ---
# Dracmas comprados: 12 meses
# Dracmas de plano/bônus: 90 dias (não acumulam, mas têm período de uso)
# Dracmas promocionais: 90 dias
EXPIRATION_DAYS = {
    "purchase": 365,           # 12 meses para compras
    "subscription": 90,        # 90 dias para créditos de plano pago (reset mensal)
    "internal_plan": 90,       # 90 dias para créditos do plano interno
    "student_bonus": 90,       # 90 dias para bônus de estudante
    "registration": 90,        # 90 dias para bônus de registro
    "promo": 90,               # 90 dias para promoções
    "admin": 365,              # 12 meses para créditos de admin
    "migration": 365,          # 12 meses para dracmas migrados (legado)
}

# Descontos por volume (aplicados sobre a taxa base)
VOLUME_DISCOUNTS = {
    "starter": 0.00,      # 0% desconto - taxa cheia
    "popular": 0.20,      # 20% desconto
    "pro": 0.30,          # 30% desconto
    "enterprise": 0.40,   # 40% desconto
}

# --- TABELA DE PREÇOS (SOURCE OF TRUTH) ---
# Mapeia chaves do frontend para IDs do Stripe e Valores em USD
PRICING_TABLE = {
    # Planos Mensais
    "resident_monthly": {"stripe_id": "price_resident_monthly_id", "amount_usd": 9.90, "name": "Plano Residente (Mensal)"},
    "staff_monthly":    {"stripe_id": "price_staff_monthly_id",    "amount_usd": 19.90, "name": "Plano Staff (Mensal)"},
    "specialist_monthly": {"stripe_id": "price_specialist_monthly_id", "amount_usd": 49.90, "name": "Plano Especialista (Mensal)"},

    # Planos Anuais (20% off aplicado no valor base mensal * 12 * 0.8)
    "resident_annual":  {"stripe_id": "price_resident_annual_id",  "amount_usd": 95.04, "name": "Plano Residente (Anual)"},
    "staff_annual":     {"stripe_id": "price_staff_annual_id",     "amount_usd": 191.04, "name": "Plano Staff (Anual)"},
    "specialist_annual": {"stripe_id": "price_specialist_annual_id", "amount_usd": 479.04, "name": "Plano Especialista (Anual)"},

    # Pacotes de Dracmas — taxa efetiva praticada (amount_usd / dracmas):
    # Starter: $5,00 / 500 = $0,0100/dracma (referência, = DRACMA_BASE_RATE)
    # Popular: $20,00 / 2.000 = $0,0100/dracma
    # Pro: $35,00 / 4.000 = $0,00875/dracma (−12,5%, desconto de volume)
    # Enterprise: $75,00 / 10.000 = $0,0075/dracma (−25%, desconto de volume)
    # ⚠️ A margem por feature depende do custo REAL de servi-la (ver [COST] no log),
    # não de uma taxa fixa: o piso de receita é o Enterprise ($0,0075/dracma).
    "pack_starter":    {"stripe_id": "price_dracma_starter_id",    "amount_usd": 5.00,  "name": "500 Dracmas (Starter)", "dracmas": 500, "discount": 0.00},
    "pack_popular":    {"stripe_id": "price_dracma_popular_id",    "amount_usd": 20.00, "name": "2.000 Dracmas (Popular)", "dracmas": 2000, "discount": 0.00},
    "pack_pro":        {"stripe_id": "price_dracma_pro_id",        "amount_usd": 35.00, "name": "4.000 Dracmas (Pro)", "dracmas": 4000, "discount": 0.00},
    "pack_enterprise": {"stripe_id": "price_dracma_enterprise_id", "amount_usd": 75.00, "name": "10.000 Dracmas (Enterprise)", "dracmas": 10000, "discount": 0.00},

    # Aliases para compatibilidade com frontend legado
    "pack_small":  {"stripe_id": "price_dracma_starter_id",  "amount_usd": 5.00,  "name": "500 Dracmas", "dracmas": 500, "discount": 0.00},
    "pack_medium": {"stripe_id": "price_dracma_popular_id",  "amount_usd": 20.00, "name": "2.000 Dracmas", "dracmas": 2000, "discount": 0.00},
    "pack_large":  {"stripe_id": "price_dracma_pro_id",      "amount_usd": 35.00, "name": "4.000 Dracmas", "dracmas": 4000, "discount": 0.00},
}

# Custos de Features
FEATURE_COSTS = {
    # Ambulatório
    "improve_notes": 10,
    "generate_summary": 5,
    "generate_orientation": 5,        # Orientação ao paciente gerada por IA

    # IA Clínica (NOVOS)
    "normalize_clinical_terms": 1,    # Flash-lite, muito leve
    "parse_clinical_history": 5,      # Primary model, complexo
    "extract_icd10": 2,               # Flash-lite, moderado

    # Chat Copilot
    "chat_message": 3,                # Core do produto - texto puro
    "chat_message_with_document": 5,  # Análise de documento(s) sem imagem
    "chat_message_with_image": 8,     # Análise de imagem médica, alto valor
    "generate_chat_title": 1,         # Geração de título de sessão

    # Biblioteca Acadêmica (NOVO)
    "library_rag_chat": 3,            # RAG usa modelo primário
    "generate_study_material": 8,     # Resumos, flashcards, etc.
    # Prova de concurso (Meus Concursos): custo real MUITO acima do material comum —
    # blueprint gera 1 chamada POR BLOCO com o material-fonte em cada uma (medido:
    # 671k tokens de input / $0,206 no lite) e agora roda em modelo forte (3.5-flash),
    # necessário porque o lite erra precisão normativa em Língua Portuguesa.
    "generate_custom_exam": 100,
    "generate_mind_map": 120,         # Mapa mental com imagem (modelo Pro 1K-2K ~$0.134/img)
    "transcribe_audio": 3,            # Transcrição de áudio/vídeo (HF Whisper)

    # Criativos/Pesados (mantidos)
    "generate_avatar": 50,
    "start_quiz": 100,
    "generate_podcast": 200,
    "generate_video_lesson": 500,

    # Pharmacy Module (strategic - free to drive engagement)
    "check_drug_interactions": 0,  # Free — loss leader for pharmacy monetization
    "send_to_pharmacy": 0,         # Free — drives B2B pharmacy revenue

    # Anesthesia Module
    "anesthesia_record_pdf": 3,    # Ficha anestésica PDF (3 dracmas)

    # Patient Info Extraction (strategic — free to maximize data flywheel)
    "extract_patient_updates": 0,  # Free — absorbs cost to drive data flywheel
}


# --- FUNÇÕES UTILITÁRIAS DE CONVERSÃO ---

def dracmas_to_usd(dracmas: float) -> float:
    """Converte dracmas para USD usando a taxa base."""
    return dracmas * DRACMA_BASE_RATE


def usd_to_dracmas(usd: float) -> float:
    """Converte USD para dracmas usando a taxa base."""
    return usd / DRACMA_BASE_RATE


def get_feature_cost_usd(feature_name: str) -> float:
    """Retorna o custo em USD de uma feature."""
    dracmas = FEATURE_COSTS.get(feature_name, 0)
    return dracmas_to_usd(dracmas)


def get_effective_rate(pack_key: str) -> float:
    """Retorna a taxa efetiva (USD/dracma) de um pacote após desconto."""
    pack = PRICING_TABLE.get(pack_key)
    if not pack or "dracmas" not in pack:
        return DRACMA_BASE_RATE
    return pack["amount_usd"] / pack["dracmas"]


async def process_checkout(user: User, item_key: str, provider: str, db: AsyncSession):
    """
    Orquestra a criação do checkout dependendo do provedor.
    item_key: pode ser 'resident_monthly', 'pack_small', etc.
    """
    product_data = PRICING_TABLE.get(item_key)
    if not product_data:
        raise HTTPException(status_code=400, detail="Produto inválido.")

    # Gera um ID de referência único para conciliação
    reference_id = f"{user.id}_{item_key}_{uuid.uuid4().hex[:8]}"

    if provider == 'stripe':
        try:
            mode = 'subscription' if 'monthly' in item_key or 'annual' in item_key else 'payment'
            
            session = stripe.checkout.Session.create(
                client_reference_id=reference_id, # Passamos nosso ref ID
                customer_email=user.email,
                line_items=[{"price": product_data['stripe_id'], "quantity": 1}],
                mode=mode,
                success_url=f"{Config.WEB_BASE_URL}/profile?payment=success",
                cancel_url=f"{Config.WEB_BASE_URL}/pricing?payment=cancelled",
                metadata={"user_id": user.id, "item_key": item_key}
            )
            return {"url": session.url}
        except Exception as e:
            logger.error(f"Erro Stripe: {e}")
            raise HTTPException(status_code=500, detail="Erro ao conectar com Stripe.")

    elif provider == 'binance':
        try:
            # Cria uma transação 'pending' no banco antes de enviar para Binance
            # Isso ajuda a validar o webhook depois
            new_tx = Transaction(
                user_id=user.id,
                amount=product_data['amount_usd'],
                currency='USDT',
                provider='binance',
                provider_tx_id=reference_id, # Usamos nosso ref como ID temporário
                description=f"Pending: {product_data['name']}",
                status='pending'
            )
            db.add(new_tx)
            await db.commit()

            binance_data = binance_service.create_binance_order(
                order_id=reference_id,
                amount=product_data['amount_usd'],
                goods_name=product_data['name']
            )
            
            # Retorna a URL de checkout da Binance
            return {"url": binance_data['checkoutUrl']}
        except Exception as e:
            logger.error(f"Erro Binance: {e}")
            raise HTTPException(status_code=500, detail="Erro ao conectar com Binance Pay.")

    elif provider == 'dlocal':
        try:
            is_subscription = ('monthly' in item_key or 'annual' in item_key)
            notification_url = f"{Config.WEB_BASE_URL}/api/billing/dlocal-webhook"
            success_url = f"{Config.WEB_BASE_URL}/profile?payment=success"
            back_url = f"{Config.WEB_BASE_URL}/pricing?payment=cancelled"
            currency = Config.DLOCAL_CURRENCY
            country = Config.DLOCAL_COUNTRY or None

            # Transação 'pending' (idempotência + conciliação), como no fluxo Binance.
            new_tx = Transaction(
                user_id=user.id,
                amount=product_data['amount_usd'],
                currency=currency,
                provider='dlocal',
                provider_tx_id=reference_id,
                description=f"Pending: {product_data['name']}",
                status='pending'
            )
            db.add(new_tx)
            await db.commit()

            if is_subscription:
                # Assinatura: cria um PLANO por tentativa (o reference_id vai na descrição p/
                # mapear o assinante no webhook) e devolve o subscribe_url (checkout hospedado).
                # ⚠️ VERIFICAR no sandbox: payload da notificação de execução + como casar a
                # cobrança recorrente de volta ao reference_id/usuário.
                freq = 'YEARLY' if 'annual' in item_key else 'MONTHLY'
                plan = dlocal_service.create_plan(
                    name=f"Qython · {product_data['name']}",
                    description=reference_id,
                    amount=product_data['amount_usd'],
                    currency=currency,
                    frequency_type=freq,
                    notification_url=notification_url,
                    success_url=success_url,
                    back_url=back_url,
                    country=country,
                )
                return {"url": plan['subscribe_url']}

            # Compra avulsa (pacote de dracmas): pagamento único → redirect_url.
            payer = {"email": user.email, "name": user.full_name} if user.email else None
            payment = dlocal_service.create_payment(
                amount=product_data['amount_usd'],
                currency=currency,
                order_id=reference_id,
                description=product_data['name'],
                notification_url=notification_url,
                success_url=success_url,
                back_url=back_url,
                country=country,
                payer=payer,
            )
            return {"url": payment['redirect_url']}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Erro dLocal: {e}")
            raise HTTPException(status_code=500, detail="Erro ao conectar com dLocal.")

    else:
        raise HTTPException(status_code=400, detail="Provedor de pagamento inválido.")

async def debit_dracmas_for_feature(user: User, feature_name: str, db: AsyncSession):
    """
    Debita dracmas do usuário para usar uma feature.
    Usa FIFO (First In, First Out) - dracmas mais antigos são consumidos primeiro.
    Raises HTTPException 402 se saldo insuficiente.
    Admins são isentos de cobrança.
    """
    cost = FEATURE_COSTS.get(feature_name)
    if cost is None:
        logger.warning(f"Feature desconhecida para cobrança: {feature_name}")
        return  # Não cobrar se feature não tem custo definido

    # ADMIN BYPASS: Admins não pagam dracmas
    if user.is_admin:
        logger.info(f"[ADMIN] {user.email} usou {feature_name} (custo: {cost} dracmas) - ISENTO")
        return

    # Verificar se usuário tem entradas no ledger
    result = await db.execute(
        select(DracmaLedger)
        .where(
            and_(
                DracmaLedger.user_id == user.id,
                DracmaLedger.status == 'active',
                DracmaLedger.remaining > 0
            )
        )
        .limit(1)
    )
    has_ledger = result.scalar_one_or_none() is not None

    if has_ledger:
        # Usar sistema de ledger com FIFO
        await consume_dracmas_fifo(user, cost, feature_name, db)
    else:
        # Fallback para sistema legado (usuários não migrados)
        current_balance = user.dracmas or 0

        if current_balance < cost:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Saldo insuficiente. Esta ação custa {cost} dracmas e você tem {current_balance}."
            )

        # Debitar do saldo legado
        user.dracmas = current_balance - cost
        logger.info(f"[LEGADO] Debitado {cost} dracmas de {user.email} para {feature_name}. Saldo: {user.dracmas}")

    # Registrar transação (sempre, para histórico)
    new_tx = Transaction(
        user_id=user.id,
        amount=-cost,
        currency='DRACMAS',
        provider='internal',
        provider_tx_id=f"debit_{feature_name}_{uuid.uuid4().hex[:8]}",
        description=f"Uso de feature: {feature_name}",
        status='completed'
    )
    db.add(new_tx)

    # Commit será feito pelo caller ou ao final da request


async def check_and_credit_monthly_internal_plan(user: User, db: AsyncSession) -> bool:
    """
    Credita 250 dracmas mensais para usuários do plano gratuito (interno/free).
    Retorna True se creditou, False caso contrário.
    Chamado em endpoints frequentes (dashboard, /user/me, etc.)
    """
    from datetime import datetime, timezone

    # Apenas usuários ativos no plano gratuito. Aceita 'interno' (gravado no
    # cadastro) e 'free' (default antigo do modelo + backfill da migration
    # c027e92508fc). O resto do sistema já trata os dois como sinônimos por
    # fallback; só este check exigia 'interno', então contas em 'free' nunca
    # recebiam o crédito mensal.
    if user.subscription_plan not in ('interno', 'free') or user.status != 'active':
        return False

    now = datetime.now(timezone.utc)

    # Se nunca recebeu crédito mensal (usuário novo), marcar data inicial
    if user.last_monthly_credit_date is None:
        user.last_monthly_credit_date = now
        await db.commit()
        return False

    days_since_last = (now - user.last_monthly_credit_date).days

    if days_since_last >= 30:
        user.dracmas = (user.dracmas or 0) + 250.0
        user.last_monthly_credit_date = now

        # Registrar transação
        new_tx = Transaction(
            user_id=user.id,
            amount=250.0,
            currency='DRACMAS',
            provider='internal',
            provider_tx_id=f"monthly_internal_{uuid.uuid4().hex[:8]}",
            description="Crédito mensal do plano interno",
            status='completed'
        )
        db.add(new_tx)

        # Adicionar ao ledger com expiração
        await add_dracmas_to_ledger(
            user=user,
            amount=250.0,
            source="internal_plan",
            db=db,
            description="Crédito mensal do plano interno"
        )

        await db.commit()
        logger.info(f"Crédito mensal de 250 dracmas (plano interno) para {user.email}. Novo saldo: {user.dracmas}")
        return True

    return False


async def check_and_credit_monthly_student_bonus(user: User, db: AsyncSession) -> bool:
    """
    Verifica se o estudante é elegível para bônus mensal e credita se for.
    Aplica-se a TODOS os estudantes, independente do plano.
    Retorna True se creditou, False caso contrário.
    Chamado em endpoints frequentes (dashboard, /user/me, etc.)
    """
    from datetime import datetime, timezone

    # Apenas estudantes de medicina ativos (qualquer plano)
    if user.occupation != 'Estudante de Medicina' or user.status != 'active':
        return False
    
    now = datetime.now(timezone.utc)
    
    # Se nunca recebeu bônus (usuário novo), marcar data inicial
    if user.last_student_bonus_date is None:
        user.last_student_bonus_date = now
        await db.commit()
        return False
    
    days_since_last = (now - user.last_student_bonus_date).days
    
    if days_since_last >= 30:
        user.dracmas = (user.dracmas or 0) + 250.0
        user.last_student_bonus_date = now

        # Registrar transação do bônus
        new_tx = Transaction(
            user_id=user.id,
            amount=250.0,
            currency='DRACMAS',
            provider='internal',
            provider_tx_id=f"student_bonus_{uuid.uuid4().hex[:8]}",
            description="Bônus mensal de estudante de medicina",
            status='completed'
        )
        db.add(new_tx)

        # Adicionar ao ledger com expiração
        await add_dracmas_to_ledger(
            user=user,
            amount=250.0,
            source="student_bonus",
            db=db,
            description="Bônus mensal de estudante de medicina",
            transaction_id=None  # Transaction ID será adicionado após commit
        )

        await db.commit()
        logger.info(f"Bônus mensal de 250 dracmas creditado para {user.email}. Novo saldo: {user.dracmas}")
        return True

    return False


# =============================================================================
# DRACMA LEDGER FUNCTIONS - Sistema de Expiração
# =============================================================================

async def add_dracmas_to_ledger(
    user: User,
    amount: float,
    source: str,
    db: AsyncSession,
    description: str = None,
    transaction_id: int = None,
    custom_expiration_days: int = None
) -> DracmaLedger:
    """
    Adiciona dracmas ao ledger do usuário com data de expiração.

    Args:
        user: Usuário que receberá os dracmas
        amount: Quantidade de dracmas
        source: Fonte ('purchase', 'subscription', 'internal_plan', 'student_bonus', 'registration', 'promo', 'admin', 'migration')
        db: Sessão do banco de dados
        description: Descrição opcional
        transaction_id: ID da transação relacionada (se houver)
        custom_expiration_days: Dias customizados para expiração (override padrão)

    Returns:
        DracmaLedger: Entrada criada no ledger
    """
    now = datetime.now(timezone.utc)

    # Determinar dias de expiração
    expiration_days = custom_expiration_days or EXPIRATION_DAYS.get(source, 365)
    expires_at = now + timedelta(days=expiration_days)

    # Criar entrada no ledger
    ledger_entry = DracmaLedger(
        user_id=user.id,
        amount=amount,
        remaining=amount,
        source=source,
        transaction_id=transaction_id,
        acquired_at=now,
        expires_at=expires_at,
        status='active',
        description=description
    )

    db.add(ledger_entry)

    logger.info(
        f"[LEDGER] Adicionado {amount} dracmas para {user.email} "
        f"(source={source}, expires={expires_at.strftime('%Y-%m-%d')})"
    )

    return ledger_entry


async def consume_dracmas_fifo(
    user: User,
    amount: float,
    feature_name: str,
    db: AsyncSession
) -> List[Dict]:
    """
    Consome dracmas usando FIFO (First In, First Out).
    Dracmas mais antigos (próximos de expirar) são consumidos primeiro.

    Args:
        user: Usuário
        amount: Quantidade a consumir
        feature_name: Nome da feature (para logging)
        db: Sessão do banco

    Returns:
        Lista de dicts com detalhes do consumo por lote

    Raises:
        HTTPException 402 se saldo insuficiente
    """
    # Buscar lotes ativos ordenados por data de expiração (mais antigos primeiro)
    result = await db.execute(
        select(DracmaLedger)
        .where(
            and_(
                DracmaLedger.user_id == user.id,
                DracmaLedger.status == 'active',
                DracmaLedger.remaining > 0,
                DracmaLedger.expires_at > datetime.now(timezone.utc)  # Não expirados
            )
        )
        .order_by(DracmaLedger.expires_at.asc())  # FIFO por data de expiração
    )
    active_batches = result.scalars().all()

    # Calcular saldo total disponível
    total_available = sum(batch.remaining for batch in active_batches)

    if total_available < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Saldo insuficiente. Esta ação custa {amount} dracmas e você tem {total_available:.0f}."
        )

    # Consumir usando FIFO
    remaining_to_consume = amount
    consumption_details = []

    for batch in active_batches:
        if remaining_to_consume <= 0:
            break

        consume_from_batch = min(batch.remaining, remaining_to_consume)
        batch.remaining -= consume_from_batch
        remaining_to_consume -= consume_from_batch

        consumption_details.append({
            "ledger_id": batch.id,
            "source": batch.source,
            "consumed": consume_from_batch,
            "remaining_in_batch": batch.remaining,
            "expires_at": batch.expires_at.isoformat()
        })

        # Marcar lote como consumido se zerou
        if batch.remaining <= 0:
            batch.status = 'consumed'
            batch.consumed_at = datetime.now(timezone.utc)

    # Atualizar saldo do usuário (manter sincronizado)
    user.dracmas = total_available - amount

    logger.info(
        f"[LEDGER] Consumido {amount} dracmas de {user.email} para {feature_name}. "
        f"Saldo: {user.dracmas:.0f}. Lotes: {len(consumption_details)}"
    )

    return consumption_details


async def get_user_balance_breakdown(user: User, db: AsyncSession) -> Dict:
    """
    Retorna o saldo do usuário com breakdown por fonte e expiração.

    Returns:
        Dict com:
        - total: saldo total disponível
        - expiring_soon: dracmas que expiram em 30 dias
        - by_source: breakdown por fonte
        - next_expiration: data da próxima expiração (se houver)
        - batches: lista de lotes ativos
    """
    now = datetime.now(timezone.utc)
    thirty_days = now + timedelta(days=30)

    # Buscar lotes ativos
    result = await db.execute(
        select(DracmaLedger)
        .where(
            and_(
                DracmaLedger.user_id == user.id,
                DracmaLedger.status == 'active',
                DracmaLedger.remaining > 0,
                DracmaLedger.expires_at > now
            )
        )
        .order_by(DracmaLedger.expires_at.asc())
    )
    active_batches = result.scalars().all()

    # Calcular totais
    total = sum(batch.remaining for batch in active_batches)
    expiring_soon = sum(
        batch.remaining for batch in active_batches
        if batch.expires_at <= thirty_days
    )

    # Breakdown por fonte
    by_source = {}
    for batch in active_batches:
        if batch.source not in by_source:
            by_source[batch.source] = 0
        by_source[batch.source] += batch.remaining

    # Próxima expiração
    next_expiration = None
    next_expiration_amount = 0
    if active_batches:
        next_batch = active_batches[0]  # Já está ordenado por expires_at
        next_expiration = next_batch.expires_at.isoformat()
        next_expiration_amount = next_batch.remaining

    # Lista de lotes para frontend
    batches = [
        {
            "id": batch.id,
            "amount": batch.remaining,
            "source": batch.source,
            "acquired_at": batch.acquired_at.isoformat(),
            "expires_at": batch.expires_at.isoformat(),
            "days_until_expiration": (batch.expires_at - now).days
        }
        for batch in active_batches
    ]

    return {
        "total": total,
        "expiring_soon": expiring_soon,
        "expiring_soon_days": 30,
        "by_source": by_source,
        "next_expiration": next_expiration,
        "next_expiration_amount": next_expiration_amount,
        "batches": batches
    }


async def process_expired_dracmas(db: AsyncSession) -> Tuple[int, float]:
    """
    Processa dracmas expirados, marcando-os como 'expired'.
    Deve ser chamado por um job agendado (cron/celery).

    Returns:
        Tuple[int, float]: (número de lotes expirados, total de dracmas expirados)
    """
    now = datetime.now(timezone.utc)

    # Buscar lotes expirados ainda ativos
    result = await db.execute(
        select(DracmaLedger)
        .where(
            and_(
                DracmaLedger.status == 'active',
                DracmaLedger.expires_at <= now,
                DracmaLedger.remaining > 0
            )
        )
    )
    expired_batches = result.scalars().all()

    total_expired = 0
    user_updates = {}  # user_id -> total to subtract

    for batch in expired_batches:
        total_expired += batch.remaining

        # Acumular por usuário
        if batch.user_id not in user_updates:
            user_updates[batch.user_id] = 0
        user_updates[batch.user_id] += batch.remaining

        # Marcar como expirado
        batch.status = 'expired'

        logger.info(
            f"[LEDGER] Expirado lote {batch.id}: {batch.remaining} dracmas "
            f"(user_id={batch.user_id}, source={batch.source})"
        )

    # Atualizar saldo dos usuários afetados
    for user_id, amount_to_subtract in user_updates.items():
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user:
            old_balance = user.dracmas or 0
            user.dracmas = max(0, old_balance - amount_to_subtract)
            logger.info(
                f"[LEDGER] Saldo atualizado para user_id={user_id}: "
                f"{old_balance:.0f} -> {user.dracmas:.0f} (expirado: {amount_to_subtract:.0f})"
            )

    await db.commit()

    logger.info(f"[LEDGER] Processamento de expiração: {len(expired_batches)} lotes, {total_expired:.0f} dracmas")

    return len(expired_batches), total_expired


async def get_expiring_soon_notifications(db: AsyncSession, days: int = 30) -> List[Dict]:
    """
    Busca usuários com dracmas prestes a expirar para notificação.

    Args:
        db: Sessão do banco
        days: Dias até expiração (padrão: 30)

    Returns:
        Lista de dicts com user_id, email, amount_expiring, expires_at
    """
    now = datetime.now(timezone.utc)
    threshold = now + timedelta(days=days)

    # Determinar flag de notificação baseado nos dias
    if days == 30:
        notified_flag = DracmaLedger.expiration_notified_30d
    elif days == 7:
        notified_flag = DracmaLedger.expiration_notified_7d
    elif days == 1:
        notified_flag = DracmaLedger.expiration_notified_1d
    else:
        notified_flag = DracmaLedger.expiration_notified_30d

    # Buscar lotes que expiram no período e ainda não foram notificados
    result = await db.execute(
        select(DracmaLedger, User)
        .join(User, DracmaLedger.user_id == User.id)
        .where(
            and_(
                DracmaLedger.status == 'active',
                DracmaLedger.remaining > 0,
                DracmaLedger.expires_at <= threshold,
                DracmaLedger.expires_at > now,
                notified_flag == False
            )
        )
        .order_by(DracmaLedger.user_id, DracmaLedger.expires_at)
    )

    rows = result.all()

    # Agrupar por usuário
    user_notifications = {}
    for ledger, user in rows:
        if user.id not in user_notifications:
            user_notifications[user.id] = {
                "user_id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "language": user.language_preference or 'pt-BR',
                "batches": [],
                "total_expiring": 0
            }

        user_notifications[user.id]["batches"].append({
            "ledger_id": ledger.id,
            "amount": ledger.remaining,
            "expires_at": ledger.expires_at,
            "source": ledger.source
        })
        user_notifications[user.id]["total_expiring"] += ledger.remaining

    return list(user_notifications.values())


async def mark_notification_sent(ledger_ids: List[int], days: int, db: AsyncSession):
    """
    Marca os lotes como notificados para o período especificado.
    """
    result = await db.execute(
        select(DracmaLedger).where(DracmaLedger.id.in_(ledger_ids))
    )
    batches = result.scalars().all()

    for batch in batches:
        if days == 30:
            batch.expiration_notified_30d = True
        elif days == 7:
            batch.expiration_notified_7d = True
        elif days == 1:
            batch.expiration_notified_1d = True

    await db.commit()


async def migrate_user_dracmas_to_ledger(user: User, db: AsyncSession) -> DracmaLedger:
    """
    Migra o saldo atual do usuário para o ledger (para usuários existentes).
    Deve ser chamado uma única vez por usuário.

    Args:
        user: Usuário a migrar
        db: Sessão do banco

    Returns:
        DracmaLedger entry criada (ou None se saldo zero)
    """
    current_balance = user.dracmas or 0

    if current_balance <= 0:
        return None

    # Verificar se já foi migrado
    result = await db.execute(
        select(DracmaLedger)
        .where(
            and_(
                DracmaLedger.user_id == user.id,
                DracmaLedger.source == 'migration'
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        logger.info(f"[LEDGER] Usuário {user.email} já foi migrado anteriormente")
        return existing

    # Criar entrada de migração
    ledger_entry = await add_dracmas_to_ledger(
        user=user,
        amount=current_balance,
        source='migration',
        db=db,
        description=f"Migração de saldo legado: {current_balance:.0f} dracmas"
    )

    logger.info(f"[LEDGER] Migrado {current_balance:.0f} dracmas de {user.email} para ledger")

    return ledger_entry


async def sync_user_balance_from_ledger(user: User, db: AsyncSession) -> float:
    """
    Sincroniza o saldo do usuário com o total do ledger ativo.
    Útil para correções e verificações.

    Returns:
        Novo saldo calculado
    """
    breakdown = await get_user_balance_breakdown(user, db)
    old_balance = user.dracmas or 0
    new_balance = breakdown["total"]

    if abs(old_balance - new_balance) > 0.01:  # Tolerância para float
        user.dracmas = new_balance
        logger.warning(
            f"[LEDGER] Sincronizado saldo de {user.email}: "
            f"{old_balance:.0f} -> {new_balance:.0f}"
        )

    return new_balance