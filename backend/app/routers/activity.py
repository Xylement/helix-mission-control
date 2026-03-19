import math
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.activity import ActivityLog
from app.models.agent import Agent
from app.models.board import Board
from app.models.department import Department
from app.models.task import Task
from app.models.user import User
from app.schemas.comment import ActivityOut
from app.services.permissions import get_accessible_board_ids_for_query

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
    user=Depends(get_current_user),
):
    org_id = user.org_id
    q = select(ActivityLog).where(ActivityLog.org_id == org_id).order_by(ActivityLog.created_at.desc())

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

    is_admin_user, restricted_boards, accessible_restricted = await get_accessible_board_ids_for_query(db, user)

    def _activity_accessible(activity_row) -> bool:
        if is_admin_user:
            return True
        details = activity_row.details or {}
        board_id = details.get("board_id")
        if board_id is None:
            return True  # non-board activity (agent status, etc.)
        board_id = int(board_id)
        if board_id not in restricted_boards:
            return True
        return board_id in accessible_restricted

    # If legacy limit param is used (backward compat), use simple list response
    if limit is not None:
        fetch_limit = limit if is_admin_user else limit * 3
        q = q.limit(fetch_limit)
        result = await db.execute(q)
        rows = result.scalars().all()
        if not is_admin_user:
            rows = [r for r in rows if _activity_accessible(r)][:limit]
        activities = await _enrich_activities(rows, db)
        return activities

    # For non-admin, we can't do exact pagination with permission filtering in SQL
    # so we fetch extra and filter in Python
    if is_admin_user:
        count_q = select(func.count()).select_from(q.subquery())
        total = (await db.execute(count_q)).scalar() or 0
        pages = math.ceil(total / per_page) if per_page else 1
        q = q.offset((page - 1) * per_page).limit(per_page)
        result = await db.execute(q)
        rows = result.scalars().all()
    else:
        # Fetch all matching activities and filter by permission
        result = await db.execute(q)
        all_rows = [r for r in result.scalars().all() if _activity_accessible(r)]
        total = len(all_rows)
        pages = math.ceil(total / per_page) if per_page else 1
        start = (page - 1) * per_page
        rows = all_rows[start:start + per_page]

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
        actor_department = None
        if a.actor_type == "user" and a.actor_id:
            user = (await db.execute(select(User).where(User.id == a.actor_id))).scalar_one_or_none()
            actor_name = user.name if user else None
        elif a.actor_type == "agent" and a.actor_id:
            agent = (await db.execute(select(Agent).where(Agent.id == a.actor_id))).scalar_one_or_none()
            if agent:
                actor_name = agent.name
                dept = (await db.execute(select(Department).where(Department.id == agent.department_id))).scalar_one_or_none()
                if dept:
                    actor_department = dept.name
        elif a.actor_type == "system":
            actor_name = (a.details or {}).get("actor_name", "Helix")

        details = a.details or {}
        metadata = dict(details)
        board_department = metadata.get("department_name") or None

        if a.entity_type == "task" and a.entity_id and "board_name" not in metadata:
            task = (await db.execute(select(Task).where(Task.id == a.entity_id))).scalar_one_or_none()
            if task:
                if "task_title" not in metadata:
                    metadata["task_title"] = task.title
                board = (await db.execute(select(Board).where(Board.id == task.board_id))).scalar_one_or_none()
                if board:
                    metadata["board_name"] = board.name
                    bd = (await db.execute(select(Department).where(Department.id == board.department_id))).scalar_one_or_none()
                    if bd:
                        board_department = bd.name

        out.append({
            "id": a.id,
            "actor_type": a.actor_type,
            "actor_id": a.actor_id,
            "actor_name": actor_name or details.get("actor_name", "Unknown"),
            "actor_department": actor_department,
            "action": a.action,
            "target_type": a.entity_type,
            "target_id": a.entity_id,
            "metadata": metadata,
            "board_department": board_department,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })
    return out
