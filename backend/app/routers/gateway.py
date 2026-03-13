from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.task import Task
from app.models.agent import Agent
from app.models.activity import ActivityLog
from app.models.user import User
from app.services.gateway import gateway

router = APIRouter(prefix="/gateway", tags=["gateway"])


@router.get("/status")
async def gateway_status(_user=Depends(get_current_user)):
    """Check OpenClaw Gateway connection status."""
    return {
        "connected": gateway.is_connected,
        "pending_tasks": len(gateway._active_chats),
    }


@router.post("/tasks/{task_id}/execute")
async def execute_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Manually trigger task execution via the OpenClaw Gateway.
    Used for agents with execution_mode="manual" when user clicks "Start".
    """
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assigned_agent))
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not task.assigned_agent_id:
        raise HTTPException(status_code=400, detail="Task has no assigned agent")

    agent = task.assigned_agent
    if not agent:
        raise HTTPException(status_code=400, detail="Assigned agent not found")

    if task.status not in ("todo", "rejected"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot execute task in '{task.status}' status. Must be 'todo' or 'rejected'.",
        )

    if not gateway.is_connected:
        raise HTTPException(status_code=503, detail="OpenClaw Gateway is not connected")

    # Update task status to in_progress
    task.status = "in_progress"
    agent.status = "busy"

    db.add(ActivityLog(
        actor_type="user",
        actor_id=user.id,
        action="task.dispatched",
        entity_type="task",
        entity_id=task.id,
        details={"agent": agent.name, "trigger": "manual"},
    ))

    await db.commit()
    await db.refresh(task)

    # Dispatch to gateway
    try:
        await gateway.dispatch_task(task, agent)
    except ConnectionError as e:
        # Revert status on failure
        task.status = "todo"
        agent.status = "online"
        await db.commit()
        raise HTTPException(status_code=503, detail=str(e))

    return {
        "message": f"Task dispatched to agent {agent.name}",
        "task_id": task.id,
        "agent": agent.name,
    }
