from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user
from app.models.board import Board
from app.models.department import Department
from app.models.board_permission import BoardPermission
from app.models.user import User
from app.schemas.board import BoardOut
from app.services.permissions import (
    filter_boards_by_permission,
    check_board_access,
    get_user_board_permission,
)

router = APIRouter(prefix="/boards", tags=["boards"])


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
