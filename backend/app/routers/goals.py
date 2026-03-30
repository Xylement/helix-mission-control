"""
Goals router — CRUD, tree, linking, progress.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user
from app.models.goal import Goal
from app.models.task import Task
from app.models.board import Board
from app.models.department import Department
from app.schemas.goal import GoalCreate, GoalUpdate, GoalOut, GoalTree, GoalProgressUpdate
from app.services.goal_service import (
    auto_calculate_progress,
    recalculate_goal_progress,
    get_goal_tree,
    get_goal_depth,
)

logger = logging.getLogger("helix.goals")

router = APIRouter(prefix="/goals", tags=["goals"])
task_goal_router = APIRouter(prefix="/tasks", tags=["goals"])


def _get_org_id(user):
    return getattr(user, "org_id", None)


async def _goal_with_counts(db, goal: Goal) -> dict:
    """Get a goal with children_count and tasks_count."""
    children_result = await db.execute(
        select(func.count()).select_from(Goal).where(Goal.parent_goal_id == goal.id)
    )
    children_count = children_result.scalar() or 0

    tasks_result = await db.execute(
        select(func.count()).select_from(Task).where(Task.goal_id == goal.id)
    )
    tasks_count = tasks_result.scalar() or 0

    goal_dict = {
        "id": goal.id,
        "org_id": goal.org_id,
        "parent_goal_id": goal.parent_goal_id,
        "title": goal.title,
        "description": goal.description,
        "goal_type": goal.goal_type,
        "status": goal.status,
        "owner_type": goal.owner_type,
        "owner_id": goal.owner_id,
        "target_date": goal.target_date,
        "progress": goal.progress,
        "department_id": goal.department_id,
        "board_id": goal.board_id,
        "sort_order": goal.sort_order,
        "created_by": goal.created_by,
        "children_count": children_count,
        "tasks_count": tasks_count,
        "created_at": goal.created_at,
        "updated_at": goal.updated_at,
    }
    return goal_dict


# --- CRUD ---

@router.get("/", response_model=list[GoalOut])
async def list_goals(
    goal_type: str | None = Query(None),
    status: str | None = Query(None),
    department_id: int | None = Query(None),
    board_id: int | None = Query(None),
    parent_goal_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    q = select(Goal).where(Goal.org_id == org_id).order_by(Goal.sort_order, Goal.created_at)
    if goal_type:
        q = q.where(Goal.goal_type == goal_type)
    if status:
        q = q.where(Goal.status == status)
    if department_id:
        q = q.where(Goal.department_id == department_id)
    if board_id:
        q = q.where(Goal.board_id == board_id)
    if parent_goal_id is not None:
        q = q.where(Goal.parent_goal_id == parent_goal_id)

    result = await db.execute(q)
    goals = result.scalars().all()

    out = []
    for g in goals:
        out.append(await _goal_with_counts(db, g))
    return out


@router.get("/tree", response_model=list[GoalTree])
async def goal_tree(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    return await get_goal_tree(db, org_id, status=status)


@router.get("/{goal_id}", response_model=GoalOut)
async def get_goal(
    goal_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == org_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return await _goal_with_counts(db, goal)


@router.post("/", response_model=GoalOut, status_code=201)
async def create_goal(
    body: GoalCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    # Admin check
    if getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Admin required")

    # Validate parent exists and depth
    if body.parent_goal_id:
        result = await db.execute(
            select(Goal).where(Goal.id == body.parent_goal_id, Goal.org_id == org_id)
        )
        parent = result.scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent goal not found")

        parent_depth = await get_goal_depth(db, body.parent_goal_id)
        if parent_depth >= 2:
            raise HTTPException(status_code=400, detail="Maximum goal depth is 3 levels (mission → objective → key result)")

        # Validate type hierarchy
        if parent.goal_type == "key_result":
            raise HTTPException(status_code=400, detail="Cannot create sub-goals under key results")

    # Auto-set goal_type based on depth
    goal_type = body.goal_type
    if body.parent_goal_id:
        parent_depth = await get_goal_depth(db, body.parent_goal_id)
        if parent_depth == 0:
            goal_type = "objective"
        elif parent_depth == 1:
            goal_type = "key_result"
    elif goal_type not in ("mission",):
        goal_type = "mission"  # top-level must be mission

    goal = Goal(
        org_id=org_id,
        parent_goal_id=body.parent_goal_id,
        title=body.title,
        description=body.description,
        goal_type=goal_type,
        owner_type=body.owner_type,
        owner_id=body.owner_id,
        target_date=body.target_date,
        department_id=body.department_id,
        board_id=body.board_id,
        sort_order=body.sort_order,
        created_by=user.id,
    )
    db.add(goal)
    await db.flush()
    await db.commit()
    await db.refresh(goal)

    logger.info("Goal created: %s (type=%s, org=%d)", goal.title, goal.goal_type, org_id)
    return await _goal_with_counts(db, goal)


@router.put("/{goal_id}", response_model=GoalOut)
async def update_goal(
    goal_id: int,
    body: GoalUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    if getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Admin required")

    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == org_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    updates = body.model_dump(exclude_unset=True)

    # Validate parent change
    if "parent_goal_id" in updates and updates["parent_goal_id"] is not None:
        new_parent_id = updates["parent_goal_id"]
        if new_parent_id == goal_id:
            raise HTTPException(status_code=400, detail="Goal cannot be its own parent")
        parent_depth = await get_goal_depth(db, new_parent_id)
        if parent_depth >= 2:
            raise HTTPException(status_code=400, detail="Maximum goal depth is 3 levels")

    for k, v in updates.items():
        setattr(goal, k, v)

    await db.commit()
    await db.refresh(goal)
    return await _goal_with_counts(db, goal)


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(
    goal_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    if getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Admin required")

    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == org_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    # Unlink tasks before deleting
    await db.execute(
        select(Task).where(Task.goal_id == goal_id)
    )
    from sqlalchemy import update
    await db.execute(
        update(Task).where(Task.goal_id == goal_id).values(goal_id=None)
    )

    await db.delete(goal)
    await db.commit()
    logger.info("Goal deleted: %d (org=%d)", goal_id, org_id)


# --- Progress ---

@router.post("/{goal_id}/progress", response_model=GoalOut)
async def update_progress(
    goal_id: int,
    body: GoalProgressUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == org_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    if body.auto:
        goal.progress = await auto_calculate_progress(db, goal_id)
    elif body.progress is not None:
        goal.progress = max(0, min(100, body.progress))

    await db.commit()
    await db.refresh(goal)
    return await _goal_with_counts(db, goal)


# --- Task linking ---

@router.get("/{goal_id}/tasks")
async def get_goal_tasks(
    goal_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    # Verify goal exists in org
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Goal not found")

    # Get tasks linked to this goal and child goals
    from sqlalchemy import text as sql_text
    query = sql_text("""
        WITH RECURSIVE goal_ids AS (
            SELECT id FROM goals WHERE id = :goal_id
            UNION ALL
            SELECT g.id FROM goals g INNER JOIN goal_ids gi ON g.parent_goal_id = gi.id
        )
        SELECT t.id, t.title, t.status, t.priority, t.board_id, t.goal_id, t.created_at
        FROM tasks t
        WHERE t.goal_id IN (SELECT id FROM goal_ids)
        ORDER BY t.created_at DESC
    """)
    result = await db.execute(query, {"goal_id": goal_id})
    rows = result.mappings().all()
    return [dict(row) for row in rows]


@task_goal_router.post("/{task_id}/goal")
async def link_task_to_goal(
    task_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    goal_id = body.get("goal_id")
    if not goal_id:
        raise HTTPException(status_code=400, detail="goal_id required")

    # Verify task exists in org
    result = await db.execute(
        select(Task)
        .join(Board, Task.board_id == Board.id)
        .join(Department, Board.department_id == Department.id)
        .where(Task.id == task_id, Department.org_id == org_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Verify goal exists in org
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Goal not found")

    old_goal_id = task.goal_id
    task.goal_id = goal_id
    await db.commit()

    # Recalculate progress for old goal (if re-linking) and new goal
    if old_goal_id and old_goal_id != goal_id:
        try:
            logger.info("Task %d unlinked from goal %d, recalculating progress", task_id, old_goal_id)
            await recalculate_goal_progress(db, old_goal_id)
        except Exception as e:
            logger.error("Goal progress recalculation failed for old goal %d: %s", old_goal_id, e)
    try:
        logger.info("Task %d linked to goal %d, recalculating progress", task_id, goal_id)
        await recalculate_goal_progress(db, goal_id)
    except Exception as e:
        logger.error("Goal progress recalculation failed for goal %d: %s", goal_id, e)
    await db.commit()

    return {"status": "linked", "task_id": task_id, "goal_id": goal_id}


@task_goal_router.delete("/{task_id}/goal")
async def unlink_task_from_goal(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    result = await db.execute(
        select(Task)
        .join(Board, Task.board_id == Board.id)
        .join(Department, Board.department_id == Department.id)
        .where(Task.id == task_id, Department.org_id == org_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    old_goal_id = task.goal_id
    task.goal_id = None
    await db.commit()

    # Recalculate progress for the goal the task was removed from
    if old_goal_id:
        try:
            logger.info("Task %d unlinked from goal %d, recalculating progress", task_id, old_goal_id)
            await recalculate_goal_progress(db, old_goal_id)
            await db.commit()
        except Exception as e:
            logger.error("Goal progress recalculation failed for goal %d: %s", old_goal_id, e)

    return {"status": "unlinked", "task_id": task_id}
