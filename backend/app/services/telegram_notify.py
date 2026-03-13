import logging
import os

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

logger = logging.getLogger("helix.telegram")

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"

CRITICAL_TYPES = ["approval_needed", "task_review", "agent_error"]


async def send_telegram_notification(
    db: AsyncSession,
    user_id: int,
    notif_type: str,
    title: str,
    message: str,
):
    """Send Telegram notification for critical events."""
    if notif_type not in CRITICAL_TYPES:
        return

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.telegram_notifications or not user.telegram_user_id:
        return

    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not bot_token:
        return

    text = f"*{title}*\n{message}"
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                TELEGRAM_API.format(token=bot_token),
                json={
                    "chat_id": user.telegram_user_id,
                    "text": text,
                    "parse_mode": "Markdown",
                },
                timeout=10,
            )
    except Exception as e:
        logger.error("Telegram notification failed: %s", e)
