"""Version and update management endpoints."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.core.security import verify_password
from app.models.user import User
from app.services import version_service

logger = logging.getLogger("helix.version")

router = APIRouter(prefix="/version", tags=["version"])


# ─── GET /api/version — public ───

@router.get("")
async def get_version():
    """Return current version, latest version, and update status."""
    info = await version_service.check_for_updates()
    update_status = version_service.get_update_status()
    return {
        **info,
        "last_update_status": update_status,
    }


# ─── POST /api/version/check — admin, force re-check ───

@router.post("/check")
async def force_check(user: User = Depends(require_admin)):
    """Force re-check for updates (clears 6h cache)."""
    version_service.clear_cache()
    info = await version_service.check_for_updates(force=True)
    return info


# ─── POST /api/version/update — admin, trigger update ───

class UpdateRequest(BaseModel):
    password: str


@router.post("/update")
async def trigger_update(
    body: UpdateRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a system update. Requires admin password confirmation."""
    # Verify password
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=403, detail="Invalid password")

    # Rate limit: 1 update per hour
    last_status = version_service.get_update_status()
    if last_status and last_status.get("timestamp"):
        try:
            last_time = datetime.fromisoformat(last_status["timestamp"].replace("Z", "+00:00"))
            elapsed = (datetime.now(timezone.utc) - last_time).total_seconds()
            if elapsed < 3600:
                remaining = int((3600 - elapsed) / 60)
                raise HTTPException(
                    status_code=429,
                    detail=f"Please wait at least 1 hour between updates. Try again in ~{remaining} minutes.",
                )
        except (ValueError, TypeError):
            pass

    # Check no update already in progress
    if version_service.is_update_in_progress():
        raise HTTPException(status_code=409, detail="An update is already in progress")

    # Get target version
    info = await version_service.check_for_updates()
    if not info.get("update_available"):
        raise HTTPException(status_code=400, detail="No update available. Already on latest version.")

    target_version = info["latest_version"]

    # Write trigger file
    version_service.write_update_trigger(target_version)

    return {
        "status": "update_initiated",
        "target_version": target_version,
        "message": "Update started. The system will restart in ~2 minutes.",
    }


# ─── POST /api/version/cancel — admin, cancel in-progress update ───


@router.post("/cancel")
async def cancel_update(
    body: UpdateRequest,
    user: User = Depends(require_admin),
):
    """Cancel an in-progress update. Requires admin password confirmation."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=403, detail="Invalid password")

    if not version_service.is_update_in_progress():
        raise HTTPException(status_code=400, detail="No update is currently in progress")

    version_service.write_cancel_trigger()
    return {"status": "cancel_requested", "message": "Cancel signal sent to update daemon"}


# ─── GET /api/version/history — admin ───

@router.get("/history")
async def get_update_history(user: User = Depends(require_admin)):
    """Return last 10 update results."""
    return {"updates": version_service.get_update_history()}
