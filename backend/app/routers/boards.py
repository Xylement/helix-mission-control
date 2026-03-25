from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, delete as sql_delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user
from app.models.board import Board
from app.models.department import Department
from app.models.task import Task
from app.models.comment import Comment
from app.models.board_permission import BoardPermission
from app.models.activity import ActivityLog
from app.models.user import User
from app.schemas.board import BoardOut, BoardCreate, BoardUpdate
from app.services.permissions import (
    filter_boards_by_permission,
    check_board_access,
    get_user_board_permission,
)

router = APIRouter(prefix="/boards", tags=["boards"])


async def _check_manage_permission(db: AsyncSession, user):
    """Check if user is admin or has manage permission on any board."""
    if getattr(user, "role", None) == "admin" or getattr(user, "is_service_token", False):
        return
    result = await db.execute(
        select(BoardPermission).where(
            BoardPermission.user_id == user.id,
            BoardPermission.permission_level == "manage",
        ).limit(1)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Insufficient permission")


@router.get("/", response_model=list[BoardOut])
async def list_boards(
    department_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = getattr(user, "org_id", None)
    q = (
        select(Board)
        .join(Department)
        .options(selectinload(Board.department))
        .where(Department.org_id == org_id)
        .order_by(Board.id)
    )
    if department_id:
        q = q.where(Board.department_id == department_id)
    result = await db.execute(q)
    boards = result.scalars().all()

    filtered, perm_map = await filter_boards_by_permission(db, user, boards)

    out = []
    for b in filtered:
        bo = BoardOut.model_validate(b)
        bo.user_permission = perm_map.get(b.id, "manage")
        out.append(bo)
    return out


@router.get("/{board_id}", response_model=BoardOut)
async def get_board(
    board_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = getattr(user, "org_id", None)
    result = await db.execute(
        select(Board)
        .join(Department)
        .options(selectinload(Board.department))
        .where(Board.id == board_id, Department.org_id == org_id)
    )
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    await check_board_access(db, user, board_id, "view")

    level = await get_user_board_permission(db, user, board_id)
    bo = BoardOut.model_validate(board)
    bo.user_permission = level
    return bo


@router.post("/", response_model=BoardOut)
async def create_board(
    body: BoardCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    await _check_manage_permission(db, user)
    org_id = getattr(user, "org_id", None)

    # Verify department belongs to user's org
    dept_result = await db.execute(
        select(Department).where(Department.id == body.department_id, Department.org_id == org_id)
    )
    if not dept_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Department not found")

    board = Board(
        name=body.name,
        description=body.description,
        department_id=body.department_id,
        sort_order=body.sort_order,
    )
    db.add(board)
    await db.flush()

    db.add(ActivityLog(
        org_id=org_id,
        actor_type="user", actor_id=user.id, action="board.created",
        entity_type="board", entity_id=board.id,
        details={"name": board.name, "department_id": body.department_id},
    ))
    await db.commit()
    await db.refresh(board, ["department"])
    bo = BoardOut.model_validate(board)
    return bo


@router.patch("/{board_id}", response_model=BoardOut)
async def update_board(
    board_id: int,
    body: BoardUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    await _check_manage_permission(db, user)
    org_id = getattr(user, "org_id", None)

    result = await db.execute(
        select(Board)
        .join(Department)
        .options(selectinload(Board.department))
        .where(Board.id == board_id, Department.org_id == org_id)
    )
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(board, k, v)

    db.add(ActivityLog(
        org_id=org_id,
        actor_type="user", actor_id=user.id, action="board.updated",
        entity_type="board", entity_id=board.id,
        details=updates,
    ))
    await db.commit()
    await db.refresh(board, ["department"])
    bo = BoardOut.model_validate(board)
    return bo


@router.delete("/{board_id}")
async def delete_board(
    board_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    # Admin only for delete
    if getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Admin required")

    org_id = getattr(user, "org_id", None)
    result = await db.execute(
        select(Board)
        .join(Department)
        .where(Board.id == board_id, Department.org_id == org_id)
    )
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")

    board_name = board.name

    # Count tasks
    task_count = (await db.execute(
        select(func.count(Task.id)).where(Task.board_id == board_id)
    )).scalar() or 0

    # Delete comments on tasks in this board
    task_ids_result = await db.execute(
        select(Task.id).where(Task.board_id == board_id)
    )
    task_ids = [r[0] for r in task_ids_result.all()]
    if task_ids:
        await db.execute(sql_delete(Comment).where(Comment.task_id.in_(task_ids)))
        from app.models.attachment import TaskAttachment
        await db.execute(sql_delete(TaskAttachment).where(TaskAttachment.task_id.in_(task_ids)))

    # Delete tasks
    await db.execute(sql_delete(Task).where(Task.board_id == board_id))

    # Delete board permissions
    await db.execute(sql_delete(BoardPermission).where(BoardPermission.board_id == board_id))

    # Nullify agents pointing to this board
    from app.models.agent import Agent
    await db.execute(
        update(Agent).where(Agent.primary_board_id == board_id).values(primary_board_id=None)
    )

    await db.delete(board)

    db.add(ActivityLog(
        org_id=org_id,
        actor_type="user", actor_id=user.id, action="board.deleted",
        entity_type="board", entity_id=board_id,
        details={"name": board_name, "tasks_deleted": task_count},
    ))
    await db.commit()

    return {"deleted": True, "tasks_deleted": task_count}
