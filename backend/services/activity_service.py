"""
Activity Tracking Service
Fire-and-forget INSERT for feature usage analytics.
"""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("qython_logger")


async def track_activity(
    db: AsyncSession,
    user_id: int,
    feature: str,
    action: str,
    metadata: Optional[dict] = None,
):
    """Track a user activity event. Fire-and-forget — errors are logged but not raised."""
    from ..models import UserActivity

    try:
        activity = UserActivity(
            user_id=user_id,
            feature=feature,
            action=action,
            activity_metadata=metadata,
        )
        db.add(activity)
        # Don't flush or commit — let the route's commit handle it
    except Exception as e:
        logger.error(f"[ACTIVITY] Failed to track {feature}/{action} for user {user_id}: {e}")
