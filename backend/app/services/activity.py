import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityLog
from app.services.event_bus import publish_event

logger = logging.getLogger("helix.activity")


async def log_activity(
    db: AsyncSession,
    actor_type: str,
    actor_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int,
    details: dict | None = None,
    org_id: int | None = None,
):
    metadata = details or {}
    entry = ActivityLog(
        org_id=org_id,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=metadata,
    )
    db.add(entry)

    # Publish real-time WebSocket event
    try:
        await publish_event({
            "type": action,
            "org_id": str(org_id or "default"),
            "data": {
                "actor_type": actor_type,
                "actor_id": str(actor_id) if actor_id else None,
                "actor_name": metadata.get("actor_name", ""),
                "target_type": entity_type,
                "target_id": str(entity_id),
                "metadata": metadata,
                "created_at": entry.created_at.isoformat() if entry.created_at else None,
            }
        })
    except Exception as e:
        logger.warning("Failed to publish activity event: %s", e)
