"""
Organization Settings API.
Admin-only endpoints for managing org configuration.
"""
import hashlib
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin, get_current_user
from app.models.organization import Organization
from app.models.organization_settings import OrganizationSettings
from app.models.service_token import ServiceToken
from app.models.department import Department
from app.models.board import Board
from app.models.agent import Agent
from app.models.user import User

router = APIRouter(prefix="/org-settings", tags=["Organization Settings"])


# --- Helpers ---

async def _get_settings(db: AsyncSession, org_id: int) -> OrganizationSettings:
    result = await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.org_id == org_id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = OrganizationSettings(org_id=org_id)
        db.add(settings)
        await db.flush()
    return settings


# --- General ---

class GeneralSettingsRequest(BaseModel):
    org_name: str
    timezone: str = "Asia/Kuala_Lumpur"


@router.get("/general")
async def get_general_settings(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = user.org_id
    org = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org.scalar_one_or_none()
    settings = await _get_settings(db, org_id)

    return {
        "org_name": org.name if org else "",
        "timezone": settings.timezone or "UTC",
        "max_agents": settings.max_agents or 50,
        "logo_url": settings.logo_url,
    }


@router.put("/general")
async def update_general_settings(
    req: GeneralSettingsRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one()
    org.name = req.org_name

    settings = await _get_settings(db, org_id)
    settings.timezone = req.timezone

    await db.commit()
    return {"success": True}


# --- Logo Upload ---

@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Upload organization logo. Max 2MB, PNG/JPG/SVG only."""
    org_id = user.org_id

    if file.size and file.size > 2 * 1024 * 1024:
        raise HTTPException(400, "Logo must be under 2MB")

    if file.content_type not in ("image/png", "image/jpeg", "image/svg+xml"):
        raise HTTPException(400, "Logo must be PNG, JPG, or SVG")

    ext = file.filename.split(".")[-1] if file.filename else "png"
    logo_dir = "/data/uploads/logos"
    os.makedirs(logo_dir, exist_ok=True)
    logo_path = f"{logo_dir}/{org_id}.{ext}"

    content = await file.read()
    with open(logo_path, "wb") as f:
        f.write(content)

    logo_url = f"/uploads/logos/{org_id}.{ext}"
    settings = await _get_settings(db, org_id)
    settings.logo_url = logo_url
    await db.commit()

    return {"success": True, "logo_url": logo_url}


# --- API Keys / Service Tokens ---

@router.get("/tokens")
async def list_service_tokens(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    result = await db.execute(
        select(ServiceToken)
        .where(ServiceToken.org_id == org_id, ServiceToken.revoked == False)
        .order_by(ServiceToken.created_at.desc())
    )
    tokens = result.scalars().all()
    return {
        "tokens": [
            {
                "id": t.id,
                "name": t.name,
                "prefix": t.token_prefix,
                "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
                "created_at": t.created_at.isoformat(),
            }
            for t in tokens
        ]
    }


class CreateTokenRequest(BaseModel):
    name: str


@router.post("/tokens")
async def create_service_token(
    req: CreateTokenRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Create a new service token. Returns the full token ONCE."""
    org_id = user.org_id

    raw_token = hashlib.sha256(os.urandom(48)).hexdigest() + os.urandom(16).hex()
    prefix = raw_token[:8]
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    token = ServiceToken(
        org_id=org_id,
        name=req.name,
        token_hash=token_hash,
        token_prefix=prefix,
        created_by_user_id=user.id,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)

    return {
        "id": token.id,
        "name": req.name,
        "token": raw_token,
        "prefix": prefix,
        "message": "Save this token now. It cannot be retrieved again.",
    }


@router.delete("/tokens/{token_id}")
async def revoke_service_token(
    token_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Revoke a service token."""
    org_id = user.org_id
    result = await db.execute(
        select(ServiceToken).where(
            ServiceToken.id == token_id,
            ServiceToken.org_id == org_id,
        )
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(404, "Token not found")

    token.revoked = True
    await db.commit()
    return {"success": True}


# --- Notifications (Global Preferences) ---

class NotificationPrefsRequest(BaseModel):
    email_notifications: bool = True
    telegram_notifications: bool = False


@router.get("/notifications")
async def get_notification_prefs(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    return {"email_notifications": True, "telegram_notifications": False}


@router.put("/notifications")
async def update_notification_prefs(
    req: NotificationPrefsRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    return {"success": True}


# --- Export ---

@router.get("/export")
async def export_org_data(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Export all organization data as JSON."""
    org_id = user.org_id

    departments = await db.execute(select(Department).where(Department.org_id == org_id))
    boards = await db.execute(
        select(Board).join(Department).where(Department.org_id == org_id)
    )
    agents = await db.execute(select(Agent).where(Agent.org_id == org_id))
    users = await db.execute(select(User).where(User.org_id == org_id))

    export = {
        "organization": {
            "org_id": org_id,
            "exported_at": datetime.now(timezone.utc).isoformat(),
        },
        "departments": [
            {"name": d.name, "emoji": d.emoji, "sort_order": d.sort_order}
            for d in departments.scalars()
        ],
        "boards": [
            {"name": b.name, "department_id": b.department_id, "sort_order": b.sort_order}
            for b in boards.scalars()
        ],
        "agents": [
            {"name": a.name, "role_title": a.role_title, "system_prompt": a.system_prompt}
            for a in agents.scalars()
        ],
        "users": [
            {"name": u.name, "email": u.email, "role": u.role}
            for u in users.scalars()
            if u.role != "system"
        ],
    }

    return JSONResponse(
        content=export,
        headers={"Content-Disposition": "attachment; filename=helix-export.json"},
    )


# --- Danger Zone ---

@router.delete("/organization")
async def delete_organization(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """
    DELETE THE ENTIRE ORGANIZATION. Irreversible.
    Not implemented yet -- placeholder for the frontend UI.
    """
    raise HTTPException(501, "Organization deletion is not yet implemented. Contact support.")
