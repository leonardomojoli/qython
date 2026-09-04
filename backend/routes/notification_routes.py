"""
Notification Routes
Endpoints for notification center: list, mark read, unread count, preferences.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..security import get_current_active_user, verify_access_token
from ..services import notification_service
from ..services.websocket_manager import ws_manager

logger = logging.getLogger("qython_logger")

router = APIRouter()


class MarkReadRequest(BaseModel):
    notification_ids: Optional[list[int]] = None


class NotificationPreferencesRequest(BaseModel):
    push_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    type_overrides: Optional[dict[str, bool]] = None


@router.get("")
async def list_notifications(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    unread_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """List notifications with pagination and unread count."""
    notifications, unread_count = await notification_service.get_notifications(
        db, current_user.id, limit, offset, unread_only
    )
    return {
        "notifications": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "body": n.body,
                "data": n.data,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
            }
            for n in notifications
        ],
        "unread_count": unread_count,
    }


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Get only the unread notification count (lightweight for polling)."""
    count = await notification_service.get_unread_count(db, current_user.id)
    return {"unread_count": count}


@router.post("/mark-read")
async def mark_read(
    body: MarkReadRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Mark specific notifications or all as read."""
    count = await notification_service.mark_read(
        db, current_user.id, body.notification_ids
    )
    await db.commit()
    return {"marked_count": count}


@router.get("/preferences")
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Get user notification preferences."""
    prefs = current_user.notification_preferences or {
        "push_enabled": True,
        "email_enabled": True,
        "type_overrides": {},
    }
    return prefs


@router.put("/preferences")
async def update_preferences(
    body: NotificationPreferencesRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Update user notification preferences."""
    prefs = current_user.notification_preferences or {
        "push_enabled": True,
        "email_enabled": True,
        "type_overrides": {},
    }
    if body.push_enabled is not None:
        prefs["push_enabled"] = body.push_enabled
    if body.email_enabled is not None:
        prefs["email_enabled"] = body.email_enabled
    if body.type_overrides is not None:
        prefs.setdefault("type_overrides", {}).update(body.type_overrides)

    current_user.notification_preferences = prefs
    await db.commit()
    return prefs


@router.websocket("/ws")
async def notification_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    payload = verify_access_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user_id = payload["user_id"]
    await ws_manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(user_id, websocket)
