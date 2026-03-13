from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, exists
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user
from app.models.board import Board
from app.models.board_permission import BoardPermission
from app.schemas.board import BoardOut

router = APIRouter(prefix="/boards", tags=["boards"])


@router.get("/", response_model=list[BoardOut])
async def list_boards(
    department_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = select(Board).options(selectinload(Board.department)).order_by(Board.id)
    if department_id:
        q = q.where(Board.department_id == department_id)
    result = await db.execute(q)
    boards = result.scalars().all()

    # Filter by permissions if user is not admin
    is_admin = getattr(user, "role", None) == "admin" or getattr(user, "is_service_token", False)
    if is_admin:
        return [BoardOut.model_validate(b) for b in boards]

    filtered = []
    for b in boards:
        # Check if board has any permissions set
        has_perms = (await db.execute(
            select(exists().where(BoardPermission.board_id == b.id))
        )).scalar()
        if not has_perms:
            # No permissions = open to all
            filtered.append(b)
        else:
            # Check if user has at least view
            user_perm = (await db.execute(
                select(BoardPermission).where(
                    BoardPermission.board_id == b.id,
                    BoardPermission.user_id == user.id,
                )
            )).scalar_one_or_none()
            if user_perm:
                filtered.append(b)
    return [BoardOut.model_validate(b) for b in filtered]
