# qython/backend/services/academic_services/ranking_service.py
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_
from datetime import datetime, timedelta, timezone
from ...models import User, QuizAttempt, Transaction

logger = logging.getLogger("qython_logger")
DECAY_PERCENTAGE = 0.05  # 5% de decaimento

async def apply_weekly_score_decay(db: AsyncSession):
    """
    Aplica um decaimento de pontuação para usuários inativos nos rankings da Arena.
    Esta função deve ser chamada por um agendador (ex: diariamente).
    """
    logger.info("Iniciando tarefa de decaimento de pontuação semanal...")
    
    one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # Subquery para encontrar a data da última tentativa de cada usuário em cada modo (exame)
    last_attempt_subquery = select(
        QuizAttempt.user_id,
        QuizAttempt.mode,
        func.max(QuizAttempt.completed_at).label('last_completed_at')
    ).group_by(QuizAttempt.user_id, QuizAttempt.mode).subquery()

    # Encontra usuários cuja última tentativa em um modo específico foi há mais de uma semana
    query = select(
        User,
        last_attempt_subquery.c.mode
    ).join(
        last_attempt_subquery, User.id == last_attempt_subquery.c.user_id
    ).filter(
        last_attempt_subquery.c.last_completed_at < one_week_ago
    )
    
    result = await db.execute(query)
    inactive_players = result.all()

    decayed_count = 0
    for user, exam_mode in inactive_players:
        # Calcula a pontuação total do usuário para aquele exame específico
        current_score_query = select(func.sum(QuizAttempt.score)).filter(
            QuizAttempt.user_id == user.id,
            QuizAttempt.mode == exam_mode
        )
        result = await db.execute(current_score_query)
        current_score = result.scalar() or 0

        if current_score > 0:
            decay_amount = round(current_score * DECAY_PERCENTAGE)
            
            # Adiciona uma "tentativa" negativa para registrar o decaimento
            decay_attempt = QuizAttempt(
                user_id=user.id,
                quiz_specialty="Decay",
                score=-decay_amount,
                mode=exam_mode,
                completed_at=datetime.now(timezone.utc)
            )
            db.add(decay_attempt)
            decayed_count += 1
            logger.info(f"Aplicando decaimento de {-decay_amount} pontos para o usuário {user.id} no exame {exam_mode}.")

    if decayed_count > 0:
        await db.commit()
    
    logger.info(f"Tarefa de decaimento de pontuação concluída. {decayed_count} jogadores foram afetados.")
