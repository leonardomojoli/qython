# qython/backend/services/achievement_service.py
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from sqlalchemy.future import select
from .achievement_definitions import ACHIEVEMENTS
from ..models import User, Achievement, Consultation, QuizAttempt, ChatSession, UserStats

logger = logging.getLogger("qython_logger")

async def check_and_grant_achievements(user: User, db: AsyncSession) -> list:
    """
    Verifica e concede novas conquistas a um usuário.
    Retorna uma lista com os detalhes das conquistas recém-desbloqueadas.
    """
    
    # Buscar achievements do usuário via query explícita (evita lazy loading em async)
    result = await db.execute(select(Achievement).filter_by(user_id=user.id))
    existing_achievements = result.scalars().all()
    user_achievements = {ach.badge_code for ach in existing_achievements}
    newly_granted = []  # Lista para armazenar conquistas recém-desbloqueadas
    
    # Helper function to count
    async def get_count(model, user_id):
        result = await db.execute(select(func.count()).select_from(model).filter_by(user_id=user_id))
        return result.scalar()

    consult_count = await get_count(Consultation, user.id)
    quiz_count = await get_count(QuizAttempt, user.id)
    chat_count = await get_count(ChatSession, user.id)
    
    # Get total score from UserStats
    result = await db.execute(select(UserStats).filter_by(user_id=user.id))
    user_stats = result.scalars().first()
    total_score = user_stats.total_score if user_stats else 0
    
    # Mapeamento de tipo de verificação para valor
    checks = {
        "CONSULT": consult_count,
        "QUIZ": quiz_count,
        "CHAT": chat_count,
        "SCORE": total_score,
    }

    for code, details in ACHIEVEMENTS.items():
        if code in user_achievements:
            continue

        # Handle ONBOARD specially (verification-based)
        if code == "ONBOARD_1":
            if user.verification_status == 'verified':
                new_achievement = Achievement(user_id=user.id, badge_code=code)
                db.add(new_achievement)
                user_achievements.add(code)
                newly_granted.append({
                    "code": code,
                    "title": details["title"],
                    "description": details["description"],
                    "icon": details["icon"],
                    "tier": details.get("tier", "bronze")
                })
                logger.info(f"Conquista '{code}' concedida ao usuário {user.id}")
            continue

        # Standard threshold-based achievements
        parts = code.split('_')
        if len(parts) != 2:
            continue
            
        check_type = parts[0]
        try:
            threshold = int(parts[1])
        except ValueError:
            continue

        if check_type in checks and checks[check_type] >= threshold:
            new_achievement = Achievement(user_id=user.id, badge_code=code)
            db.add(new_achievement)
            user_achievements.add(code)
            newly_granted.append({
                "code": code,
                "title": details["title"],
                "description": details["description"],
                "icon": details["icon"],
                "tier": details.get("tier", "bronze")
            })
            logger.info(f"Conquista '{code}' concedida ao usuário {user.id}")
    
    await db.commit()
    return newly_granted
