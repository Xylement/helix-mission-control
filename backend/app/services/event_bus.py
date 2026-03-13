import json
import logging

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger("helix.events")

CHANNEL = "helix:events"


async def publish_event(event: dict):
    """Publish an event to Redis pub/sub."""
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.publish(CHANNEL, json.dumps(event, default=str))
        await r.close()
    except Exception as e:
        logger.error("Failed to publish event: %s", e)


async def subscribe_events():
    """Subscribe to Redis pub/sub — yields events."""
    r = aioredis.from_url(settings.REDIS_URL)
    pubsub = r.pubsub()
    await pubsub.subscribe(CHANNEL)
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    yield json.loads(message["data"])
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON in event bus message")
    finally:
        await pubsub.unsubscribe(CHANNEL)
        await r.close()
