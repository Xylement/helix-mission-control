"""
Delegation endpoints — create sub-tasks, query delegation trees.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user
from app.schemas.task import DelegationRequest, TaskOut, DelegationTreeNode
from app.services.delegation_service import (
    create_delegation,
    get_sub_tasks,
    get_delegation_tree,
)

logger = logging.getLogger("helix.delegations")

router = APIRouter(prefix="/tasks", tags=["delegations"])


def _get_org_id(user):
    return getattr(user, "org_id", None)


def _is_admin(user) -> bool:
    return getattr(user, "role", None) == "admin" or getattr(user, "is_service_token", False)


@router.post("/{task_id}/delegate", response_model=TaskOut, status_code=201)
async def delegate_task(
    task_id: int,
    body: DelegationRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a delegation (sub-task) from a parent task."""
    org_id = _get_org_id(user)
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only admins can create delegations")

    try:
        sub_task = await create_delegation(
            db=db,
            org_id=org_id,
            parent_task_id=task_id,
            delegating_agent_id=body.target_agent_id,  # Will be overridden — see below
            target_agent_id=body.target_agent_id,
            title=body.title,
            description=body.description,
            priority=body.priority,
            board_id=body.board_id,
            tags=body.tags,
            requires_approval=body.requires_approval,
        )
        await db.commit()
        await db.refresh(sub_task, attribute_names=["assigned_agent", "created_by", "goal", "delegated_by_agent"])
        return TaskOut.model_validate(sub_task)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{task_id}/subtasks", response_model=list[TaskOut])
async def list_subtasks(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List direct sub-tasks of a task."""
    org_id = _get_org_id(user)
    tasks = await get_sub_tasks(db, task_id, org_id)
    return [TaskOut.model_validate(t) for t in tasks]


@router.get("/{task_id}/delegation-tree", response_model=DelegationTreeNode)
async def delegation_tree(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get full delegation tree for a task."""
    org_id = _get_org_id(user)
    try:
        tree = await get_delegation_tree(db, task_id, org_id)
        return tree
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
