import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base, async_session
from app.routers import auth, departments, boards, agents, tasks, comments, activity, mentions, dashboard
from app.routers import billing as billing_router
from app.routers import gateway as gateway_router
from app.routers import users as users_router
from app.routers import gateways as gateways_router
from app.routers import notifications as notifications_router
from app.routers import websocket as websocket_router
from app.routers import attachments as attachments_router
from app.routers import skills as skills_router
from app.routers import ai_models as ai_models_router
from app.routers import board_permissions as board_permissions_router
from app.routers import settings as settings_router
from app.routers import onboarding as onboarding_router
from app.routers import org_settings as org_settings_router
from app.routers import marketplace as marketplace_router
from app.routers import workflows as workflows_router
from app.routers import plugins as plugins_router
from app.seed import seed_all, ensure_helix_user
from app.services.gateway import gateway
from app.services.event_bus import subscribe_events
from app.services.license_service import LicenseService
from app.services.websocket_manager import manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)


logger = logging.getLogger("helix")


async def redis_listener():
    """Background task that subscribes to Redis pub/sub and forwards events to WebSocket clients."""
    while True:
        try:
            async for event in subscribe_events():
                org_id = event.get("org_id", "default")
                if event.get("target_user_id"):
                    await manager.send_to_user(org_id, event["target_user_id"], event)
                else:
                    await manager.broadcast_to_org(org_id, event)
        except Exception as e:
            logger.error("Redis listener error: %s", e)
            await asyncio.sleep(2)


async def periodic_license_check():
    """Validate license every 24 hours."""
    while True:
        await asyncio.sleep(86400)
        try:
            async with async_session() as db:
                svc = LicenseService(db)
                await svc.validate()
        except Exception as e:
            logger.error("Periodic license check failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        await seed_all(db)
    async with async_session() as db:
        await ensure_helix_user(db)
    # Validate license on startup
    async with async_session() as db:
        svc = LicenseService(db)
        result = await svc.validate()
        if result.get("message"):
            logger.info("License: %s", result["message"])
    # Start OpenClaw Gateway connection
    await gateway.start()
    # Start Redis pub/sub listener for WebSocket broadcasting
    listener_task = asyncio.create_task(redis_listener())
    license_task = asyncio.create_task(periodic_license_check())
    yield
    # Shutdown
    listener_task.cancel()
    license_task.cancel()
    await gateway.stop()


app = FastAPI(title="HELIX Mission Control", version="2.0.0", lifespan=lifespan)

cors_origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(billing_router.router, prefix="/api")
app.include_router(departments.router, prefix="/api")
app.include_router(boards.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(activity.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(mentions.router, prefix="/api")
app.include_router(gateway_router.router, prefix="/api")
app.include_router(users_router.router, prefix="/api")
app.include_router(gateways_router.router, prefix="/api")
app.include_router(notifications_router.router, prefix="/api")
app.include_router(attachments_router.router, prefix="/api")
app.include_router(skills_router.router, prefix="/api")
app.include_router(ai_models_router.router, prefix="/api")
app.include_router(board_permissions_router.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(onboarding_router.router, prefix="/api")
app.include_router(org_settings_router.router, prefix="/api")
app.include_router(marketplace_router.router, prefix="/api")
app.include_router(workflows_router.router, prefix="/api")
app.include_router(workflows_router.step_router, prefix="/api")
app.include_router(workflows_router.exec_router, prefix="/api")
app.include_router(plugins_router.router, prefix="/api")
app.include_router(plugins_router.agent_plugin_router, prefix="/api")
app.include_router(websocket_router.router)


from fastapi.responses import FileResponse as _FR
import os as _os

@app.get("/api/avatars/{user_id}")
async def get_avatar(user_id: int):
    upload_dir = "/data/uploads/avatars"
    for ext in ("jpg", "jpeg", "png", "webp"):
        path = _os.path.join(upload_dir, f"{user_id}.{ext}")
        if _os.path.exists(path):
            return _FR(path)
    from fastapi import HTTPException as _H
    raise _H(status_code=404, detail="Avatar not found")


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "helix-mission-control",
        "gateway_connected": gateway.is_connected,
    }
