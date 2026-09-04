# qython/backend/services/xp_service.py
"""
XP (Experience Points) Service — Effort-based ranking system (Duolingo-style).
Users earn XP for completing quizzes. Effort is always rewarded; accuracy gives bonuses.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import (
    UserXpProfile, XpTransaction, QuizAttempt, ArenaSeason,
    SeasonRanking, User, LEAGUE_TIERS
)

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

# Challenge bonuses
CHALLENGE_PARTICIPATION_XP = 20
CHALLENGE_WIN_XP = 30


# =============================================================================
# XP CALCULATION
# =============================================================================

def calculate_xp(
    answers_detail: List[Dict],
    correct_count: int,
    total_questions: int,
    time_elapsed_seconds: Optional[int],
    current_streak: int,
    is_challenge: bool = False,
    challenge_won: bool = False,
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

    # 6. Challenge bonuses
    challenge_bonus = 0
    if is_challenge:
        challenge_bonus = CHALLENGE_PARTICIPATION_XP
        if challenge_won:
            challenge_bonus += CHALLENGE_WIN_XP
    breakdown['challenge_bonus'] = challenge_bonus

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
    challenge_id: Optional[int] = None,
) -> UserXpProfile:
    """
    Award XP to a user. Creates XpTransaction records and updates profile.
    """
    profile = await get_or_create_xp_profile(user_id, db)

    # Get active season for transaction logging
    from .arena_service import get_active_season
    active_season = await get_active_season(db)
    season_id = active_season.id if active_season else None

    total_xp = 0

    for source, amount in xp_breakdown.items():
        if source == 'total' or amount == 0:
            continue

        transaction = XpTransaction(
            user_id=user_id,
            season_id=season_id,
            amount=amount,
            source=source,
            quiz_attempt_id=quiz_attempt_id,
            challenge_id=challenge_id,
        )
        db.add(transaction)
        total_xp += amount

    # Update profile
    profile.total_xp += total_xp
    profile.season_xp += total_xp

    # Ensure season reference is current
    if season_id and profile.season_id != season_id:
        profile.season_id = season_id

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


# =============================================================================
# LEAGUE TIER
# =============================================================================

def get_league_tier(season_xp: int) -> Dict:
    """Determine league tier from season XP. Returns tier dict."""
    tier = LEAGUE_TIERS[0]
    for league in LEAGUE_TIERS:
        if season_xp >= league['min_xp']:
            tier = league
    return tier


def get_next_league_tier(current_tier_name: str) -> Optional[Dict]:
    """Get the next league tier above the current one."""
    for i, tier in enumerate(LEAGUE_TIERS):
        if tier['name'] == current_tier_name:
            if i + 1 < len(LEAGUE_TIERS):
                return LEAGUE_TIERS[i + 1]
            return None
    return LEAGUE_TIERS[1] if LEAGUE_TIERS else None


def get_league_info(profile: UserXpProfile) -> Dict:
    """Build league info dict for API response."""
    current = get_league_tier(profile.season_xp)
    next_tier = get_next_league_tier(current['name'])

    return {
        "tier": current['name'],
        "display": current['display'],
        "icon": current['icon'],
        "season_xp": profile.season_xp,
        "total_xp": profile.total_xp,
        "next_tier": next_tier['display'] if next_tier else None,
        "next_tier_name": next_tier['name'] if next_tier else None,
        "next_tier_icon": next_tier['icon'] if next_tier else None,
        "xp_to_next": (next_tier['min_xp'] - profile.season_xp) if next_tier else 0,
        "next_tier_min_xp": next_tier['min_xp'] if next_tier else 0,
    }


# =============================================================================
# REAL-TIME RANKING UPDATE
# =============================================================================

async def update_user_ranking(
    user_id: int,
    exam_code: str,
    db: AsyncSession,
) -> Optional[Dict]:
    """
    Update a single user's ranking for an exam in the active season.
    Called after quiz submission for real-time ranking feedback.
    Returns ranking info or None.
    """
    from .arena_service import get_active_season

    active_season = await get_active_season(db)
    if not active_season:
        return None

    profile = await get_or_create_xp_profile(user_id, db)

    # Get or create this user's SeasonRanking for this exam
    result = await db.execute(
        select(SeasonRanking).filter(
            and_(
                SeasonRanking.season_id == active_season.id,
                SeasonRanking.user_id == user_id,
                SeasonRanking.exam_code == exam_code
            )
        )
    )
    ranking = result.scalars().first()

    # Aggregate XP from xp_transactions for this season + exam-related quiz attempts
    xp_query = await db.execute(
        select(
            func.coalesce(func.sum(QuizAttempt.xp_earned), 0),
            func.count(QuizAttempt.id),
        ).filter(
            and_(
                QuizAttempt.user_id == user_id,
                QuizAttempt.quiz_specialty == exam_code,
                QuizAttempt.completed_at >= active_season.start_date,
                QuizAttempt.completed_at <= active_season.end_date,
                QuizAttempt.mode != 'practice'
            )
        )
    )
    row = xp_query.first()
    total_xp = row[0] if row else 0
    quiz_count = row[1] if row else 0

    # Also get legacy score sum for backward compat
    score_query = await db.execute(
        select(func.coalesce(func.sum(QuizAttempt.score), 0)).filter(
            and_(
                QuizAttempt.user_id == user_id,
                QuizAttempt.quiz_specialty == exam_code,
                QuizAttempt.completed_at >= active_season.start_date,
                QuizAttempt.completed_at <= active_season.end_date,
                QuizAttempt.mode != 'practice'
            )
        )
    )
    total_score = score_query.scalar() or 0

    tier = get_league_tier(profile.season_xp)

    if ranking:
        ranking.total_xp = total_xp
        ranking.total_score = total_score
        ranking.quizzes_completed = quiz_count
        ranking.league_tier = tier['name']
    else:
        ranking = SeasonRanking(
            season_id=active_season.id,
            user_id=user_id,
            exam_code=exam_code,
            total_xp=total_xp,
            total_score=total_score,
            quizzes_completed=quiz_count,
            league_tier=tier['name'],
        )
        db.add(ranking)

    # Count users with higher XP for rank position
    higher_count = await db.execute(
        select(func.count(SeasonRanking.id)).filter(
            and_(
                SeasonRanking.season_id == active_season.id,
                SeasonRanking.exam_code == exam_code,
                SeasonRanking.total_xp > total_xp,
                SeasonRanking.user_id != user_id,
            )
        )
    )
    rank_position = (higher_count.scalar() or 0) + 1

    # Total participants
    total_count = await db.execute(
        select(func.count(SeasonRanking.id)).filter(
            and_(
                SeasonRanking.season_id == active_season.id,
                SeasonRanking.exam_code == exam_code,
            )
        )
    )
    total_participants = total_count.scalar() or 1

    # Percentile: top X% (lower = better). #1 of 100 = top 1%
    percentile = max(1, int((rank_position / total_participants) * 100))

    ranking.rank_position = rank_position
    ranking.percentile = percentile

    # Update profile with season rank
    profile.season_rank = rank_position
    profile.season_percentile = percentile
    profile.league_tier = tier['name']

    return {
        "rank_position": rank_position,
        "percentile": percentile,
        "total_xp": total_xp,
        "total_participants": total_participants,
    }


# =============================================================================
# SEASON END — PROMOTION / DEMOTION
# =============================================================================

async def process_season_end(db: AsyncSession) -> int:
    """
    Process league promotions/demotions at season end.
    Reset season_xp for all profiles.
    Returns number of profiles processed.
    """
    result = await db.execute(
        select(UserXpProfile).filter(UserXpProfile.season_xp > 0)
    )
    profiles = result.scalars().all()

    count = 0
    for profile in profiles:
        new_tier = get_league_tier(profile.season_xp)
        current_idx = next(
            (i for i, t in enumerate(LEAGUE_TIERS) if t['name'] == profile.league_tier),
            0
        )
        new_idx = next(
            (i for i, t in enumerate(LEAGUE_TIERS) if t['name'] == new_tier['name']),
            0
        )

        if new_idx > current_idx:
            # Promotion
            profile.league_tier = new_tier['name']
            logger.info(f"User {profile.user_id} promoted to {new_tier['name']}")
        elif new_idx < current_idx:
            # Soft demotion: drop at most one tier
            demoted_idx = max(0, current_idx - 1)
            profile.league_tier = LEAGUE_TIERS[demoted_idx]['name']
            logger.info(f"User {profile.user_id} demoted to {LEAGUE_TIERS[demoted_idx]['name']}")

        # Reset season XP
        profile.season_xp = 0
        profile.season_rank = None
        profile.season_percentile = None
        profile.season_id = None
        count += 1

    if count > 0:
        await db.commit()
        logger.info(f"Processed season end for {count} XP profiles")

    return count


# =============================================================================
# MATCHMAKING
# =============================================================================

async def find_random_opponent(
    user: User,
    exam_code: str,
    db: AsyncSession,
) -> Optional[User]:
    """
    Find a random opponent for a challenge.
    Prefers users in the same or adjacent league tier,
    enrolled in the same exam, active in last 7 days.
    """
    profile = await get_or_create_xp_profile(user.id, db)
    current_tier = profile.league_tier

    # Get adjacent tiers
    tier_names = [t['name'] for t in LEAGUE_TIERS]
    current_idx = tier_names.index(current_tier) if current_tier in tier_names else 0
    adjacent_tiers = set()
    for offset in [-1, 0, 1]:
        idx = current_idx + offset
        if 0 <= idx < len(tier_names):
            adjacent_tiers.add(tier_names[idx])

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # Find eligible users: enrolled in exam, active recently, in adjacent tier
    from ..models import user_exam_enrollment, ArenaExam
    query = (
        select(User)
        .join(user_exam_enrollment, User.id == user_exam_enrollment.c.user_id)
        .join(ArenaExam, ArenaExam.id == user_exam_enrollment.c.exam_id)
        .outerjoin(UserXpProfile, UserXpProfile.user_id == User.id)
        .filter(
            and_(
                ArenaExam.exam_code == exam_code,
                User.id != user.id,
                User.status == 'active',
                User.last_login_at >= seven_days_ago,
            )
        )
    )

    # Prefer users in adjacent tiers (but don't require it — fallback to anyone)
    result = await db.execute(
        query.filter(
            UserXpProfile.league_tier.in_(adjacent_tiers)
        ).order_by(func.random()).limit(1)
    )
    opponent = result.scalars().first()

    if not opponent:
        # Fallback: any active enrolled user
        result = await db.execute(
            query.order_by(func.random()).limit(1)
        )
        opponent = result.scalars().first()

    return opponent
