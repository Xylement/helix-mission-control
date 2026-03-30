import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text, select
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
from app.routers import backups as backups_router
from app.routers import version as version_router
from app.routers import white_label as white_label_router
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


async def periodic_budget_reset():
    """Check daily at midnight if any agent budgets should be reset."""
    while True:
        await asyncio.sleep(86400)  # 24 hours
        try:
            async with async_session() as db:
                from app.services.budget_service import reset_budgets_if_due
                await reset_budgets_if_due(db)
        except Exception as e:
            logger.error("Budget reset check failed: %s", e)


async def periodic_backup_scheduler():
    """Check every hour if an automated backup is due and run it."""
    BACKUP_PLANS = {"pro", "scale", "enterprise", "managed_business", "managed_enterprise"}
    while True:
        await asyncio.sleep(3600)  # Check every hour
        try:
            async with async_session() as db:
                # Check license plan
                svc = LicenseService(db)
                plan_info = await svc.get_plan()
                plan = plan_info.get("plan", "")
                features = plan_info.get("limits", {}).get("features", [])
                if "backups" not in features and plan not in BACKUP_PLANS:
                    continue

                # Get all org settings with backups enabled
                from app.models.organization_settings import OrganizationSettings
                result = await db.execute(
                    select(OrganizationSettings).where(
                        OrganizationSettings.backup_enabled == True
                    )
                )
                all_settings = result.scalars().all()

                now = datetime.now(timezone.utc)

                for settings in all_settings:
                    schedule = getattr(settings, "backup_schedule", "daily") or "daily"
                    backup_time = getattr(settings, "backup_time", "02:00") or "02:00"
                    backup_day = getattr(settings, "backup_day", "monday") or "monday"
                    retention = getattr(settings, "backup_retention_days", 7) or 7

                    # Parse backup hour
                    try:
                        target_hour = int(backup_time.split(":")[0])
                    except (ValueError, AttributeError):
                        target_hour = 2

                    # Only run if current hour matches target hour
                    if now.hour != target_hour:
                        continue

                    # For weekly, check day of week
                    if schedule == "weekly":
                        days = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
                                "friday": 4, "saturday": 5, "sunday": 6}
                        if now.weekday() != days.get(backup_day.lower(), 0):
                            continue

                    # Check if we already ran a backup in the last 23 hours for this org
                    from app.models.backup import Backup
                    recent = await db.execute(
                        select(Backup).where(
                            Backup.org_id == settings.org_id,
                            Backup.backup_type == "auto",
                            Backup.created_at > now - timedelta(hours=23),
                        ).limit(1)
                    )
                    if recent.scalar_one_or_none():
                        continue

                    # Run backup
                    from app.services import backup_service
                    logger.info("Running scheduled backup for org %d", settings.org_id)
                    await backup_service.create_backup(db, settings.org_id, backup_type="auto")

                    # Cleanup old backups
                    await backup_service.cleanup_old_backups(db, settings.org_id, retention)

        except Exception as e:
            logger.error("Backup scheduler error: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Create license_cache if it doesn't exist (not a SQLAlchemy model)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS license_cache (
                id INTEGER PRIMARY KEY DEFAULT 1,
                license_key_prefix VARCHAR(30),
                plan VARCHAR(50),
                status VARCHAR(50),
                max_agents INTEGER DEFAULT 0,
                max_members INTEGER DEFAULT 0,
                features JSONB DEFAULT '[]',
                trial BOOLEAN DEFAULT false,
                trial_ends_at TIMESTAMP WITH TIME ZONE,
                current_period_end TIMESTAMP WITH TIME ZONE,
                grace_period_ends TIMESTAMP WITH TIME ZONE,
                message TEXT,
                last_validated_at TIMESTAMP WITH TIME ZONE,
                cached_response JSONB
            )
        """))
        # Ensure column is wide enough for full key storage
        await conn.execute(text(
            "ALTER TABLE license_cache ALTER COLUMN license_key_prefix TYPE VARCHAR(30)"
        ))
        # Add description column to boards if missing
        await conn.execute(text(
            "ALTER TABLE boards ADD COLUMN IF NOT EXISTS description TEXT"
        ))
        # Add backup settings columns to organization_settings if missing
        await conn.execute(text(
            "ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN DEFAULT false"
        ))
        await conn.execute(text(
            "ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS backup_schedule VARCHAR(20) DEFAULT 'daily'"
        ))
        await conn.execute(text(
            "ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS backup_time VARCHAR(10) DEFAULT '02:00'"
        ))
        await conn.execute(text(
            "ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS backup_day VARCHAR(20) DEFAULT 'monday'"
        ))
        await conn.execute(text(
            "ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS backup_retention_days INTEGER DEFAULT 7"
        ))
        # Add budget columns to agents table
        await conn.execute(text(
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS monthly_budget_usd DECIMAL(10,2) DEFAULT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS budget_warning_threshold DECIMAL(3,2) DEFAULT 0.80"
        ))
        await conn.execute(text(
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS budget_paused BOOLEAN DEFAULT false"
        ))
        await conn.execute(text(
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS budget_pause_reason VARCHAR(200) DEFAULT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE agents ADD COLUMN IF NOT EXISTS budget_reset_day INTEGER DEFAULT 1"
        ))
        # Add estimated_cost_usd to token_usage table
        await conn.execute(text(
            "ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS estimated_cost_usd DECIMAL(10,6) DEFAULT NULL"
        ))
        # Add budget columns to organization_settings
        await conn.execute(text(
            "ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS default_agent_budget_usd DECIMAL(10,2) DEFAULT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS budget_notifications_enabled BOOLEAN DEFAULT true"
        ))
        # Create white_label_config table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS white_label_config (
                id SERIAL PRIMARY KEY,
                org_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id),
                product_name VARCHAR(100) DEFAULT 'HELIX Mission Control',
                product_short_name VARCHAR(30) DEFAULT 'HELIX',
                company_name VARCHAR(100) DEFAULT 'HelixNode',
                logo_url TEXT,
                favicon_url TEXT,
                accent_color VARCHAR(7) DEFAULT '#3b82f6',
                accent_color_secondary VARCHAR(7) DEFAULT '#8b5cf6',
                login_title VARCHAR(200) DEFAULT 'Sign in to Mission Control',
                login_subtitle TEXT,
                footer_text VARCHAR(200) DEFAULT 'Powered by HelixNode',
                loading_animation_enabled BOOLEAN DEFAULT true,
                loading_animation_text VARCHAR(30) DEFAULT 'HELIX',
                custom_css TEXT,
                docs_url TEXT DEFAULT 'https://docs.helixnode.tech',
                support_email VARCHAR(200),
                support_url TEXT,
                marketplace_visible BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        """))
    if os.environ.get("SEED_DATA", "").lower() == "true":
        async with async_session() as db:
            await seed_all(db)
    async with async_session() as db:
        from app.models.organization import Organization
        org_exists = (await db.execute(select(Organization).limit(1))).scalar_one_or_none()
        if org_exists:
            await ensure_helix_user(db)
    # Validate license on startup
    async with async_session() as db:
        svc = LicenseService(db)
        result = await svc.validate()
        if result.get("message"):
            logger.info("License: %s", result["message"])
    # Sync model config from DB to gateway config if MODEL_API_KEY env is empty
    await gateway.sync_model_config_from_db()
    # Start OpenClaw Gateway connection
    await gateway.start()
    # Start Redis pub/sub listener for WebSocket broadcasting
    listener_task = asyncio.create_task(redis_listener())
    license_task = asyncio.create_task(periodic_license_check())
    backup_task = asyncio.create_task(periodic_backup_scheduler())
    budget_task = asyncio.create_task(periodic_budget_reset())
    yield
    # Shutdown
    listener_task.cancel()
    license_task.cancel()
    backup_task.cancel()
    budget_task.cancel()
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
app.include_router(backups_router.router, prefix="/api")
app.include_router(version_router.router, prefix="/api")
app.include_router(white_label_router.router, prefix="/api")
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
