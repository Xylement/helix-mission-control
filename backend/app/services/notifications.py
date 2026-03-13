import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.services.event_bus import publish_event
from app.services.telegram_notify import send_telegram_notification

logger = logging.getLogger("helix.notifications")


async def create_notification(
    db: AsyncSession,
    user_id: int,
    type: str,
    title: str,
    message: str,
    target_type: str | None = None,
    target_id: int | None = None,
    org_id: int | None = None,
):
    """Create a notification, send via WebSocket, and optionally Telegram."""
    notif = Notification(
        org_id=org_id,
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        target_type=target_type,
        target_id=target_id,
    )
    db.add(notif)
    await db.flush()

    # Send real-time via WebSocket
    try:
        await publish_event({
            "type": "notification",
            "org_id": str(org_id or "default"),
            "target_user_id": str(user_id),
            "data": {
                "id": str(notif.id),
                "notification_type": type,
                "title": title,
                "message": message,
                "target_type": target_type,
                "target_id": str(target_id) if target_id else None,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            }
        })
    except Exception as e:
        logger.warning("Failed to publish notification event: %s", e)

    # Send Telegram for critical types
    try:
        await send_telegram_notification(db, user_id, type, title, message)
    except Exception as e:
        logger.warning("Telegram notification failed: %s", e)

    return notif
