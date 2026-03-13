import math
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.activity import ActivityLog
from app.models.agent import Agent
from app.models.user import User
from app.schemas.comment import ActivityOut

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("/")
async def list_activity(
    entity_type: str | None = Query(None),
    entity_id: int | None = Query(None),
    department_id: int | None = Query(None),
    agent_id: int | None = Query(None),
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, le=100),
    limit: int | None = Query(None, le=200),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    q = select(ActivityLog).order_by(ActivityLog.created_at.desc())

    # Legacy filters
    if entity_type:
        q = q.where(ActivityLog.entity_type == entity_type)
    if entity_id:
        q = q.where(ActivityLog.entity_id == entity_id)

    # New filters
    if agent_id:
        q = q.where(ActivityLog.actor_type == "agent", ActivityLog.actor_id == agent_id)
    if user_id:
        q = q.where(ActivityLog.actor_type == "user", ActivityLog.actor_id == user_id)
    if action:
        q = q.where(ActivityLog.action == action)
    if date_from:
        q = q.where(ActivityLog.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        q = q.where(ActivityLog.created_at <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc))
    if department_id:
        q = q.where(
            cast(ActivityLog.details["department_id"].as_string(), String) == str(department_id)
        )

    # If legacy limit param is used (backward compat), use simple list response
    if limit is not None:
        q = q.limit(limit)
        result = await db.execute(q)
        rows = result.scalars().all()
        activities = await _enrich_activities(rows, db)
        return activities

    # Count total for pagination
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    pages = math.ceil(total / per_page) if per_page else 1

    # Apply pagination
    q = q.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(q)
    rows = result.scalars().all()

    activities = await _enrich_activities(rows, db)

    return {
        "activities": activities,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }


async def _enrich_activities(rows, db: AsyncSession) -> list[dict]:
    out = []
    for a in rows:
        actor_name = None
        if a.actor_type == "user" and a.actor_id:
            user = (await db.execute(select(User).where(User.id == a.actor_id))).scalar_one_or_none()
            actor_name = user.name if user else None
        elif a.actor_type == "agent" and a.actor_id:
            agent = (await db.execute(select(Agent).where(Agent.id == a.actor_id))).scalar_one_or_none()
            actor_name = agent.name if agent else None
        elif a.actor_type == "system":
            actor_name = (a.details or {}).get("actor_name", "Helix")

        details = a.details or {}
        out.append({
            "id": a.id,
            "actor_type": a.actor_type,
            "actor_id": a.actor_id,
            "actor_name": actor_name or details.get("actor_name", "Unknown"),
            "action": a.action,
            "target_type": a.entity_type,
            "target_id": a.entity_id,
            "metadata": details,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })
    return out
