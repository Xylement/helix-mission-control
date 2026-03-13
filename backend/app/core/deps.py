import os

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

security = HTTPBearer(auto_error=False)

HELIX_SERVICE_TOKEN = os.getenv("HELIX_SERVICE_TOKEN", "")


class ServiceUser:
    """Synthetic user for service token auth (Helix Director)."""
    def __init__(self):
        self.id = 1  # Maps to Clement (admin) for activity logs
        self.name = "Helix"
        self.role = "admin"
        self.is_service_token = True


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_current_user_or_service(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    x_service_token: str | None = Header(None, alias="X-Service-Token"),
    db: AsyncSession = Depends(get_db),
):
    """Accept either service token (X-Service-Token header) or JWT Bearer."""
    if x_service_token and HELIX_SERVICE_TOKEN and x_service_token == HELIX_SERVICE_TOKEN:
        return ServiceUser()
    return await get_current_user(credentials, db)


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
