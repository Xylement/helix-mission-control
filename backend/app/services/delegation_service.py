"""
Agent-to-agent delegation service.

Handles creating sub-tasks, querying delegation trees, and managing delegation lifecycle.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.task import Task
from app.models.agent import Agent
from app.models.board import Board
from app.models.department import Department
from app.services.activity import log_activity
from app.services.notifications import create_notification
from app.models.user import User

logger = logging.getLogger("helix.delegation")

MAX_DELEGATION_DEPTH = 3
MAX_SUB_TASKS = 5


async def get_delegation_depth(db: AsyncSession, task_id: int) -> int:
    """Walk up parent_task_id chain, return depth (0 = root task)."""
    depth = 0
    current_id = task_id
    while current_id and depth <= MAX_DELEGATION_DEPTH:
        result = await db.execute(
            select(Task.parent_task_id).where(Task.id == current_id)
        )
        parent_id = result.scalar_one_or_none()
        if parent_id is None:
            break
        depth += 1
        current_id = parent_id
    return depth


async def create_delegation(
    db: AsyncSession,
    org_id: int,
    parent_task_id: int,
    delegating_agent_id: int,
    target_agent_id: int,
    title: str,
    description: str,
    priority: str = "medium",
    board_id: int | None = None,
    tags: list[str] | None = None,
    requires_approval: bool = True,
) -> Task:
    """Create a delegated sub-task from a parent task."""
    # Validate parent task exists and belongs to org
    parent = await db.execute(
        select(Task)
        .join(Board, Task.board_id == Board.id)
        .join(Department, Board.department_id == Department.id)
        .where(Task.id == parent_task_id, Department.org_id == org_id)
    )
    parent_task = parent.scalar_one_or_none()
    if not parent_task:
        raise ValueError("Parent task not found")

    # Validate target agent
    target_agent = (await db.execute(
        select(Agent).where(Agent.id == target_agent_id, Agent.org_id == org_id)
    )).scalar_one_or_none()
    if not target_agent:
        raise ValueError("Target agent not found")

    # Validate delegating agent
    delegating_agent = (await db.execute(
        select(Agent).where(Agent.id == delegating_agent_id, Agent.org_id == org_id)
    )).scalar_one_or_none()
    if not delegating_agent:
        raise ValueError("Delegating agent not found")

    # No self-delegation
    if target_agent_id == delegating_agent_id:
        raise ValueError("Agent cannot delegate to itself")

    # Sub-tasks cannot delegate further (depth 1 only)
    if parent_task.parent_task_id:
        raise ValueError("Sub-tasks cannot delegate — only root-level tasks may create delegations")

    # Check max depth
    depth = await get_delegation_depth(db, parent_task_id)
    if depth >= MAX_DELEGATION_DEPTH:
        raise ValueError(f"Max delegation depth ({MAX_DELEGATION_DEPTH}) reached")

    # Check max sub-tasks
    sub_count = (await db.execute(
        select(func.count()).where(Task.parent_task_id == parent_task_id)
    )).scalar() or 0
    if sub_count >= MAX_SUB_TASKS:
        raise ValueError(f"Max sub-tasks ({MAX_SUB_TASKS}) per parent reached")

    # Determine board_id
    effective_board_id = board_id or target_agent.primary_board_id

    # Create sub-task
    sub_task = Task(
        title=title,
        description=description,
        status="todo",
        priority=priority,
        board_id=effective_board_id,
        assigned_agent_id=target_agent_id,
        created_by_user_id=parent_task.created_by_user_id,
        requires_approval=requires_approval,
        tags=tags or [],
        parent_task_id=parent_task_id,
        delegation_status="pending",
        delegated_by_agent_id=delegating_agent_id,
        metadata_={
            "delegated": True,
            "parent_task_id": str(parent_task_id),
            "delegated_by": delegating_agent.name,
        },
    )
    db.add(sub_task)
    await db.flush()

    # Log activity
    await log_activity(
        db, "system", None,
        "task.delegated", "task", sub_task.id,
        {
            "task_title": title,
            "parent_task_id": parent_task_id,
            "parent_task_title": parent_task.title,
            "delegating_agent": delegating_agent.name,
            "target_agent": target_agent.name,
        },
        org_id=org_id,
    )

    # Notify admins
    admins = (await db.execute(
        select(User).where(User.role == "admin", User.org_id == org_id)
    )).scalars().all()
    for admin in admins:
        await create_notification(
            db, admin.id, "delegation", "Sub-task delegated",
            f"{delegating_agent.name} delegated '{title}' to {target_agent.name}",
            target_type="task", target_id=sub_task.id, org_id=org_id,
        )

    return sub_task


async def get_sub_tasks(db: AsyncSession, parent_task_id: int, org_id: int) -> list[Task]:
    """Return all direct sub-tasks of a parent task."""
    result = await db.execute(
        select(Task)
        .join(Board, Task.board_id == Board.id)
        .join(Department, Board.department_id == Department.id)
        .options(selectinload(Task.assigned_agent), selectinload(Task.created_by),
                 selectinload(Task.goal), selectinload(Task.delegated_by_agent))
        .where(Task.parent_task_id == parent_task_id, Department.org_id == org_id)
        .order_by(Task.created_at)
    )
    return list(result.scalars().all())


async def get_delegation_tree(db: AsyncSession, task_id: int, org_id: int) -> dict:
    """Build full delegation tree using recursive query."""
    # Get root task
    root = await db.execute(
        select(Task)
        .join(Board, Task.board_id == Board.id)
        .join(Department, Board.department_id == Department.id)
        .options(selectinload(Task.assigned_agent), selectinload(Task.created_by),
                 selectinload(Task.goal), selectinload(Task.delegated_by_agent))
        .where(Task.id == task_id, Department.org_id == org_id)
    )
    root_task = root.scalar_one_or_none()
    if not root_task:
        raise ValueError("Task not found")

    async def build_tree(task: Task, depth: int = 0) -> dict:
        from app.schemas.task import TaskOut
        node = {"task": TaskOut.model_validate(task), "sub_tasks": []}
        if depth >= MAX_DELEGATION_DEPTH:
            return node
        children = await get_sub_tasks(db, task.id, org_id)
        for child in children:
            child_node = await build_tree(child, depth + 1)
            node["sub_tasks"].append(child_node)
        return node

    return await build_tree(root_task)


async def complete_delegation(db: AsyncSession, task_id: int, org_id: int):
    """Called when a sub-task reaches 'done' status. Updates delegation_status and parent metadata.
    When ALL sub-tasks are done, re-dispatches the parent task with compiled results."""
    task = (await db.execute(
        select(Task).where(Task.id == task_id)
    )).scalar_one_or_none()
    if not task or not task.parent_task_id:
        return

    task.delegation_status = "completed"

    # Check if all sibling sub-tasks are completed
    siblings = (await db.execute(
        select(Task).where(Task.parent_task_id == task.parent_task_id)
    )).scalars().all()

    all_done = all(s.delegation_status == "completed" for s in siblings)
    if all_done:
        parent = (await db.execute(
            select(Task)
            .options(selectinload(Task.assigned_agent))
            .where(Task.id == task.parent_task_id)
        )).scalar_one_or_none()
        if parent:
            # Build sub-task results summary
            result_lines = []
            for s in siblings:
                result_preview = (s.result or "No result")[:500]
                result_lines.append(f"[{s.title}]: {result_preview}")
            results_summary = "\n\n".join(result_lines)

            meta = dict(parent.metadata_ or {})
            meta["all_delegations_completed"] = True
            meta["delegation_results"] = [
                {"task_id": s.id, "title": s.title, "status": s.status}
                for s in siblings
            ]
            # Clear pending_delegations so the agent doesn't re-delegate
            meta.pop("pending_delegations", None)
            parent.metadata_ = meta

            # Inject sub-task results into the parent description for re-dispatch
            delegation_results_context = (
                "\n\n---\nYour delegated sub-tasks are complete. Here are the results:\n\n"
                + results_summary
                + "\n\nCompile these into your final response. Do NOT delegate again."
            )
            parent.description = (parent.description or "") + delegation_results_context
            parent.result = None  # Clear previous result so agent produces fresh output
            parent.status = "in_progress"
            await db.flush()

            # Re-dispatch parent to its agent via gateway
            if parent.assigned_agent:
                try:
                    from app.services.gateway import gateway
                    parent.assigned_agent.status = "busy"
                    await db.commit()
                    await db.refresh(parent)
                    await gateway.dispatch_task(parent, parent.assigned_agent)
                    logger.info(
                        "Re-dispatched parent task %d to agent %s with compiled sub-task results",
                        parent.id, parent.assigned_agent.name,
                    )
                except Exception as e:
                    logger.error("Failed to re-dispatch parent task %d: %s", parent.id, e)
                    # Fallback: leave in in_progress so user can manually handle
            else:
                logger.warning("Parent task %d has no assigned agent, cannot re-dispatch", parent.id)
    else:
        # Check for failed/cancelled siblings — log warning but keep parent waiting
        any_failed = any(s.delegation_status == "failed" for s in siblings)
        if any_failed:
            logger.warning(
                "Sub-task %d of parent %d completed, but some siblings have failed delegation status",
                task_id, task.parent_task_id,
            )


async def get_sub_tasks_count(db: AsyncSession, task_ids: list[int]) -> dict[int, int]:
    """Get sub-task counts for a list of task IDs in a single query."""
    if not task_ids:
        return {}
    result = await db.execute(
        select(Task.parent_task_id, func.count())
        .where(Task.parent_task_id.in_(task_ids))
        .group_by(Task.parent_task_id)
    )
    return {row[0]: row[1] for row in result.all()}
