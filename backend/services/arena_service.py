# qython/backend/services/arena_service.py
"""
Arena Season Management Service
Handles bimonthly seasons, XP-based ranking calculations, and scheduled updates.
Uses APScheduler for internal task scheduling (no external cron needed).
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import ArenaSeason, SeasonRanking, QuizAttempt, User, UserXpProfile, LEAGUE_TIERS

logger = logging.getLogger("qython_logger")

# Bimonthly seasons configuration for 2026
SEASONS_2026 = [
    {"name": "Jan-Fev 2026", "start": datetime(2026, 1, 1), "end": datetime(2026, 2, 28, 23, 59, 59)},
    {"name": "Mar-Abr 2026", "start": datetime(2026, 3, 1), "end": datetime(2026, 4, 30, 23, 59, 59)},
    {"name": "Mai-Jun 2026", "start": datetime(2026, 5, 1), "end": datetime(2026, 6, 30, 23, 59, 59)},
    {"name": "Jul-Ago 2026", "start": datetime(2026, 7, 1), "end": datetime(2026, 8, 31, 23, 59, 59)},
    {"name": "Set-Out 2026", "start": datetime(2026, 9, 1), "end": datetime(2026, 10, 31, 23, 59, 59)},
    {"name": "Nov-Dez 2026", "start": datetime(2026, 11, 1), "end": datetime(2026, 12, 31, 23, 59, 59)},
]


async def get_active_season(db: AsyncSession) -> Optional[ArenaSeason]:
    """Get the currently active season"""
    result = await db.execute(
        select(ArenaSeason).filter(ArenaSeason.is_active == True)
    )
    return result.scalars().first()


async def get_current_or_upcoming_season(db: AsyncSession) -> Optional[ArenaSeason]:
    """Get the current active season or the next upcoming one"""
    now = datetime.now(timezone.utc)

    # First try to get active season
    active = await get_active_season(db)
    if active:
        return active

    # Otherwise get the next upcoming season
    result = await db.execute(
        select(ArenaSeason)
        .filter(ArenaSeason.start_date > now)
        .order_by(ArenaSeason.start_date)
        .limit(1)
    )
    return result.scalars().first()


async def activate_current_season(db: AsyncSession) -> Optional[ArenaSeason]:
    """
    Check if we should activate a new season based on current date.
    Deactivates old season (with promotion/demotion) and activates new one.
    Called by the scheduler.
    """
    now = datetime.now(timezone.utc)

    # Deactivate any season that has ended
    result = await db.execute(
        select(ArenaSeason).filter(
            and_(
                ArenaSeason.is_active == True,
                ArenaSeason.end_date < now
            )
        )
    )
    expired_season = result.scalars().first()
    if expired_season:
        expired_season.is_active = False
        logger.info(f"Season ended: {expired_season.name}")

        # Process promotions/demotions at season end
        try:
            from .xp_service import process_season_end
            count = await process_season_end(db)
            logger.info(f"Season end promotions processed: {count} profiles")
        except Exception as e:
            logger.error(f"Error processing season end promotions: {e}", exc_info=True)

    # Activate the current season if not already active
    result = await db.execute(
        select(ArenaSeason).filter(
            and_(
                ArenaSeason.start_date <= now,
                ArenaSeason.end_date >= now,
                ArenaSeason.is_active == False
            )
        )
    )
    new_season = result.scalars().first()
    if new_season:
        new_season.is_active = True
        logger.info(f"Season activated: {new_season.name}")
        await db.commit()
        return new_season

    if expired_season:
        await db.commit()

    return await get_active_season(db)


async def update_season_rankings(db: AsyncSession) -> int:
    """
    Recalculate rankings for the active season (XP-based).
    Aggregates XP from quiz attempts and updates rank positions.
    Called daily at 3AM as a consistency pass (real-time updates happen on quiz submit).
    Returns number of rankings updated.
    """
    active_season = await get_active_season(db)
    if not active_season:
        logger.info("No active season to update rankings for.")
        return 0

    logger.info(f"Updating XP-based rankings for season: {active_season.name}")

    # Get distinct exam codes from attempts within this season
    exam_query = await db.execute(
        select(QuizAttempt.quiz_specialty.distinct()).filter(
            and_(
                QuizAttempt.completed_at >= active_season.start_date,
                QuizAttempt.completed_at <= active_season.end_date,
                QuizAttempt.mode != 'practice'
            )
        )
    )
    exam_codes = [row[0] for row in exam_query.fetchall()]

    updated_count = 0

    for exam_code in exam_codes:
        # Aggregate XP per user for this exam in this season
        scores_query = await db.execute(
            select(
                QuizAttempt.user_id,
                func.coalesce(func.sum(QuizAttempt.xp_earned), 0).label('total_xp'),
                func.coalesce(func.sum(QuizAttempt.score), 0).label('total_score'),
                func.count(QuizAttempt.id).label('quiz_count')
            ).filter(
                and_(
                    QuizAttempt.quiz_specialty == exam_code,
                    QuizAttempt.completed_at >= active_season.start_date,
                    QuizAttempt.completed_at <= active_season.end_date,
                    QuizAttempt.mode != 'practice'
                )
            ).group_by(QuizAttempt.user_id)
            .order_by(func.coalesce(func.sum(QuizAttempt.xp_earned), 0).desc())
        )

        user_scores = scores_query.fetchall()
        total_participants = len(user_scores)

        for rank, row in enumerate(user_scores, 1):
            user_id = row.user_id
            total_xp = row.total_xp
            total_score = row.total_score
            quiz_count = row.quiz_count

            # Percentile
            percentile = max(1, int((rank / total_participants) * 100)) if total_participants > 0 else 100

            # Get user's league tier from their XP profile
            profile_result = await db.execute(
                select(UserXpProfile).filter(UserXpProfile.user_id == user_id)
            )
            profile = profile_result.scalars().first()
            tier = profile.league_tier if profile else 'bronze'

            # Upsert ranking
            existing = await db.execute(
                select(SeasonRanking).filter(
                    and_(
                        SeasonRanking.season_id == active_season.id,
                        SeasonRanking.user_id == user_id,
                        SeasonRanking.exam_code == exam_code
                    )
                )
            )
            ranking = existing.scalars().first()

            if ranking:
                ranking.total_xp = total_xp
                ranking.total_score = total_score
                ranking.quizzes_completed = quiz_count
                ranking.rank_position = rank
                ranking.percentile = percentile
                ranking.league_tier = tier
            else:
                ranking = SeasonRanking(
                    season_id=active_season.id,
                    user_id=user_id,
                    exam_code=exam_code,
                    total_xp=total_xp,
                    total_score=total_score,
                    quizzes_completed=quiz_count,
                    rank_position=rank,
                    percentile=percentile,
                    league_tier=tier,
                )
                db.add(ranking)

            updated_count += 1

    await db.commit()
    logger.info(f"Updated {updated_count} XP-based rankings for season {active_season.name}")
    return updated_count


async def get_user_season_stats(
    user_id: int,
    exam_code: str,
    db: AsyncSession
) -> Optional[Dict]:
    """Get a user's ranking stats for the current season (XP-based)"""
    active_season = await get_active_season(db)
    if not active_season:
        return None

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

    if not ranking:
        return None

    # Get total participants for this exam
    total_result = await db.execute(
        select(func.count(SeasonRanking.id)).filter(
            and_(
                SeasonRanking.season_id == active_season.id,
                SeasonRanking.exam_code == exam_code
            )
        )
    )
    total_participants = total_result.scalar() or 0

    # Get user XP profile for league info
    from .xp_service import get_or_create_xp_profile, get_league_info
    profile = await get_or_create_xp_profile(user_id, db)

    return {
        "season_name": active_season.name,
        "rank_position": ranking.rank_position,
        "total_xp": ranking.total_xp,
        "total_score": ranking.total_score,
        "quizzes_completed": ranking.quizzes_completed,
        "percentile": ranking.percentile,
        "total_participants": total_participants,
        "season_ends": active_season.end_date.isoformat(),
        "league": get_league_info(profile),
    }


async def seed_seasons(db: AsyncSession) -> int:
    """Seed bimonthly seasons for 2026. Safe to run multiple times."""
    existing = await db.execute(select(ArenaSeason))
    existing_names = {s.name for s in existing.scalars().all()}

    added = 0
    now = datetime.now(timezone.utc)

    for season_data in SEASONS_2026:
        if season_data["name"] not in existing_names:
            is_active = season_data["start"] <= now <= season_data["end"]
            season = ArenaSeason(
                name=season_data["name"],
                start_date=season_data["start"],
                end_date=season_data["end"],
                is_active=is_active
            )
            db.add(season)
            added += 1
            logger.info(f"Added season: {season_data['name']} (active: {is_active})")

    if added > 0:
        await db.commit()

    return added
