from fastapi import APIRouter
from sqlalchemy import text

from app.core.database import async_session
from app.core.config import settings
from app.services.gateway import gateway

import os
import logging

logger = logging.getLogger("helix.health")

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("/setup")
async def setup_check():
    checks = {}

    # Database
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = {"ok": True, "message": "Connected"}
    except Exception as e:
        checks["database"] = {"ok": False, "message": f"Connection failed: {str(e)[:100]}"}

    # Redis
    try:
        import redis.asyncio as aioredis
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = aioredis.from_url(redis_url, socket_connect_timeout=3)
        await r.ping()
        await r.aclose()
        checks["redis"] = {"ok": True, "message": "Connected"}
    except Exception as e:
        checks["redis"] = {"ok": False, "message": f"Connection failed: {str(e)[:100]}"}

    # Gateway
    checks["gateway"] = {
        "ok": gateway.is_connected,
        "message": "Connected" if gateway.is_connected else "Not connected — configure AI model in Settings > AI Models",
    }

    # Model configured
    try:
        async with async_session() as session:
            result = await session.execute(
                text("SELECT COUNT(*) FROM ai_models WHERE is_active = true")
            )
            model_count = result.scalar()
        if model_count and model_count > 0:
            checks["model_configured"] = {"ok": True, "message": f"{model_count} model(s) configured"}
        else:
            checks["model_configured"] = {"ok": False, "message": "No AI model configured"}
    except Exception:
        checks["model_configured"] = {"ok": False, "message": "Could not check models"}

    # License
    try:
        async with async_session() as session:
            result = await session.execute(
                text("SELECT plan, status, trial, trial_ends_at FROM license_cache WHERE id = 1")
            )
            row = result.first()
        if row:
            plan, status, trial, trial_ends = row
            if trial and trial_ends:
                msg = f"Trial active ({plan}), expires {trial_ends}"
            else:
                msg = f"{plan} plan, status: {status}"
            checks["license"] = {"ok": status in ("active", "trialing"), "message": msg}
        else:
            checks["license"] = {"ok": False, "message": "No license activated"}
    except Exception:
        checks["license"] = {"ok": False, "message": "No license activated"}

    # Admin exists
    try:
        async with async_session() as session:
            result = await session.execute(
                text("SELECT COUNT(*) FROM users WHERE role = 'admin'")
            )
            admin_count = result.scalar()
        checks["admin_exists"] = {
            "ok": admin_count > 0,
            "message": "Admin account configured" if admin_count > 0 else "No admin account",
        }
    except Exception:
        checks["admin_exists"] = {"ok": False, "message": "Could not check"}

    # Onboarding
    try:
        async with async_session() as session:
            result = await session.execute(
                text("SELECT completed FROM onboarding_state LIMIT 1")
            )
            row = result.first()
        if row and row[0]:
            checks["onboarding"] = {"ok": True, "message": "Completed"}
        else:
            checks["onboarding"] = {"ok": False, "message": "Onboarding not completed"}
    except Exception:
        checks["onboarding"] = {"ok": False, "message": "Onboarding not completed"}

    all_ok = all(c["ok"] for c in checks.values())

    # Determine next step
    next_step = None
    if not checks.get("admin_exists", {}).get("ok"):
        next_step = "Complete onboarding to create admin account"
    elif not checks.get("onboarding", {}).get("ok"):
        next_step = "Complete onboarding wizard"
    elif not checks.get("model_configured", {}).get("ok"):
        next_step = "Configure AI model in Settings > AI Models"
    elif not checks.get("license", {}).get("ok"):
        next_step = "Activate a license in Settings > License"
    elif not checks.get("gateway", {}).get("ok"):
        next_step = "Gateway will connect automatically when model is configured"

    return {
        "status": "ok" if all_ok else "incomplete",
        "checks": checks,
        "ready": all_ok,
        "next_step": next_step,
    }
