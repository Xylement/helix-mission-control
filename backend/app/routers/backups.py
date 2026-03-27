"""Backup management endpoints — admin-only, org-scoped, Pro+ plan required."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.user import User
from app.models.organization_settings import OrganizationSettings
from app.services.license_service import LicenseService
from app.services import backup_service

logger = logging.getLogger("helix.backups")

router = APIRouter(prefix="/backups", tags=["backups"])

BACKUP_PLANS = {"pro", "scale", "enterprise", "managed_business", "managed_enterprise"}


def _get_org_id(user: User) -> int:
    return getattr(user, "org_id", None)


async def _check_backup_feature(db: AsyncSession):
    """Check if automated backups feature is available."""
    svc = LicenseService(db)
    plan_info = await svc.get_plan()
    plan = plan_info.get("plan", "")
    features = plan_info.get("limits", {}).get("features", [])
    if "backups" in features or plan in BACKUP_PLANS:
        return
    raise HTTPException(
        status_code=403,
        detail={
            "error": "feature_not_available",
            "feature": "backups",
            "required_plan": "pro",
            "message": "Automated backups require Pro plan or above",
        },
    )


def _backup_to_dict(b) -> dict:
    return {
        "id": str(b.id),
        "filename": b.filename,
        "file_size_bytes": b.file_size_bytes,
        "backup_type": b.backup_type,
        "status": b.status,
        "error_message": b.error_message,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


# ─── List backups ───

@router.get("")
async def list_backups(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _check_backup_feature(db)
    org_id = _get_org_id(user)
    offset = (page - 1) * per_page
    backups = await backup_service.get_backup_list(db, org_id, limit=per_page, offset=offset)
    total = await backup_service.get_backup_count(db, org_id)
    return {
        "backups": [_backup_to_dict(b) for b in backups],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ─── Create manual backup ───

@router.post("", status_code=201)
async def create_backup(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _check_backup_feature(db)
    org_id = _get_org_id(user)
    backup = await backup_service.create_backup(db, org_id, backup_type="manual")
    return _backup_to_dict(backup)


# ─── Download backup ───

@router.get("/{backup_id}/download")
async def download_backup(
    backup_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _check_backup_feature(db)
    org_id = _get_org_id(user)
    backup = await backup_service.get_backup_by_id(db, backup_id, org_id)
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
    if backup.status != "completed":
        raise HTTPException(status_code=400, detail="Backup is not ready for download")

    from pathlib import Path
    path = Path(backup.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup file not found on disk")

    return FileResponse(
        path=str(path),
        filename=backup.filename,
        media_type="application/gzip",
    )


# ─── Delete backup ───

@router.delete("/{backup_id}", status_code=204)
async def delete_backup_endpoint(
    backup_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _check_backup_feature(db)
    org_id = _get_org_id(user)
    backup = await backup_service.get_backup_by_id(db, backup_id, org_id)
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
    await backup_service.delete_backup(db, backup)


# ─── Get backup settings ───

@router.get("/settings")
async def get_backup_settings(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _check_backup_feature(db)
    org_id = _get_org_id(user)
    result = await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.org_id == org_id)
    )
    settings = result.scalar_one_or_none()
    return {
        "backup_enabled": getattr(settings, "backup_enabled", False) if settings else False,
        "backup_schedule": getattr(settings, "backup_schedule", "daily") if settings else "daily",
        "backup_time": getattr(settings, "backup_time", "02:00") if settings else "02:00",
        "backup_day": getattr(settings, "backup_day", "monday") if settings else "monday",
        "backup_retention_days": getattr(settings, "backup_retention_days", 7) if settings else 7,
    }


# ─── Update backup settings ───

@router.put("/settings")
async def update_backup_settings(
    body: dict,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await _check_backup_feature(db)
    org_id = _get_org_id(user)
    result = await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.org_id == org_id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Organization settings not found")

    if "backup_enabled" in body:
        settings.backup_enabled = bool(body["backup_enabled"])
    if "backup_schedule" in body:
        if body["backup_schedule"] not in ("daily", "weekly"):
            raise HTTPException(status_code=400, detail="Schedule must be 'daily' or 'weekly'")
        settings.backup_schedule = body["backup_schedule"]
    if "backup_time" in body:
        settings.backup_time = body["backup_time"]
    if "backup_day" in body:
        settings.backup_day = body["backup_day"]
    if "backup_retention_days" in body:
        days = int(body["backup_retention_days"])
        if days < 1 or days > 90:
            raise HTTPException(status_code=400, detail="Retention must be between 1 and 90 days")
        settings.backup_retention_days = days

    settings.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "backup_enabled": settings.backup_enabled,
        "backup_schedule": settings.backup_schedule,
        "backup_time": settings.backup_time,
        "backup_day": settings.backup_day,
        "backup_retention_days": settings.backup_retention_days,
    }
