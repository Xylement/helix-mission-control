import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user
from app.models.task import Task
from app.models.agent import Agent
from app.models.board import Board
from app.models.comment import Comment
from app.models.activity import ActivityLog
from app.models.department import Department
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate, TaskOut
from app.services.activity import log_activity
from app.services.gateway import gateway
from app.services.notifications import create_notification
from app.services.task_status import validate_transition, ActorType, TaskStatus
from app.models.board_permission import BoardPermission

logger = logging.getLogger("helix.tasks")

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def _check_board_permission(db: AsyncSession, user, board_id: int, required_level: str):
    """Check if user has required permission level on a board. Admin bypasses all."""
    is_admin = getattr(user, "role", None) == "admin" or getattr(user, "is_service_token", False)
    if is_admin:
        return
    from sqlalchemy import exists
    has_perms = (await db.execute(
        select(exists().where(BoardPermission.board_id == board_id))
    )).scalar()
    if not has_perms:
        return  # No permissions set = open to all
    user_perm = (await db.execute(
        select(BoardPermission).where(
            BoardPermission.board_id == board_id,
            BoardPermission.user_id == user.id,
        )
    )).scalar_one_or_none()
    if not user_perm:
        raise HTTPException(status_code=403, detail="Access denied to this board")
    levels = {"view": 0, "create": 1, "manage": 2}
    if levels.get(user_perm.permission_level, 0) < levels.get(required_level, 0):
        raise HTTPException(status_code=403, detail=f"Requires '{required_level}' permission on this board")


@router.get("/search", response_model=list[TaskOut])
async def search_tasks(
    q: str = Query("", min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Search tasks across all boards by title, description, or agent name."""
    search_term = f"%{q}%"
    stmt = (
        select(Task)
        .options(selectinload(Task.assigned_agent), selectinload(Task.created_by))
        .outerjoin(Agent, Task.assigned_agent_id == Agent.id)
        .where(
            (Task.title.ilike(search_term))
            | (Task.description.ilike(search_term))
            | (Agent.name.ilike(search_term))
        )
        .order_by(Task.created_at.desc())
        .limit(50)
    )
    result = await db.execute(stmt)
    return [TaskOut.model_validate(t) for t in result.scalars().all()]


@router.get("/", response_model=list[TaskOut])
async def list_tasks(
    board_id: int | None = Query(None),
    status: str | None = Query(None),
    assigned_agent_id: int | None = Query(None),
    archived: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    q = (
        select(Task)
        .options(selectinload(Task.assigned_agent), selectinload(Task.created_by))
        .order_by(Task.created_at.desc())
    )
    if board_id:
        q = q.where(Task.board_id == board_id)
    if status:
        q = q.where(Task.status == status)
    if assigned_agent_id:
        q = q.where(Task.assigned_agent_id == assigned_agent_id)
    # Default: hide archived tasks unless explicitly requested
    if archived is None:
        q = q.where(Task.archived == False)
    elif archived is not None:
        q = q.where(Task.archived == archived)
    result = await db.execute(q)
    return [TaskOut.model_validate(t) for t in result.scalars().all()]


@router.post("/", response_model=TaskOut, status_code=201)
async def create_task(
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _check_board_permission(db, user, body.board_id, "create")
    task = Task(**body.model_dump(), created_by_user_id=user.id)
    db.add(task)
    await db.flush()

    # Build rich metadata
    meta = {"task_title": body.title}
    board = (await db.execute(select(Board).where(Board.id == body.board_id))).scalar_one_or_none()
    if board:
        meta["board_name"] = board.name
        meta["board_id"] = board.id
        dept = (await db.execute(select(Department).where(Department.id == board.department_id))).scalar_one_or_none()
        if dept:
            meta["department_id"] = dept.id
            meta["department_name"] = dept.name
    if body.assigned_agent_id:
        agent = (await db.execute(select(Agent).where(Agent.id == body.assigned_agent_id))).scalar_one_or_none()
        if agent:
            meta["agent_name"] = agent.name

    meta["actor_name"] = user.name
    await log_activity(db, "user", user.id, "task.created", "task", task.id, meta)

    # Notify on task assignment
    if body.assigned_agent_id:
        agent = (await db.execute(select(Agent).where(Agent.id == body.assigned_agent_id))).scalar_one_or_none()
        agent_name = agent.name if agent else "an agent"
        # Notify admins about agent assignment (skip if creator is admin)
        admin_result = await db.execute(select(User).where(User.role == "admin"))
        for admin in admin_result.scalars().all():
            if admin.id != user.id:
                await create_notification(
                    db, admin.id, "task_assigned", "Task assigned",
                    f"'{body.title}' was assigned to {agent_name}",
                    target_type="task", target_id=task.id, org_id=user.org_id,
                )

    await db.commit()
    await db.refresh(task, attribute_names=["assigned_agent", "created_by"])

    # Auto-dispatch if agent has execution_mode="auto"
    await _maybe_auto_dispatch(task, db, user)
    await db.refresh(task, attribute_names=["assigned_agent", "created_by"])

    return TaskOut.model_validate(task)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assigned_agent), selectinload(Task.created_by))
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskOut.model_validate(task)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assigned_agent), selectinload(Task.created_by))
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await _check_board_permission(db, user, task.board_id, "create")
    # Fix 4: Block edits on completed tasks (except by admin/service)
    if task.status == "done":
        if user.role != "admin":
            raise HTTPException(
                status_code=400,
                detail="Cannot edit a completed task. Reopen it first."
            )

    updates = body.model_dump(exclude_unset=True)

    # Fix 3: Validate status transitions
    if "status" in updates and updates["status"] != task.status:
        actor_type = ActorType.USER
        is_valid, error = validate_transition(
            TaskStatus(task.status),
            TaskStatus(updates["status"]),
            actor_type,
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=error)

    old_status = task.status
    old_agent_id = task.assigned_agent_id

    for k, v in updates.items():
        setattr(task, k, v)

    # Build rich metadata
    board = (await db.execute(select(Board).where(Board.id == task.board_id))).scalar_one_or_none()
    meta: dict = {"task_title": task.title}
    if board:
        meta["board_name"] = board.name
        meta["board_id"] = board.id
        dept = (await db.execute(select(Department).where(Department.id == board.department_id))).scalar_one_or_none()
        if dept:
            meta["department_id"] = dept.id
            meta["department_name"] = dept.name
    meta.update(updates)

    # Determine action type
    action = "task.updated"
    if "status" in updates:
        if updates["status"] == "done":
            action = "task.completed"
        elif updates["status"] != old_status:
            meta["old_status"] = old_status
            meta["new_status"] = updates["status"]

    if "assigned_agent_id" in updates and updates["assigned_agent_id"] != old_agent_id:
        agent = (await db.execute(select(Agent).where(Agent.id == updates["assigned_agent_id"]))).scalar_one_or_none()
        if agent:
            meta["agent_name"] = agent.name
        # Log assignment as separate activity
        await log_activity(db, "user", user.id, "task.assigned", "task", task.id, meta)

    meta["actor_name"] = user.name
    await log_activity(db, "user", user.id, action, "task", task.id, meta)

    # Notifications based on status changes
    if "status" in updates:
        new_status = updates["status"]
        # Task completed → notify creator
        if new_status == "done" and task.created_by_user_id != user.id:
            await create_notification(
                db, task.created_by_user_id, "task_completed", "Task completed",
                f"'{task.title}' has been marked as done",
                target_type="task", target_id=task.id, org_id=user.org_id,
            )
        # Task moved to review → notify creator + admins
        if new_status == "review":
            agent_name = meta.get("agent_name", "Someone")
            recipients = set()
            if task.created_by_user_id != user.id:
                recipients.add(task.created_by_user_id)
            admin_result = await db.execute(select(User).where(User.role == "admin"))
            for admin in admin_result.scalars().all():
                if admin.id != user.id:
                    recipients.add(admin.id)
            for uid in recipients:
                await create_notification(
                    db, uid, "task_review", "Task ready for review",
                    f"{agent_name} submitted '{task.title}' for review",
                    target_type="task", target_id=task.id, org_id=user.org_id,
                )

    await db.commit()
    await db.refresh(task, attribute_names=["assigned_agent", "created_by"])

    # Auto-dispatch if agent assignment changed and agent is auto-mode
    if "assigned_agent_id" in updates and updates["assigned_agent_id"]:
        await _maybe_auto_dispatch(task, db, user)
        await db.refresh(task, attribute_names=["assigned_agent", "created_by"])

    return TaskOut.model_validate(task)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await _check_board_permission(db, user, task.board_id, "manage")
    # Fix 4: Permission check — only creator, admin can delete
    is_creator = task.created_by_user_id == user.id
    is_admin = user.role == "admin"
    if not (is_creator or is_admin):
        raise HTTPException(
            status_code=403,
            detail="Only the task creator or admin can delete tasks"
        )

    # Delete related comments first (ORM doesn't trigger DB CASCADE)
    await db.execute(select(Comment).where(Comment.task_id == task_id).execution_options(synchronize_session="fetch"))
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(Comment).where(Comment.task_id == task_id))

    meta = {"task_title": task.title}
    board = (await db.execute(select(Board).where(Board.id == task.board_id))).scalar_one_or_none()
    if board:
        meta["board_name"] = board.name
        meta["board_id"] = board.id
        dept = (await db.execute(select(Department).where(Department.id == board.department_id))).scalar_one_or_none()
        if dept:
            meta["department_id"] = dept.id
            meta["department_name"] = dept.name
    await log_activity(db, "user", user.id, "task.deleted", "task", task.id, meta)
    await db.delete(task)
    await db.commit()


@router.post("/{task_id}/execute", response_model=TaskOut)
async def execute_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually trigger agent execution for a task."""
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assigned_agent), selectinload(Task.created_by))
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status not in ("todo", "rejected"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot execute task in '{task.status}' status. Must be 'todo' or 'rejected'."
        )

    if not task.assigned_agent_id:
        raise HTTPException(status_code=400, detail="Task has no assigned agent")

    agent = task.assigned_agent
    if not agent:
        result = await db.execute(select(Agent).where(Agent.id == task.assigned_agent_id))
        agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Assigned agent not found")

    if not gateway.is_connected:
        raise HTTPException(status_code=503, detail="OpenClaw Gateway is not connected")

    # Update status to in_progress
    task.status = "in_progress"
    agent.status = "busy"
    task.updated_at = datetime.now(timezone.utc)

    meta = {"task_title": task.title, "agent_name": agent.name}
    board = (await db.execute(select(Board).where(Board.id == task.board_id))).scalar_one_or_none()
    if board:
        meta["board_name"] = board.name
        meta["board_id"] = board.id
        dept = (await db.execute(select(Department).where(Department.id == board.department_id))).scalar_one_or_none()
        if dept:
            meta["department_id"] = dept.id
            meta["department_name"] = dept.name
    await log_activity(db, "user", user.id, "task.executed", "task", task.id, meta)
    await db.commit()

    # Dispatch to gateway
    try:
        await gateway.dispatch_task(task, agent)
        logger.info("Manual execute: task %d dispatched to agent %s", task.id, agent.name)
    except ConnectionError as e:
        # Revert status on dispatch failure
        task.status = "todo"
        agent.status = "online"
        await db.commit()
        raise HTTPException(status_code=502, detail=f"Gateway dispatch failed: {str(e)}")

    await db.refresh(task, attribute_names=["assigned_agent", "created_by"])
    return TaskOut.model_validate(task)


async def _maybe_auto_dispatch(task: Task, db: AsyncSession, user: User):
    """Auto-dispatch a task to the gateway if the assigned agent is in auto mode."""
    if not task.assigned_agent_id or task.status != "todo":
        return

    agent = task.assigned_agent
    if not agent:
        result = await db.execute(select(Agent).where(Agent.id == task.assigned_agent_id))
        agent = result.scalar_one_or_none()

    if not agent or agent.execution_mode != "auto":
        return

    if not gateway.is_connected:
        logger.warning("Gateway not connected, skipping auto-dispatch for task %d", task.id)
        return

    # Update statuses
    task.status = "in_progress"
    agent.status = "busy"
    meta: dict = {"task_title": task.title, "agent_name": agent.name, "trigger": "auto", "actor_name": "Helix"}
    board = (await db.execute(select(Board).where(Board.id == task.board_id))).scalar_one_or_none()
    if board:
        meta["board_name"] = board.name
        meta["board_id"] = board.id
        dept = (await db.execute(select(Department).where(Department.id == board.department_id))).scalar_one_or_none()
        if dept:
            meta["department_id"] = dept.id
            meta["department_name"] = dept.name
    await log_activity(db, "system", None, "task.dispatched", "task", task.id, meta)
    await db.commit()
    await db.refresh(task)

    try:
        await gateway.dispatch_task(task, agent)
        logger.info("Auto-dispatched task %d to agent %s", task.id, agent.name)
    except ConnectionError:
        task.status = "todo"
        agent.status = "online"
        await db.commit()
        logger.error("Failed to auto-dispatch task %d", task.id)
