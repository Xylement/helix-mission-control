from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.activity import ActivityLog
from app.models.agent import Agent
from app.models.board import Board
from app.models.department import Department
from app.models.task import Task
from app.models.user import User
from app.models.token_usage import TokenUsage
from app.services.permissions import get_user_accessible_board_ids

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
    user: User = Depends(get_current_user),
):
    org_id = user.org_id
    is_admin, accessible_ids = await get_user_accessible_board_ids(db, user)

    def _board_accessible(board_id: int) -> bool:
        if is_admin:
            return True
        return board_id in accessible_ids

    total_agents = (await db.execute(
        select(func.count(Agent.id)).where(Agent.org_id == org_id)
    )).scalar() or 0
    online_agents = (await db.execute(
        select(func.count(Agent.id)).where(Agent.org_id == org_id, Agent.status == "online")
    )).scalar() or 0

    # Get all org board IDs, then filter by permission
    org_boards_result = await db.execute(
        select(Board.id).join(Department).where(Department.org_id == org_id)
    )
    all_org_board_ids = [r for r in org_boards_result.scalars().all()]
    accessible_board_ids = [bid for bid in all_org_board_ids if _board_accessible(bid)]

    if accessible_board_ids:
        in_progress = (await db.execute(
            select(func.count(Task.id)).where(
                Task.board_id.in_(accessible_board_ids),
                Task.status == "in_progress",
            )
        )).scalar() or 0
        awaiting_review = (await db.execute(
            select(func.count(Task.id)).where(
                Task.board_id.in_(accessible_board_ids),
                Task.status == "review",
            )
        )).scalar() or 0

        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        completed_today = (await db.execute(
            select(func.count(Task.id)).where(
                Task.board_id.in_(accessible_board_ids),
                Task.status == "done",
                Task.updated_at >= today_start,
            )
        )).scalar() or 0
    else:
        in_progress = awaiting_review = completed_today = 0

    departments_result = await db.execute(
        select(Department).where(Department.org_id == org_id).order_by(Department.name)
    )
    departments = departments_result.scalars().all()

    dept_list = []
    for dept in departments:
        board_ids_result = await db.execute(
            select(Board.id).where(Board.department_id == dept.id)
        )
        all_dept_board_ids = [r for r in board_ids_result.scalars().all()]
        dept_accessible_ids = [bid for bid in all_dept_board_ids if _board_accessible(bid)]

        # Skip departments where user has no accessible boards
        if not is_admin and not dept_accessible_ids:
            continue

        agent_count = (await db.execute(
            select(func.count(Agent.id)).where(Agent.department_id == dept.id)
        )).scalar() or 0

        task_counts = {"todo": 0, "in_progress": 0, "review": 0, "done": 0}
        if dept_accessible_ids:
            for status_key in task_counts:
                count = (await db.execute(
                    select(func.count(Task.id)).where(
                        Task.board_id.in_(dept_accessible_ids),
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
    user: User = Depends(get_current_user),
):
    org_id = user.org_id
    is_admin_user, accessible_activity_ids = await get_user_accessible_board_ids(db, user)

    # Fetch more than limit to account for filtering
    fetch_limit = limit if is_admin_user else limit * 3
    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.org_id == org_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(fetch_limit)
    )
    activities = result.scalars().all()

    out = []
    for a in activities:
        if len(out) >= limit:
            break

        # Filter by board permission for non-admin users
        if not is_admin_user:
            details = a.details or {}
            board_id = details.get("board_id")
            if board_id is not None:
                if int(board_id) not in accessible_activity_ids:
                    continue
        actor_name = None
        actor_department = None
        if a.actor_type == "user" and a.actor_id:
            u = (await db.execute(select(User).where(User.id == a.actor_id))).scalar_one_or_none()
            actor_name = u.name if u else None
        elif a.actor_type == "agent" and a.actor_id:
            ag = (await db.execute(select(Agent).where(Agent.id == a.actor_id))).scalar_one_or_none()
            if ag:
                actor_name = ag.name
                dept = (await db.execute(select(Department).where(Department.id == ag.department_id))).scalar_one_or_none()
                if dept:
                    actor_department = dept.name
        elif a.actor_type == "system":
            actor_name = (a.details or {}).get("actor_name", "Helix")

        details = a.details or {}
        metadata = dict(details)
        board_department = metadata.get("department_name") or None

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
                    dept = (await db.execute(select(Department).where(Department.id == board.department_id))).scalar_one_or_none()
                    if dept:
                        board_department = dept.name

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

    return {"activities": out}


@router.get("/costs")
async def dashboard_costs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Org-wide cost dashboard data."""
    org_id = user.org_id
    now = datetime.now(timezone.utc)
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 1:
        last_month_start = now.replace(year=now.year - 1, month=12, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        last_month_start = now.replace(month=now.month - 1, day=1, hour=0, minute=0, second=0, microsecond=0)

    # Helper to compute cost from a token_usage row
    cost_expr = func.coalesce(
        func.sum(TokenUsage.estimated_cost_usd),
        func.sum((TokenUsage.input_tokens * 1.0 + TokenUsage.output_tokens * 3.0) / 1000000.0),
        0,
    )

    # Total spend this month
    total_this_month = (await db.execute(
        select(cost_expr).where(
            TokenUsage.org_id == org_id,
            TokenUsage.created_at >= this_month_start,
        )
    )).scalar() or 0

    # Total spend last month
    total_last_month = (await db.execute(
        select(cost_expr).where(
            TokenUsage.org_id == org_id,
            TokenUsage.created_at >= last_month_start,
            TokenUsage.created_at < this_month_start,
        )
    )).scalar() or 0

    # Spend by agent
    agent_spend_result = await db.execute(
        select(
            TokenUsage.agent_id,
            func.coalesce(
                func.sum(TokenUsage.estimated_cost_usd),
                func.sum((TokenUsage.input_tokens * 1.0 + TokenUsage.output_tokens * 3.0) / 1000000.0),
                0,
            ).label("spent"),
        ).where(
            TokenUsage.org_id == org_id,
            TokenUsage.created_at >= this_month_start,
            TokenUsage.agent_id.isnot(None),
        ).group_by(TokenUsage.agent_id)
    )
    agent_spend_rows = agent_spend_result.all()

    # Get agent details
    agent_ids = [r.agent_id for r in agent_spend_rows]
    agents_map = {}
    if agent_ids:
        agents_result = await db.execute(
            select(Agent).where(Agent.id.in_(agent_ids))
        )
        for a in agents_result.scalars().all():
            agents_map[a.id] = a

    spend_by_agent = []
    for row in agent_spend_rows:
        agent = agents_map.get(row.agent_id)
        budget_usd = float(agent.monthly_budget_usd) if agent and agent.monthly_budget_usd else None
        spent = float(row.spent)
        pct = round(spent / budget_usd * 100, 1) if budget_usd and budget_usd > 0 else 0
        spend_by_agent.append({
            "agent_id": row.agent_id,
            "agent_name": agent.name if agent else "Unknown",
            "spent_usd": round(spent, 4),
            "budget_usd": budget_usd,
            "percentage": pct,
            "budget_paused": agent.budget_paused if agent else False,
        })
    spend_by_agent.sort(key=lambda x: x["spent_usd"], reverse=True)

    # Spend by day (last 30 days)
    thirty_days_ago = now - timedelta(days=30)
    daily_result = await db.execute(text("""
        SELECT DATE(created_at) as day,
               COALESCE(SUM(estimated_cost_usd),
                        SUM((input_tokens * 1.0 + output_tokens * 3.0) / 1000000.0), 0) as total
        FROM token_usage
        WHERE org_id = :org_id AND created_at >= :start
        GROUP BY DATE(created_at)
        ORDER BY day
    """), {"org_id": org_id, "start": thirty_days_ago})
    spend_by_day = [
        {"date": str(r.day), "total_usd": round(float(r.total), 4)}
        for r in daily_result.all()
    ]

    # Top expensive tasks (top 10 this month)
    top_tasks_result = await db.execute(text("""
        SELECT tu.task_id, t.title as task_title,
               a.name as agent_name,
               COALESCE(SUM(tu.estimated_cost_usd),
                        SUM((tu.input_tokens * 1.0 + tu.output_tokens * 3.0) / 1000000.0), 0) as cost,
               SUM(tu.total_tokens) as tokens
        FROM token_usage tu
        LEFT JOIN tasks t ON tu.task_id = t.id
        LEFT JOIN agents a ON tu.agent_id = a.id
        WHERE tu.org_id = :org_id AND tu.created_at >= :start AND tu.task_id IS NOT NULL
        GROUP BY tu.task_id, t.title, a.name
        ORDER BY cost DESC
        LIMIT 10
    """), {"org_id": org_id, "start": this_month_start})
    top_expensive_tasks = [
        {
            "task_id": r.task_id,
            "task_title": r.task_title or f"Task #{r.task_id}",
            "agent_name": r.agent_name or "Unknown",
            "cost_usd": round(float(r.cost), 4),
            "tokens": int(r.tokens),
        }
        for r in top_tasks_result.all()
    ]

    return {
        "total_spend_this_month": round(float(total_this_month), 4),
        "total_spend_last_month": round(float(total_last_month), 4),
        "spend_by_agent": spend_by_agent,
        "spend_by_day": spend_by_day,
        "top_expensive_tasks": top_expensive_tasks,
    }
