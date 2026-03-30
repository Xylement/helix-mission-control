"""White label branding endpoints — public branding + admin config management."""

import logging
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.white_label import WhiteLabelConfig
from app.schemas.white_label import BrandingPublic, WhiteLabelConfigOut, WhiteLabelConfigUpdate
from app.services.activity import log_activity
from app.services.license_service import LicenseService

logger = logging.getLogger("helix.white_label")

router = APIRouter(tags=["white-label"])


@router.get("/branding")
async def get_branding(db: AsyncSession = Depends(get_db)):
    """Public endpoint — returns branding config for the login page and app shell.
    No authentication required so login page can fetch before user logs in."""
    result = await db.execute(select(WhiteLabelConfig).limit(1))
    config = result.scalar_one_or_none()

    if not config:
        return BrandingPublic()

    return BrandingPublic.model_validate(config)


@router.get("/settings/white-label")
async def get_white_label_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin only — returns full white label config."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(WhiteLabelConfig).where(WhiteLabelConfig.org_id == current_user.org_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        config = WhiteLabelConfig(org_id=current_user.org_id)
        db.add(config)
        await db.commit()
        await db.refresh(config)

    return WhiteLabelConfigOut.model_validate(config)


@router.put("/settings/white-label")
async def update_white_label_settings(
    update_data: WhiteLabelConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin only — update white label branding. Requires white_label license feature."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    svc = LicenseService(db)
    has_wl = await svc.has_feature("white_label")
    if not has_wl:
        raise HTTPException(
            status_code=403,
            detail="White label customization requires an Agency or Partner plan. Upgrade at helixnode.tech/pricing",
        )

    result = await db.execute(
        select(WhiteLabelConfig).where(WhiteLabelConfig.org_id == current_user.org_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        config = WhiteLabelConfig(org_id=current_user.org_id)
        db.add(config)
        await db.flush()

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)
    return WhiteLabelConfigOut.model_validate(config)


@router.post("/settings/white-label/reset")
async def reset_white_label_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin only — reset all white label branding to defaults. Requires white_label license feature."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    svc = LicenseService(db)
    has_wl = await svc.has_feature("white_label")
    if not has_wl:
        raise HTTPException(
            status_code=403,
            detail="White label customization requires an Agency or Partner plan. Upgrade at helixnode.tech/pricing",
        )

    result = await db.execute(
        select(WhiteLabelConfig).where(WhiteLabelConfig.org_id == current_user.org_id)
    )
    config = result.scalar_one_or_none()

    if config:
        await db.delete(config)
        await db.commit()
        logger.info("White label config reset for org %s by user %s", current_user.org_id, current_user.id)

    await log_activity(
        db,
        actor_type="user",
        actor_id=current_user.id,
        action="white_label.reset",
        entity_type="organization",
        entity_id=current_user.org_id,
        details={"actor_name": current_user.name, "description": "White label branding reset to defaults"},
        org_id=current_user.org_id,
    )
    await db.commit()

    return BrandingPublic()


@router.post("/settings/white-label/logo")
async def upload_logo(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload custom logo. Requires white_label license feature."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    svc = LicenseService(db)
    has_wl = await svc.has_feature("white_label")
    if not has_wl:
        raise HTTPException(status_code=403, detail="White label requires Agency or Partner plan")

    allowed_types = ["image/png", "image/jpeg", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Logo must be PNG, JPG, or SVG")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo must be under 2MB")

    upload_dir = Path("data/uploads/branding")
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "png"
    filename = f"logo_{current_user.org_id}.{ext}"
    filepath = upload_dir / filename

    with open(filepath, "wb") as f:
        f.write(content)

    relative_url = f"/api/uploads/branding/{filename}"
    result = await db.execute(
        select(WhiteLabelConfig).where(WhiteLabelConfig.org_id == current_user.org_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        config = WhiteLabelConfig(org_id=current_user.org_id, logo_url=relative_url)
        db.add(config)
    else:
        config.logo_url = relative_url

    await db.commit()
    return {"logo_url": relative_url}


@router.post("/settings/white-label/favicon")
async def upload_favicon(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload custom favicon. Requires white_label license feature."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    svc = LicenseService(db)
    has_wl = await svc.has_feature("white_label")
    if not has_wl:
        raise HTTPException(status_code=403, detail="White label requires Agency or Partner plan")

    allowed_types = ["image/png", "image/x-icon", "image/svg+xml", "image/vnd.microsoft.icon"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Favicon must be PNG, ICO, or SVG")

    content = await file.read()
    if len(content) > 500 * 1024:
        raise HTTPException(status_code=400, detail="Favicon must be under 500KB")

    upload_dir = Path("data/uploads/branding")
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "png"
    filename = f"favicon_{current_user.org_id}.{ext}"
    filepath = upload_dir / filename

    with open(filepath, "wb") as f:
        f.write(content)

    relative_url = f"/api/uploads/branding/{filename}"
    result = await db.execute(
        select(WhiteLabelConfig).where(WhiteLabelConfig.org_id == current_user.org_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        config = WhiteLabelConfig(org_id=current_user.org_id, favicon_url=relative_url)
        db.add(config)
    else:
        config.favicon_url = relative_url

    await db.commit()
    return {"favicon_url": relative_url}


@router.get("/uploads/branding/{filename}")
async def serve_branding_file(filename: str):
    """Serve uploaded branding assets (logo, favicon). No auth — login page needs these."""
    if not re.match(r'^[a-zA-Z0-9._-]+$', filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = Path("data/uploads/branding") / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(filepath)
