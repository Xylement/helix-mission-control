from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models.agent import Agent
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "member"


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None
    password: str | None = None
    telegram_notifications: bool | None = None
    telegram_user_id: str | None = None


@router.get("")
async def list_users(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.name))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "telegram_notifications": u.telegram_notifications,
            "telegram_user_id": u.telegram_user_id,
        }
        for u in users
    ]


@router.post("")
async def create_user(
    body: UserCreate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Validate unique name across users AND agents
    existing_user = await db.execute(select(User).where(User.name.ilike(body.name)))
    if existing_user.scalar_one_or_none():
        raise HTTPException(400, "A user with this name already exists")

    existing_agent = await db.execute(select(Agent).where(Agent.name.ilike(body.name)))
    if existing_agent.scalar_one_or_none():
        raise HTTPException(
            400, "An agent with this name already exists (names must be unique across users and agents)"
        )

    # Validate unique email
    existing_email = await db.execute(select(User).where(User.email.ilike(body.email)))
    if existing_email.scalar_one_or_none():
        raise HTTPException(400, "This email is already registered")

    user = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@router.patch("/{user_id}")
async def update_user(
    user_id: int,
    body: UserUpdate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if body.name is not None:
        existing = await db.execute(
            select(User).where(User.name.ilike(body.name), User.id != user.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Name already taken by another user")
        existing_agent = await db.execute(select(Agent).where(Agent.name.ilike(body.name)))
        if existing_agent.scalar_one_or_none():
            raise HTTPException(400, "Name already taken by an agent")
        user.name = body.name

    if body.email is not None:
        existing_email = await db.execute(
            select(User).where(User.email.ilike(body.email), User.id != user.id)
        )
        if existing_email.scalar_one_or_none():
            raise HTTPException(400, "Email already taken")
        user.email = body.email
    if body.role is not None:
        user.role = body.role
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    if body.telegram_notifications is not None:
        user.telegram_notifications = body.telegram_notifications
    if body.telegram_user_id is not None:
        tid = body.telegram_user_id.strip()
        if tid and not tid.isdigit():
            raise HTTPException(400, "Telegram User ID must be numeric")
        user.telegram_user_id = tid if tid else None

    await db.commit()
    return {
        "id": user.id, "name": user.name, "email": user.email, "role": user.role,
        "telegram_notifications": user.telegram_notifications,
        "telegram_user_id": user.telegram_user_id,
    }


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == current_user.id:
        raise HTTPException(400, "Cannot delete yourself")

    await db.delete(user)
    await db.commit()
