"""
Goal hierarchy service — tree queries, context injection, auto-progress.
"""

import logging
from functools import lru_cache

from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goal import Goal
from app.models.task import Task
from app.schemas.goal import GoalContext

logger = logging.getLogger("helix.goals")

# Status → progress mapping for auto-calculation
TASK_STATUS_PROGRESS = {
    "todo": 0,
    "in_progress": 25,
    "review": 75,
    "approved": 100,
    "done": 100,
    "rejected": 25,
    # cancelled is excluded
}


async def get_goal_context_for_task(db: AsyncSession, task: Task) -> GoalContext | None:
    """Walk up the goal tree to build full ancestry for prompt injection."""
    if not hasattr(task, "goal_id") or not task.goal_id:
        return None

    # Fetch the goal and walk up
    result = await db.execute(select(Goal).where(Goal.id == task.goal_id))
    goal = result.scalar_one_or_none()
    if not goal:
        return None

    # Build context by walking up the tree
    context = GoalContext()
    current = goal

    # Collect hierarchy
    hierarchy = []
    visited = set()
    while current and current.id not in visited:
        visited.add(current.id)
        hierarchy.append(current)
        if current.parent_goal_id:
            result = await db.execute(select(Goal).where(Goal.id == current.parent_goal_id))
            current = result.scalar_one_or_none()
        else:
            break

    # Assign by type (bottom-up)
    for g in hierarchy:
        if g.goal_type == "mission":
            context.mission = g.title
        elif g.goal_type == "objective":
            context.objective = g.title
        elif g.goal_type == "key_result":
            context.key_result = g.title

    return context


async def auto_calculate_progress(db: AsyncSession, goal_id: int) -> int:
    """Calculate progress from sub-goals, direct tasks, or both.

    - Tasks only: average of task status progress values
    - Sub-goals only: average of sub-goal progress values
    - Both: weighted combination where direct tasks count as one group
      and each sub-goal counts as one group.
      E.g. 2 tasks (1 done) + 2 sub-goals (80%, 60%) = (50% + 80% + 60%) / 3 = 63%
    """
    # Fetch sub-goal progress values
    result = await db.execute(
        select(Goal.progress).where(Goal.parent_goal_id == goal_id)
    )
    children_progress = result.scalars().all()

    # Fetch direct task statuses (excluding cancelled)
    result = await db.execute(
        select(Task.status).where(Task.goal_id == goal_id)
    )
    task_statuses = [s for s in result.scalars().all() if s != "cancelled"]

    # Calculate direct tasks group progress
    task_group_progress = None
    if task_statuses:
        total = sum(TASK_STATUS_PROGRESS.get(s, 0) for s in task_statuses)
        task_group_progress = total / len(task_statuses)

    has_children = len(children_progress) > 0
    has_tasks = task_group_progress is not None

    if not has_children and not has_tasks:
        return 0

    if has_tasks and not has_children:
        return round(task_group_progress)

    if has_children and not has_tasks:
        return round(sum(children_progress) / len(children_progress))

    # Both: direct tasks as one group + each sub-goal as one group
    groups = [task_group_progress] + list(children_progress)
    return round(sum(groups) / len(groups))


async def recalculate_goal_progress(db: AsyncSession, goal_id: int) -> None:
    """Recalculate and persist progress for a goal and all its ancestors."""
    visited = set()
    current_id = goal_id

    while current_id and current_id not in visited:
        visited.add(current_id)

        result = await db.execute(select(Goal).where(Goal.id == current_id))
        goal = result.scalar_one_or_none()
        if not goal:
            break

        new_progress = await auto_calculate_progress(db, current_id)
        old_progress = goal.progress
        goal.progress = new_progress
        logger.info(
            "Goal %d (%s) progress recalculated: %d%% -> %d%%",
            current_id, goal.title, old_progress, new_progress,
        )

        current_id = goal.parent_goal_id

    await db.flush()


async def get_goal_tree(db: AsyncSession, org_id: int, status: str | None = None) -> list[dict]:
    """Build full goal tree using recursive CTE."""
    status_filter = ""
    params = {"org_id": org_id}
    if status:
        status_filter = "AND g.status = :status"
        params["status"] = status

    query = text(f"""
        WITH RECURSIVE goal_tree AS (
            SELECT g.*, 0 AS depth
            FROM goals g
            WHERE g.org_id = :org_id AND g.parent_goal_id IS NULL {status_filter}

            UNION ALL

            SELECT g.*, gt.depth + 1
            FROM goals g
            INNER JOIN goal_tree gt ON g.parent_goal_id = gt.id
            WHERE g.org_id = :org_id
        )
        SELECT gt.*,
            (SELECT COUNT(*) FROM goals c WHERE c.parent_goal_id = gt.id) AS children_count,
            (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = gt.id) AS tasks_count
        FROM goal_tree gt
        ORDER BY gt.depth, gt.sort_order, gt.created_at
    """)

    result = await db.execute(query, params)
    rows = result.mappings().all()

    # Build nested tree from flat rows
    goals_by_id = {}
    roots = []

    for row in rows:
        goal_dict = {
            "id": row["id"],
            "org_id": row["org_id"],
            "parent_goal_id": row["parent_goal_id"],
            "title": row["title"],
            "description": row["description"],
            "goal_type": row["goal_type"],
            "status": row["status"],
            "owner_type": row["owner_type"],
            "owner_id": row["owner_id"],
            "target_date": row["target_date"],
            "progress": row["progress"],
            "department_id": row["department_id"],
            "board_id": row["board_id"],
            "sort_order": row["sort_order"],
            "children_count": row["children_count"],
            "tasks_count": row["tasks_count"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "children": [],
        }
        goals_by_id[row["id"]] = goal_dict

        if row["parent_goal_id"] is None:
            roots.append(goal_dict)
        elif row["parent_goal_id"] in goals_by_id:
            goals_by_id[row["parent_goal_id"]]["children"].append(goal_dict)

    return roots


async def get_goal_depth(db: AsyncSession, goal_id: int) -> int:
    """Get the depth of a goal (0 = root/mission)."""
    depth = 0
    current_id = goal_id
    visited = set()
    while current_id and current_id not in visited:
        visited.add(current_id)
        result = await db.execute(
            select(Goal.parent_goal_id).where(Goal.id == current_id)
        )
        parent_id = result.scalar_one_or_none()
        if parent_id is None:
            break
        depth += 1
        current_id = parent_id
    return depth


def build_goal_prompt_context(context: GoalContext) -> str:
    """Build the strategic context string for prompt injection."""
    parts = ["\n\n## Strategic Context"]
    if context.mission:
        parts.append(f"Company Mission: {context.mission}")
    if context.objective:
        parts.append(f"Current Objective: {context.objective}")
    if context.key_result:
        parts.append(f"Key Result: {context.key_result}")
    parts.append("\nKeep this strategic context in mind when executing this task. Your work should contribute toward these goals.")
    return "\n".join(parts)
