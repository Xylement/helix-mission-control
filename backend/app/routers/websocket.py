import asyncio
import logging

from fastapi import APIRouter, WebSocket, Query, WebSocketDisconnect

from app.core.security import decode_access_token
from app.services.websocket_manager import manager

logger = logging.getLogger("helix.websocket")

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    # Validate JWT token
    payload = decode_access_token(token)
    if payload is None:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = payload.get("sub")
    if user_id is None:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Use org_id from token or default
    org_id = str(payload.get("org_id", "default"))
    user_id_str = str(user_id)

    await manager.connect(org_id, user_id_str, websocket)
    try:
        # Keep connection alive — listen for client pings/messages
        while True:
            try:
                data = await websocket.receive_text()
                # Client can send "ping" to keep connection alive
                if data == "ping":
                    await websocket.send_text("pong")
            except WebSocketDisconnect:
                break
    except Exception as e:
        logger.debug("WebSocket error for user %s: %s", user_id_str, e)
    finally:
        await manager.disconnect(org_id, user_id_str, websocket)
