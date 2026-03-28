import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.services.license_service import LicenseService, LICENSE_SERVER_URL

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["Billing"])


@router.get("/plan")
async def get_current_plan(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get current plan info for the billing page."""
    svc = LicenseService(db)
    return await svc.get_plan()


@router.get("/usage")
async def get_usage(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get current usage counts."""
    agent_count = (await db.execute(text("SELECT COUNT(*) FROM agents"))).scalar() or 0
    member_count = (await db.execute(text("SELECT COUNT(*) FROM users"))).scalar() or 0

    svc = LicenseService(db)
    plan = await svc.get_plan()
    limits = plan.get("limits", {})

    return {
        "agents": {"current": agent_count, "limit": limits.get("max_agents", 0)},
        "members": {"current": member_count, "limit": limits.get("max_members", 0)},
        "plan": plan.get("plan", "unknown"),
    }


@router.post("/validate")
async def force_validate(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Force a license re-validation."""
    svc = LicenseService(db)
    return await svc.validate()


class ActivateRequest(BaseModel):
    license_key: str
    instance_id: str | None = None
    domain: str | None = None
    version: str | None = None


@router.post("/activate")
async def activate_license(
    body: ActivateRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Activate a license key — saves to DB and validates against license server."""
    svc = LicenseService(db)

    # Save the key to DB for persistence across restarts
    await svc.save_license_key(body.license_key)

    instance_id = body.instance_id or await svc.get_instance_id()
    agent_count = (await db.execute(text("SELECT COUNT(*) FROM agents"))).scalar() or 0
    member_count = (await db.execute(text("SELECT COUNT(*) FROM users"))).scalar() or 0

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{LICENSE_SERVER_URL}/v1/licenses/activate",
                json={
                    "license_key": body.license_key,
                    "instance_id": instance_id,
                    "domain": body.domain or os.getenv("DOMAIN", ""),
                    "version": body.version or "1.0.0",
                    "current_agents": agent_count,
                    "current_members": member_count,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                # Transform ActivateResponse into the format expected by
                # frontend (BillingPlan) and _cache_response (needs top-level status)
                billing_info = data.get("billing", {})
                transformed = {
                    "valid": data.get("valid", True),
                    "plan": data.get("plan", "none"),
                    "limits": data.get("limits", {}),
                    "status": billing_info.get("status", "active"),
                    "message": f"License activated on {data.get('plan', '')} plan.",
                    "expires_at": billing_info.get("current_period_end"),
                    "trial": False,
                    "trial_ends_at": None,
                    "grace_period_ends": None,
                    "current_period_end": billing_info.get("current_period_end"),
                }
                await svc._cache_response(transformed, body.license_key)
                return transformed
            else:
                error_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=error_body.get("detail", f"License activation failed: {resp.status_code}"),
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"License activation error: {e}")
        raise HTTPException(status_code=502, detail="Unable to reach license server")


class TrialRequest(BaseModel):
    email: str
    org_name: str


@router.post("/trial")
async def start_trial(
    body: TrialRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Start a 7-day free trial via the license server, then auto-activate."""
    svc = LicenseService(db)
    instance_id = await svc.get_instance_id()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{LICENSE_SERVER_URL}/v1/licenses/trial",
                json={
                    "email": body.email,
                    "org_name": body.org_name,
                    "instance_id": instance_id,
                    "domain": os.getenv("DOMAIN", ""),
                    "version": "1.0.0",
                },
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                trial_key = data.get("license_key", "")
                # Transform TrialResponse into BillingPlan format
                limits = data.get("limits", {})
                transformed = {
                    "valid": True,
                    "plan": data.get("plan", "trial"),
                    "limits": limits,
                    "status": "active",
                    "message": "Free trial activated!",
                    "expires_at": data.get("trial_ends_at"),
                    "trial": True,
                    "trial_ends_at": data.get("trial_ends_at"),
                    "grace_period_ends": None,
                    "license_key": trial_key,
                }
                if trial_key:
                    await svc.save_license_key(trial_key)
                    await svc._cache_response(transformed, trial_key)
                return transformed
            else:
                error_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=error_body.get("detail", f"Trial creation failed: {resp.status_code}"),
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Trial creation error: {e}")
        raise HTTPException(status_code=502, detail="Unable to reach license server")
