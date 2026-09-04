"""
Notification Service
Handles persisting notifications, sending push via FCM, querying, and read status management.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, update, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from .websocket_manager import ws_manager

logger = logging.getLogger("qython_logger")


# Mirror shared NotificationType enum
class NotificationType:
    MATERIAL_READY = 'material_ready'
    MATERIAL_FAILED = 'material_failed'
    DRACMA_EXPIRING = 'dracma_expiring'
    KYC_VERIFIED = 'kyc_verified'
    KYC_REJECTED = 'kyc_rejected'
    WAITLIST_ACTIVATED = 'waitlist_activated'
    ARENA_SEASON_STARTED = 'arena_season_started'
    ARENA_SEASON_ENDED = 'arena_season_ended'
    SYSTEM_ANNOUNCEMENT = 'system_announcement'


async def send_notification(
    db: AsyncSession,
    user_id: int,
    type: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    save_to_db: bool = True,
    send_push: bool = True,
) -> Optional[int]:
    """Send a notification to a user (persist + push)."""
    from ..models import Notification, User

    notification_id = None

    # Check user notification preferences
    if send_push or save_to_db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user and user.notification_preferences:
            prefs = user.notification_preferences
            # Check per-type override
            type_overrides = prefs.get('type_overrides', {})
            if type in type_overrides and not type_overrides[type]:
                send_push = False
            # Check global push toggle
            if not prefs.get('push_enabled', True):
                send_push = False

    # Persist to database
    if save_to_db:
        notification = Notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            data=data,
            is_read=False,
        )
        db.add(notification)
        await db.flush()
        notification_id = notification.id
        logger.info(f"[NOTIFICATIONS] Saved notification {notification_id} for user {user_id}: {type}")

        try:
            await ws_manager.send_to_user(user_id, {
                "type": "new_notification",
                "notification": {
                    "id": notification_id,
                    "type": type,
                    "title": title,
                    "body": body,
                    "data": data,
                    "is_read": False,
                    "created_at": notification.created_at.isoformat(),
                },
            })
        except Exception as e:
            logger.warning(f"[WS] Failed to send real-time notification: {e}")

    # Send push notification
    if send_push:
        await _send_push_to_user(db, user_id, title, body, data, type)

    return notification_id


async def _send_push_to_user(
    db: AsyncSession,
    user_id: int,
    title: str,
    body: str,
    data: Optional[dict] = None,
    notification_type: str = '',
):
    """Send push notification to all user's devices via FCM."""
    from ..models import PushToken

    try:
        from firebase_admin import messaging
    except ImportError:
        logger.warning("[NOTIFICATIONS] firebase_admin not available, skipping push")
        return

    result = await db.execute(
        select(PushToken).where(PushToken.user_id == user_id)
    )
    tokens = result.scalars().all()

    if not tokens:
        logger.debug(f"[NOTIFICATIONS] No push tokens for user {user_id}")
        return

    # Prepare data payload (must be string values)
    push_data = {'type': notification_type}
    if data:
        push_data.update({k: str(v) for k, v in data.items()})

    stale_token_ids = []

    for token_record in tokens:
        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body,
                ),
                data=push_data,
                token=token_record.token,
                android=messaging.AndroidConfig(
                    priority='high',
                    notification=messaging.AndroidNotification(
                        channel_id='qython_notifications',
                        icon='ic_notification',
                    ),
                ),
                apns=messaging.APNSConfig(
                    payload=messaging.APNSPayload(
                        aps=messaging.Aps(
                            badge=1,
                            sound='default',
                        ),
                    ),
                ),
                webpush=messaging.WebpushConfig(
                    notification=messaging.WebpushNotification(
                        icon='/icons/icon-192x192.png',
                    ),
                ),
            )
            messaging.send(message)
            # Update last_used_at
            token_record.last_used_at = datetime.now(timezone.utc)
            logger.debug(f"[NOTIFICATIONS] Push sent to token {token_record.id} ({token_record.platform})")

        except (messaging.UnregisteredError, messaging.SenderIdMismatchError):
            logger.info(f"[NOTIFICATIONS] Stale token {token_record.id}, marking for cleanup")
            stale_token_ids.append(token_record.id)
        except Exception as e:
            logger.error(f"[NOTIFICATIONS] Failed to send push to token {token_record.id}: {e}")

    # Clean up stale tokens
    if stale_token_ids:
        await db.execute(
            delete(PushToken).where(PushToken.id.in_(stale_token_ids))
        )
        logger.info(f"[NOTIFICATIONS] Cleaned up {len(stale_token_ids)} stale tokens")


async def send_notification_to_multiple(
    db: AsyncSession,
    user_ids: list[int],
    type: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
):
    """Send same notification to multiple users."""
    for user_id in user_ids:
        try:
            await send_notification(db, user_id, type, title, body, data)
        except Exception as e:
            logger.error(f"[NOTIFICATIONS] Failed for user {user_id}: {e}")


async def get_notifications(
    db: AsyncSession,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False,
):
    """Get notifications for a user with unread count."""
    from ..models import Notification

    query = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        query = query.where(Notification.is_read == False)
    query = query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    notifications = result.scalars().all()

    # Get unread count
    count_result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.is_read == False,
        )
    )
    unread_count = count_result.scalar() or 0

    return notifications, unread_count


async def mark_read(
    db: AsyncSession,
    user_id: int,
    notification_ids: Optional[list[int]] = None,
):
    """Mark specific notifications or all as read."""
    from ..models import Notification

    stmt = update(Notification).where(
        Notification.user_id == user_id,
        Notification.is_read == False,
    )
    if notification_ids:
        stmt = stmt.where(Notification.id.in_(notification_ids))
    stmt = stmt.values(is_read=True)

    result = await db.execute(stmt)
    logger.info(f"[NOTIFICATIONS] Marked {result.rowcount} as read for user {user_id}")

    try:
        count = await get_unread_count(db, user_id)
        await ws_manager.send_to_user(user_id, {
            "type": "unread_count",
            "unread_count": count,
        })
    except Exception as e:
        logger.warning(f"[WS] Failed to send unread count update: {e}")

    return result.rowcount


async def get_unread_count(db: AsyncSession, user_id: int) -> int:
    """Get unread notification count for badge display."""
    from ..models import Notification

    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.is_read == False,
        )
    )
    return result.scalar() or 0


async def cleanup_old_notifications():
    """Delete read notifications older than 90 days. Called by scheduler."""
    from ..database import AsyncSessionLocal
    from ..models import Notification
    from datetime import timedelta

    async with AsyncSessionLocal() as db:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=90)
            result = await db.execute(
                delete(Notification).where(
                    Notification.is_read == True,
                    Notification.created_at < cutoff,
                )
            )
            await db.commit()
            logger.info(f"[NOTIFICATIONS] Cleanup: deleted {result.rowcount} old read notifications")
        except Exception as e:
            logger.error(f"[NOTIFICATIONS] Cleanup error: {e}", exc_info=True)
