import asyncio
import os
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user, require_admin
from app.models.agent import Agent
from app.models.task import Task
from app.models.board import Board
from app.models.user import User
from app.models.activity import ActivityLog
from app.schemas.agent import AgentOut, AgentCreate, AgentUpdate
from app.services.license_service import LicenseService

OPENCLAW_WORKSPACE_BASE = "/home/helix/.openclaw/workspaces"

DEFAULT_LEARNING_LOOP = '''# Learning Loop

Before every task:
1. Read MEMORY.md for saved rules and past corrections
2. Check memory/ folder for recent session notes
3. Apply relevant learnings to current task

After receiving user feedback:
1. Evaluate if the correction reveals something new
2. If worth saving permanently, append to MEMORY.md
3. Use structured format (see below)

## Save Rules (append to MEMORY.md):

### RULE: [brief title]
- REASON: Why this matters
- CORRECTION: What to do differently
- DATE: YYYY-MM-DD

## Save Successful Approaches (append to MEMORY.md):

### LEARNED: [brief title]
- CONTEXT: What type of task
- APPROACH: What worked
- RESULT: Outcome
- DATE: YYYY-MM-DD

## Save Criteria:
- Only save if: reveals something new + applies to future tasks + different task next month would benefit
- Do NOT save: one-off corrections, subjective single-task preferences, things already covered in system prompt
'''


async def sync_soul_md(agent_name: str, system_prompt: str):
    """Sync agent system prompt to their SOUL.md file."""
    workspace_dir = os.path.join(OPENCLAW_WORKSPACE_BASE, agent_name.lower())
    soul_path = os.path.join(workspace_dir, "SOUL.md")

    learning_loop = ""
    if os.path.exists(soul_path):
        with open(soul_path, 'r') as f:
            content = f.read()
            loop_marker = "# Learning Loop"
            if loop_marker in content:
                learning_loop = content[content.index(loop_marker):]

    os.makedirs(workspace_dir, exist_ok=True)
    with open(soul_path, 'w') as f:
        f.write(f"# Agent Identity\n\n{system_prompt}\n\n---\n\n")
        if learning_loop:
            f.write(learning_loop)
        else:
            f.write(DEFAULT_LEARNING_LOOP)

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/", response_model=list[AgentOut])
async def list_agents(
    department_id: int | None = Query(None),
    board_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = getattr(user, "org_id", None)
    q = select(Agent).where(Agent.org_id == org_id).order_by(Agent.id)
    if department_id:
        q = q.where(Agent.department_id == department_id)
    if board_id:
        q = q.where(Agent.primary_board_id == board_id)
    result = await db.execute(q)
    return [AgentOut.model_validate(a) for a in result.scalars().all()]


@router.post("/", response_model=AgentOut)
async def create_agent(
    body: AgentCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    # Check license agent limit
    license_svc = LicenseService(db)
    allowed, error = await license_svc.can_create_agent()
    if not allowed:
        raise HTTPException(status_code=403, detail=error)

    # Validate unique name within org (across agents AND users)
    existing_agent = await db.execute(
        select(Agent).where(Agent.org_id == org_id, Agent.name.ilike(body.name))
    )
    if existing_agent.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An agent with this name already exists")

    existing_user = await db.execute(
        select(User).where(User.org_id == org_id, User.name.ilike(body.name))
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail="A user with this name already exists (names must be unique)"
        )

    agent = Agent(
        name=body.name,
        role_title=body.role_title,
        department_id=body.department_id,
        primary_board_id=body.primary_board_id,
        system_prompt=body.system_prompt,
        execution_mode=body.execution_mode,
        status="offline",
        org_id=org_id,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    asyncio.create_task(sync_soul_md(agent.name, body.system_prompt))

    db.add(ActivityLog(
        org_id=org_id,
        actor_type="user", actor_id=user.id, action="agent.created",
        entity_type="agent", entity_id=agent.id, details={"name": agent.name},
    ))
    await db.commit()

    return AgentOut.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = getattr(user, "org_id", None)
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentOut.model_validate(agent)


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent_name = agent.name
    await db.delete(agent)
    db.add(ActivityLog(
        org_id=org_id,
        actor_type="user", actor_id=user.id, action="agent.deleted",
        entity_type="agent", entity_id=agent_id, details={"name": agent_name},
    ))
    await db.commit()


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: int,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = getattr(user, "org_id", None)
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(agent, k, v)
    if "system_prompt" in updates and updates["system_prompt"] is not None:
        asyncio.create_task(sync_soul_md(agent.name, updates["system_prompt"]))
    db.add(ActivityLog(
        org_id=org_id,
        actor_type="user", actor_id=user.id, action="agent.updated",
        entity_type="agent", entity_id=agent.id, details=updates,
    ))
    await db.commit()
    await db.refresh(agent)
    return AgentOut.model_validate(agent)


@router.get("/{agent_id}/stats")
async def get_agent_stats(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = getattr(user, "org_id", None)
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    total_completed = (await db.execute(
        select(func.count(Task.id)).where(
            Task.assigned_agent_id == agent_id, Task.status == "done"
        )
    )).scalar() or 0

    now = datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    week_start = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    this_week = (await db.execute(
        select(func.count(Task.id)).where(
            Task.assigned_agent_id == agent_id,
            Task.status == "done",
            Task.updated_at >= week_start,
        )
    )).scalar() or 0

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month = (await db.execute(
        select(func.count(Task.id)).where(
            Task.assigned_agent_id == agent_id,
            Task.status == "done",
            Task.updated_at >= month_start,
        )
    )).scalar() or 0

    done_tasks_result = await db.execute(
        select(Task.created_at, Task.updated_at).where(
            Task.assigned_agent_id == agent_id,
            Task.status == "done",
        )
    )
    done_tasks = done_tasks_result.all()
    avg_minutes = None
    if done_tasks:
        durations = []
        for created, updated in done_tasks:
            if created and updated:
                diff = (updated - created).total_seconds() / 60.0
                durations.append(diff)
        if durations:
            avg_minutes = round(sum(durations) / len(durations), 1)

    status_counts = {}
    for s in ("todo", "in_progress", "review", "done"):
        count = (await db.execute(
            select(func.count(Task.id)).where(
                Task.assigned_agent_id == agent_id, Task.status == s
            )
        )).scalar() or 0
        status_counts[s] = count

    total_tasks = sum(status_counts.values())

    rejected_count = (await db.execute(
        select(func.count(func.distinct(ActivityLog.entity_id))).where(
            ActivityLog.entity_type == "task",
            ActivityLog.action == "task.updated",
            ActivityLog.details["new_status"].as_string() == "rejected",
            ActivityLog.entity_id.in_(
                select(Task.id).where(Task.assigned_agent_id == agent_id)
            ),
        )
    )).scalar() or 0

    if total_completed + rejected_count > 0:
        success_rate = round(total_completed / (total_completed + rejected_count), 2)
    else:
        success_rate = 1.0

    return {
        "tasks_completed": {
            "total": total_completed,
            "this_week": this_week,
            "this_month": this_month,
        },
        "average_completion_time_minutes": avg_minutes,
        "tasks_assigned": status_counts,
        "success_rate": success_rate,
        "total_tasks": total_tasks,
    }


@router.get("/{agent_id}/status-log")
async def get_agent_status_log(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = getattr(user, "org_id", None)
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    log_result = await db.execute(
        select(ActivityLog)
        .where(
            ActivityLog.entity_type == "agent",
            ActivityLog.entity_id == agent_id,
            ActivityLog.action.in_([
                "agent.online", "agent.offline", "agent.status_changed",
                "agent.updated",
            ]),
        )
        .order_by(ActivityLog.created_at.desc())
        .limit(50)
    )
    logs = log_result.scalars().all()

    events = []
    for log in logs:
        details = log.details or {}
        status = details.get("status") or details.get("new_status")
        if not status and "status" in details:
            status = details["status"]
        if not status:
            if log.action == "agent.online":
                status = "online"
            elif log.action == "agent.offline":
                status = "offline"
            else:
                continue
        events.append({
            "status": status,
            "timestamp": log.created_at.isoformat() if log.created_at else None,
        })

    return {"events": events}


@router.get("/{agent_id}/tasks")
async def get_agent_tasks(
    agent_id: int,
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = getattr(user, "org_id", None)
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    q = (
        select(Task)
        .options(selectinload(Task.assigned_agent), selectinload(Task.created_by))
        .where(Task.assigned_agent_id == agent_id)
        .order_by(Task.created_at.desc())
    )
    if status:
        q = q.where(Task.status == status)

    count_q = select(func.count(Task.id)).where(Task.assigned_agent_id == agent_id)
    if status:
        count_q = count_q.where(Task.status == status)
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * per_page
    q = q.offset(offset).limit(per_page)
    tasks_result = await db.execute(q)
    tasks = tasks_result.scalars().all()

    board_ids = list(set(t.board_id for t in tasks))
    board_map = {}
    if board_ids:
        boards_result = await db.execute(select(Board).where(Board.id.in_(board_ids)))
        for b in boards_result.scalars().all():
            board_map[b.id] = b.name

    items = []
    for t in tasks:
        items.append({
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "board_id": t.board_id,
            "board_name": board_map.get(t.board_id, ""),
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "result_preview": (t.result[:200] if t.result else None),
        })

    return {
        "tasks": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if per_page else 0,
    }
