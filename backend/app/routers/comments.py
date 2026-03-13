import asyncio
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user
from app.models.comment import Comment
from app.models.task import Task
from app.models.board import Board
from app.models.department import Department
from app.models.user import User
from app.models.agent import Agent
from app.models.activity import ActivityLog
from app.schemas.comment import CommentCreate, CommentOut
from app.services.activity import log_activity
from app.services.gateway import gateway
from app.services.notifications import create_notification

logger = logging.getLogger("helix.comments")

router = APIRouter(prefix="/tasks/{task_id}/comments", tags=["comments"])

MENTION_RE = re.compile(r"@(\w+)")


async def resolve_mentions(content: str, db: AsyncSession) -> dict:
    names = MENTION_RE.findall(content)
    if not names:
        return {}
    user_ids = []
    agent_ids = []
    for name in names:
        u = (await db.execute(select(User).where(User.name == name))).scalar_one_or_none()
        if u:
            user_ids.append(u.id)
            continue
        a = (await db.execute(select(Agent).where(Agent.name == name))).scalar_one_or_none()
        if a:
            agent_ids.append(a.id)
    result = {}
    if user_ids:
        result["users"] = user_ids
    if agent_ids:
        result["agents"] = agent_ids
    return result


async def get_author_name(author_type: str, author_id: int, db: AsyncSession) -> str | None:
    if author_type == "user":
        u = (await db.execute(select(User).where(User.id == author_id))).scalar_one_or_none()
        return u.name if u else None
    elif author_type == "agent":
        a = (await db.execute(select(Agent).where(Agent.id == author_id))).scalar_one_or_none()
        return a.name if a else None
    return None


@router.get("/", response_model=list[CommentOut])
async def list_comments(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Comment).where(Comment.task_id == task_id).order_by(Comment.created_at)
    )
    comments = result.scalars().all()
    out = []
    for c in comments:
        name = await get_author_name(c.author_type, c.author_id, db)
        co = CommentOut.model_validate(c)
        co.author_name = name
        out.append(co)
    return out


@router.post("/", response_model=CommentOut, status_code=201)
async def create_comment(
    task_id: int,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify task exists (with assigned agent for Fix 8)
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assigned_agent))
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    mentions = await resolve_mentions(body.content, db)
    comment = Comment(
        task_id=task_id,
        author_type="user",
        author_id=user.id,
        content=body.content,
        mentions=mentions or None,
    )
    db.add(comment)
    meta: dict = {"task_title": task.title}
    board = (await db.execute(select(Board).where(Board.id == task.board_id))).scalar_one_or_none()
    if board:
        meta["board_name"] = board.name
        meta["board_id"] = board.id
        dept = (await db.execute(select(Department).where(Department.id == board.department_id))).scalar_one_or_none()
        if dept:
            meta["department_id"] = dept.id
            meta["department_name"] = dept.name
    if mentions.get("agents"):
        meta["mentioned_agents"] = mentions["agents"]
    if mentions.get("users"):
        meta["mentioned_users"] = mentions["users"]
    meta["actor_name"] = user.name
    await log_activity(db, "user", user.id, "comment.added", "task", task_id, meta)

    # Notify mentioned users
    for mentioned_user_id in mentions.get("users", []):
        if mentioned_user_id != user.id:
            await create_notification(
                db, mentioned_user_id, "mention", "You were mentioned",
                f"{user.name} mentioned you in '{task.title}'",
                target_type="task", target_id=task_id, org_id=user.org_id,
            )

    await db.commit()
    await db.refresh(comment)

    # Fix 7: Wake mentioned agents via gateway
    mentioned_agent_ids = set(mentions.get("agents", []))
    if mentioned_agent_ids and gateway.is_connected:
        for agent_id in mentioned_agent_ids:
            agent = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()
            if agent:
                asyncio.create_task(_wake_agent(agent, task, body.content))

    # Fix 8: Auto-notify assigned agent on review task comments (even without @mention)
    if (
        task.status == "review"
        and task.assigned_agent_id
        and gateway.is_connected
    ):
        # Only if assigned agent wasn't already @mentioned
        if task.assigned_agent_id not in mentioned_agent_ids:
            assigned_agent = task.assigned_agent
            if not assigned_agent:
                assigned_agent = (await db.execute(
                    select(Agent).where(Agent.id == task.assigned_agent_id)
                )).scalar_one_or_none()
            if assigned_agent:
                asyncio.create_task(_wake_agent(assigned_agent, task, body.content))

    co = CommentOut.model_validate(comment)
    co.author_name = user.name
    return co


async def _wake_agent(agent: Agent, task: Task, comment_content: str):
    """Background task to wake an agent for a mention/review comment."""
    try:
        await gateway.send_mention_chat(agent, task, comment_content)
    except Exception as e:
        logger.error("Failed to wake agent %s for task %d: %s", agent.name, task.id, e)
