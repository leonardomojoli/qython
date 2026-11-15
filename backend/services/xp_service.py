# qython/backend/services/xp_service.py
"""
XP (Experience Points) Service — esforço sempre conta (estilo Duolingo).
Quem termina um simulado ganha XP; a precisão dá bônus. Há também a sequência de dias seguidos.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import UserXpProfile, XpTransaction

logger = logging.getLogger("qython_logger")

# =============================================================================
# XP CONSTANTS
# =============================================================================

# Base XP for completing any quiz (always awarded, even 0/10)
BASE_QUIZ_XP = 50

# Per-question XP for correct answers, by difficulty
DIFFICULTY_XP = {
    'facil': 2,
    'medio': 4,
    'dificil': 8,
}
DEFAULT_DIFFICULTY_XP = 4

# Accuracy bonus tiers (percentage range → bonus XP)
ACCURACY_BONUS_TIERS = [
    (90, 100, 30),
    (80, 89, 20),
    (70, 79, 10),
    (60, 69, 5),
]

# Streak bonus (days → extra XP)
STREAK_BONUS_TIERS = [
    (30, 100),
    (14, 50),
    (7, 25),
    (3, 10),
]

# Speed bonus: finish in < 50% of time with >= 70% accuracy
SPEED_BONUS_XP = 15
QUIZ_TOTAL_TIME = 4 * 60 * 60  # 4 hours in seconds


# =============================================================================
# XP CALCULATION
# =============================================================================

def calculate_xp(
    answers_detail: List[Dict],
    correct_count: int,
    total_questions: int,
    time_elapsed_seconds: Optional[int],
    current_streak: int,
) -> Dict[str, int]:
    """
    Calculate XP breakdown for a quiz completion.
    Returns dict with each XP source and total.
    """
    breakdown = {}

    # 1. Base XP — always awarded
    breakdown['quiz_base'] = BASE_QUIZ_XP

    # 2. Difficulty bonus — per correct answer by difficulty
    difficulty_xp = 0
    for answer in answers_detail:
        if answer.get('is_correct'):
            diff = answer.get('difficulty', 'medio')
            difficulty_xp += DIFFICULTY_XP.get(diff, DEFAULT_DIFFICULTY_XP)
    breakdown['difficulty_bonus'] = difficulty_xp

    # 3. Accuracy bonus
    accuracy_pct = (correct_count / total_questions * 100) if total_questions > 0 else 0
    accuracy_bonus = 0
    for min_pct, max_pct, bonus in ACCURACY_BONUS_TIERS:
        if min_pct <= accuracy_pct <= max_pct:
            accuracy_bonus = bonus
            break
    breakdown['accuracy_bonus'] = accuracy_bonus

    # 4. Streak bonus (highest applicable tier)
    streak_bonus = 0
    for threshold, bonus in STREAK_BONUS_TIERS:
        if current_streak >= threshold:
            streak_bonus = bonus
            break
    breakdown['streak_bonus'] = streak_bonus

    # 5. Speed bonus
    speed_bonus = 0
    if (time_elapsed_seconds
            and time_elapsed_seconds < QUIZ_TOTAL_TIME * 0.5
            and accuracy_pct >= 70):
        speed_bonus = SPEED_BONUS_XP
    breakdown['speed_bonus'] = speed_bonus

    breakdown['total'] = sum(breakdown.values())
    return breakdown


# =============================================================================
# XP PERSISTENCE
# =============================================================================

async def get_or_create_xp_profile(user_id: int, db: AsyncSession) -> UserXpProfile:
    """Get user's XP profile, creating one if it doesn't exist."""
    result = await db.execute(
        select(UserXpProfile).filter(UserXpProfile.user_id == user_id)
    )
    profile = result.scalars().first()
    if not profile:
        profile = UserXpProfile(user_id=user_id)
        db.add(profile)
        await db.flush()
    return profile


async def award_xp(
    user_id: int,
    xp_breakdown: Dict[str, int],
    db: AsyncSession,
    quiz_attempt_id: Optional[int] = None,
) -> UserXpProfile:
    """
    Award XP to a user. Creates XpTransaction records and updates profile.
    """
    profile = await get_or_create_xp_profile(user_id, db)

    total_xp = 0

    for source, amount in xp_breakdown.items():
        if source == 'total' or amount == 0:
            continue

        transaction = XpTransaction(
            user_id=user_id,
            amount=amount,
            source=source,
            quiz_attempt_id=quiz_attempt_id,
        )
        db.add(transaction)
        total_xp += amount

    # Update profile
    profile.total_xp += total_xp

    return profile


# =============================================================================
# STREAK MANAGEMENT
# =============================================================================

async def update_streak(user_id: int, db: AsyncSession) -> Dict:
    """
    Update user's streak based on daily activity.
    Returns streak info dict.
    """
    profile = await get_or_create_xp_profile(user_id, db)
    now = datetime.now(timezone.utc)
    today = now.date()

    old_streak = profile.current_streak

    if profile.last_activity_date:
        last_date = profile.last_activity_date.date()
        days_diff = (today - last_date).days

        if days_diff == 0:
            # Same day — no streak change
            pass
        elif days_diff == 1:
            # Consecutive day — increment streak
            profile.current_streak += 1
        else:
            # Gap — reset streak
            profile.current_streak = 1
    else:
        # First ever activity
        profile.current_streak = 1

    profile.last_activity_date = now

    is_new_record = False
    if profile.current_streak > profile.longest_streak:
        profile.longest_streak = profile.current_streak
        is_new_record = True

    return {
        "current": profile.current_streak,
        "longest": profile.longest_streak,
        "is_new_record": is_new_record,
        "previous": old_streak,
    }
