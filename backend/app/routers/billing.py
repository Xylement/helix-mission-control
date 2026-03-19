from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.services.license_service import LicenseService

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
