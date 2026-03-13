from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.activity import ActivityLog
from app.models.agent import Agent
from app.models.board import Board
from app.models.department import Department
from app.models.task import Task
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

DEPT_EMOJI = {
    "Marketing": "\U0001f4e3",
    "Customer Service": "\U0001f3a7",
    "Operations": "\u2699\ufe0f",
    "Tech": "\U0001f4bb",
    "Finance & HR": "\U0001f4b0",
}


@router.get("/stats")
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    # Agent counts
    total_agents = (await db.execute(select(func.count(Agent.id)))).scalar() or 0
    online_agents = (await db.execute(
        select(func.count(Agent.id)).where(Agent.status == "online")
    )).scalar() or 0

    # Task counts
    in_progress = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "in_progress")
    )).scalar() or 0
    awaiting_review = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "review")
    )).scalar() or 0

    # Completed today (using updated_at since there's no completed_at field)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    completed_today = (await db.execute(
        select(func.count(Task.id)).where(
            Task.status == "done",
            Task.updated_at >= today_start,
        )
    )).scalar() or 0

    # Department breakdowns
    departments_result = await db.execute(
        select(Department).order_by(Department.name)
    )
    departments = departments_result.scalars().all()

    dept_list = []
    for dept in departments:
        agent_count = (await db.execute(
            select(func.count(Agent.id)).where(Agent.department_id == dept.id)
        )).scalar() or 0

        # Task counts by status via boards
        board_ids_result = await db.execute(
            select(Board.id).where(Board.department_id == dept.id)
        )
        board_ids = [r for r in board_ids_result.scalars().all()]

        task_counts = {"todo": 0, "in_progress": 0, "review": 0, "done": 0}
        if board_ids:
            for status_key in task_counts:
                count = (await db.execute(
                    select(func.count(Task.id)).where(
                        Task.board_id.in_(board_ids),
                        Task.status == status_key,
                    )
                )).scalar() or 0
                task_counts[status_key] = count

        dept_list.append({
            "id": dept.id,
            "name": dept.name,
            "emoji": DEPT_EMOJI.get(dept.name, "\U0001f4c1"),
            "agent_count": agent_count,
            "tasks": task_counts,
        })

    return {
        "agents": {"total": total_agents, "online": online_agents},
        "tasks": {
            "in_progress": in_progress,
            "awaiting_review": awaiting_review,
            "completed_today": completed_today,
        },
        "departments": dept_list,
    }


@router.get("/activity")
async def dashboard_activity(
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    activities = result.scalars().all()

    out = []
    for a in activities:
        # Resolve actor name
        actor_name = None
        if a.actor_type == "user" and a.actor_id:
            user = (await db.execute(select(User).where(User.id == a.actor_id))).scalar_one_or_none()
            actor_name = user.name if user else None
        elif a.actor_type == "agent" and a.actor_id:
            agent = (await db.execute(select(Agent).where(Agent.id == a.actor_id))).scalar_one_or_none()
            actor_name = agent.name if agent else None
        elif a.actor_type == "system":
            actor_name = (a.details or {}).get("actor_name", "Helix")

        # Enrich metadata from details
        details = a.details or {}
        metadata = dict(details)

        # If we have an entity_id for a task, try to resolve board info
        if a.entity_type == "task" and a.entity_id and "board_name" not in metadata:
            task = (await db.execute(
                select(Task).where(Task.id == a.entity_id)
            )).scalar_one_or_none()
            if task:
                if "task_title" not in metadata:
                    metadata["task_title"] = task.title
                board = (await db.execute(
                    select(Board).where(Board.id == task.board_id)
                )).scalar_one_or_none()
                if board:
                    metadata["board_name"] = board.name

        out.append({
            "id": a.id,
            "actor_type": a.actor_type,
            "actor_id": a.actor_id,
            "actor_name": actor_name or details.get("actor_name", "Unknown"),
            "action": a.action,
            "target_type": a.entity_type,
            "target_id": a.entity_id,
            "metadata": metadata,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    return {"activities": out}
