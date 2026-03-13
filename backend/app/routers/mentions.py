from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.agent import Agent
from app.models.user import User

router = APIRouter(prefix="/mentions", tags=["mentions"])


@router.get("/search")
async def search_mentionables(
    q: str = Query("", min_length=0, max_length=50),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Search agents and users for @mention autocomplete."""
    results = []

    # Search agents
    agent_query = (
        select(Agent)
        .options(selectinload(Agent.department))
        .where(Agent.name.ilike(f"%{q}%"))
        .limit(10)
    )
    agents = (await db.execute(agent_query)).scalars().all()
    for a in agents:
        results.append({
            "id": str(a.id),
            "name": a.name,
            "type": "agent",
            "role": a.role_title,
            "department": a.department.name if a.department else None,
        })

    # Search users
    user_query = select(User).where(User.name.ilike(f"%{q}%")).limit(10)
    users = (await db.execute(user_query)).scalars().all()
    for u in users:
        results.append({
            "id": str(u.id),
            "name": u.name,
            "type": "user",
            "role": u.role,
        })

    return results
