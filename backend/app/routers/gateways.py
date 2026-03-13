import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.gateway import Gateway

logger = logging.getLogger("helix.gateways")

router = APIRouter(prefix="/gateways", tags=["gateways"])


class GatewayCreate(BaseModel):
    name: str
    websocket_url: str
    token: str


class GatewayUpdate(BaseModel):
    name: str | None = None
    websocket_url: str | None = None
    token: str | None = None


async def _check_ws_health(url: str, token: str) -> bool:
    """Quick WebSocket health check — try to connect and read first message."""
    try:
        import websockets
        async with asyncio.timeout(5):
            async with websockets.connect(url, close_timeout=3) as ws:
                await ws.recv()  # should get connect.challenge
                return True
    except Exception:
        return False


@router.get("")
async def list_gateways(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Gateway).order_by(Gateway.created_at))
    gateways = result.scalars().all()

    items = []
    for gw in gateways:
        is_connected = await _check_ws_health(gw.websocket_url, gw.token)
        items.append({
            "id": gw.id,
            "name": gw.name,
            "websocket_url": gw.websocket_url,
            "connected": is_connected,
            "created_at": gw.created_at.isoformat() if gw.created_at else None,
        })

    return items


@router.post("")
async def add_gateway(
    body: GatewayCreate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    gw = Gateway(
        name=body.name,
        websocket_url=body.websocket_url,
        token=body.token,
    )
    db.add(gw)
    await db.commit()
    await db.refresh(gw)

    return {
        "id": gw.id,
        "name": gw.name,
        "websocket_url": gw.websocket_url,
        "created_at": gw.created_at.isoformat() if gw.created_at else None,
    }


@router.patch("/{gateway_id}")
async def update_gateway(
    gateway_id: int,
    body: GatewayUpdate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    gw = await db.get(Gateway, gateway_id)
    if not gw:
        raise HTTPException(404, "Gateway not found")

    if body.name is not None:
        gw.name = body.name
    if body.websocket_url is not None:
        gw.websocket_url = body.websocket_url
    if body.token is not None:
        gw.token = body.token

    await db.commit()
    return {
        "id": gw.id,
        "name": gw.name,
        "websocket_url": gw.websocket_url,
        "created_at": gw.created_at.isoformat() if gw.created_at else None,
    }


@router.delete("/{gateway_id}", status_code=204)
async def remove_gateway(
    gateway_id: int,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    gw = await db.get(Gateway, gateway_id)
    if not gw:
        raise HTTPException(404, "Gateway not found")

    await db.delete(gw)
    await db.commit()
