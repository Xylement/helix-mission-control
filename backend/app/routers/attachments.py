import os
import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, HELIX_SERVICE_TOKEN
from app.models.task import Task
from app.models.attachment import TaskAttachment
from app.models.agent import Agent
from app.models.user import User
from app.services.activity import log_activity

logger = logging.getLogger("helix.attachments")

UPLOAD_BASE = "/data/uploads"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

ALLOWED_MIME_TYPES = {
    # Images
    "image/jpeg", "image/png", "image/gif", "image/webp",
    # Documents
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    # Spreadsheets
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    # Text
    "text/plain", "text/markdown",
}

ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".pdf", ".doc", ".docx",
    ".xls", ".xlsx", ".csv",
    ".txt", ".md",
}

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

router = APIRouter(tags=["attachments"])


async def _get_uploader(
    x_service_token: str | None,
    agent_id_form: str | None,
    user,
):
    """Determine uploader identity (user or agent via service token)."""
    if x_service_token and HELIX_SERVICE_TOKEN and x_service_token == HELIX_SERVICE_TOKEN:
        if agent_id_form:
            return None, int(agent_id_form)
        return None, None
    return user.id, None


@router.post("/tasks/{task_id}/attachments")
async def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    agent_id: str | None = Form(None),
    x_service_token: str | None = Header(None, alias="X-Service-Token"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Upload a file attachment to a task."""
    # Verify task exists
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Validate file extension
    filename = file.filename or "unnamed"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' is not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    # Validate MIME type
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"MIME type '{content_type}' is not allowed."
        )

    # Read file and validate size
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB."
        )

    # Determine uploader
    uploaded_by_user_id, uploaded_by_agent_id = await _get_uploader(
        x_service_token, agent_id, user
    )

    # Storage path
    org_id = getattr(user, "org_id", None)
    file_uuid = uuid.uuid4().hex[:12]
    safe_filename = filename.replace("/", "_").replace("\\", "_")
    storage_dir = Path(UPLOAD_BASE) / str(org_id or "default") / str(task_id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    storage_path = storage_dir / f"{file_uuid}_{safe_filename}"

    # Write file
    with open(storage_path, "wb") as f:
        f.write(data)

    # Create DB record
    attachment = TaskAttachment(
        task_id=task_id,
        org_id=org_id,
        filename=filename,
        file_path=str(storage_path),
        file_size=len(data),
        mime_type=content_type,
        uploaded_by_user_id=uploaded_by_user_id,
        uploaded_by_agent_id=uploaded_by_agent_id,
    )
    db.add(attachment)
    await db.flush()

    # Log activity
    await log_activity(
        db, "user" if uploaded_by_user_id else "agent",
        uploaded_by_user_id or uploaded_by_agent_id,
        "attachment.added", "task", task_id,
        {"filename": filename, "file_size": len(data), "attachment_id": attachment.id},
    )

    await db.commit()
    await db.refresh(attachment)

    # Resolve uploader name
    uploader = await _resolve_uploader(db, attachment)

    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "file_size": attachment.file_size,
        "mime_type": attachment.mime_type,
        "uploaded_by": uploader,
        "created_at": attachment.created_at.isoformat() if attachment.created_at else None,
        "download_url": f"/api/attachments/{attachment.id}/download",
    }


@router.get("/tasks/{task_id}/attachments")
async def list_attachments(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List all attachments for a task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    attachments_result = await db.execute(
        select(TaskAttachment)
        .where(TaskAttachment.task_id == task_id)
        .order_by(TaskAttachment.created_at.desc())
    )
    attachments = attachments_result.scalars().all()

    items = []
    for a in attachments:
        uploader = await _resolve_uploader(db, a)
        items.append({
            "id": a.id,
            "filename": a.filename,
            "file_size": a.file_size,
            "mime_type": a.mime_type,
            "uploaded_by": uploader,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "download_url": f"/api/attachments/{a.id}/download",
        })

    return {"attachments": items}


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Download an attachment file."""
    result = await db.execute(
        select(TaskAttachment).where(TaskAttachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Set Content-Disposition based on type
    if attachment.mime_type in IMAGE_MIME_TYPES:
        disposition = "inline"
    else:
        disposition = "attachment"

    return FileResponse(
        path=attachment.file_path,
        filename=attachment.filename,
        media_type=attachment.mime_type,
        headers={"Content-Disposition": f'{disposition}; filename="{attachment.filename}"'},
    )


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Delete an attachment (admin or uploader only)."""
    result = await db.execute(
        select(TaskAttachment).where(TaskAttachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Permission check: admin or uploader
    is_admin = user.role == "admin"
    is_uploader = attachment.uploaded_by_user_id == user.id
    if not (is_admin or is_uploader):
        raise HTTPException(status_code=403, detail="Only admin or the uploader can delete attachments")

    # Delete file from disk
    if os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)

    # Log activity
    await log_activity(
        db, "user", user.id,
        "attachment.deleted", "task", attachment.task_id,
        {"filename": attachment.filename, "attachment_id": attachment.id},
    )

    await db.delete(attachment)
    await db.commit()


async def _resolve_uploader(db: AsyncSession, attachment: TaskAttachment) -> dict:
    """Resolve uploader name from user or agent."""
    if attachment.uploaded_by_user_id:
        u = (await db.execute(
            select(User).where(User.id == attachment.uploaded_by_user_id)
        )).scalar_one_or_none()
        return {"type": "user", "name": u.name if u else "Unknown"}
    elif attachment.uploaded_by_agent_id:
        a = (await db.execute(
            select(Agent).where(Agent.id == attachment.uploaded_by_agent_id)
        )).scalar_one_or_none()
        return {"type": "agent", "name": a.name if a else "Unknown"}
    return {"type": "system", "name": "System"}
