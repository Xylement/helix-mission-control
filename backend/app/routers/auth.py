import json
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import verify_password, create_access_token, hash_password
from app.models.user import User
from app.models.agent import Agent
from app.schemas.auth import LoginRequest, TokenResponse, UserOut, ProfileUpdate, PasswordChange

router = APIRouter(prefix="/auth", tags=["auth"])

UPLOAD_DIR = "/data/uploads/avatars"


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, db: AsyncSession = Depends(get_db)):
    raw = await request.body()
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid JSON body")
    try:
        body = LoginRequest(**data)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.errors())
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updates = body.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"]:
        new_name = updates["name"].strip()
        if new_name != user.name:
            # Check uniqueness across users and agents
            existing_user = (await db.execute(
                select(User).where(User.name.ilike(new_name), User.id != user.id)
            )).scalar_one_or_none()
            if existing_user:
                raise HTTPException(status_code=400, detail="Name already taken by another user")
            existing_agent = (await db.execute(
                select(Agent).where(Agent.name.ilike(new_name))
            )).scalar_one_or_none()
            if existing_agent:
                raise HTTPException(status_code=400, detail="Name already taken by an agent")
            user.name = new_name
    if "telegram_notifications" in updates:
        user.telegram_notifications = updates["telegram_notifications"]
    if "telegram_user_id" in updates:
        tid = updates["telegram_user_id"]
        if tid is not None and tid.strip():
            tid = tid.strip()
            if not tid.isdigit():
                raise HTTPException(status_code=400, detail="Telegram User ID must be numeric")
            user.telegram_user_id = tid
        else:
            user.telegram_user_id = None
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/me/change-password")
async def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True, "message": "Password changed successfully"}


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images are allowed")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 2MB)")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    filename = f"{user.id}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    user.avatar_url = f"/api/avatars/{user.id}"
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/avatars/{user_id}")
async def get_avatar(user_id: int):
    for ext in ("jpg", "jpeg", "png", "webp"):
        path = os.path.join(UPLOAD_DIR, f"{user_id}.{ext}")
        if os.path.exists(path):
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="Avatar not found")
