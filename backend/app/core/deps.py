import hashlib
import os

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.models.service_token import ServiceToken

security = HTTPBearer(auto_error=False)

HELIX_SERVICE_TOKEN = os.getenv("HELIX_SERVICE_TOKEN", "")


async def _get_helix_user(db: AsyncSession, org_id: int | None = None) -> User:
    """Get the Helix system user from the DB."""
    q = select(User).where(User.email == "helix@system.internal")
    if org_id:
        q = q.where(User.org_id == org_id)
    result = await db.execute(q)
    user = result.scalar_one_or_none()
    if not user:
        # Fallback: get any Helix user
        result = await db.execute(select(User).where(User.email == "helix@system.internal"))
        user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=500, detail="Helix system user not found")
    user.is_service_token = True  # type: ignore[attr-defined]
    return user


async def _authenticate_service_token(token: str, db: AsyncSession) -> ServiceToken | None:
    """Look up an org-scoped service token by hash match."""
    # Hash the token and compare against stored hashes
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await db.execute(
        select(ServiceToken).where(
            ServiceToken.token_hash == token_hash,
            ServiceToken.revoked == False,
        )
    )
    st = result.scalar_one_or_none()
    if st:
        # Update last_used_at
        from datetime import datetime, timezone
        st.last_used_at = datetime.now(timezone.utc)
        await db.commit()
    return st


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
    """Accept either:
    1. X-Service-Token header (legacy env-based token)
    2. X-Service-Token header (org-scoped token from service_tokens table)
    3. Bearer JWT token
    """
    if x_service_token:
        # Try legacy env-based token first
        if HELIX_SERVICE_TOKEN and x_service_token == HELIX_SERVICE_TOKEN:
            return await _get_helix_user(db)

        # Try org-scoped service token from DB
        st = await _authenticate_service_token(x_service_token, db)
        if st:
            return await _get_helix_user(db, org_id=st.org_id)

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service token")

    # Fall back to JWT Bearer
    return await get_current_user(credentials, db)


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
