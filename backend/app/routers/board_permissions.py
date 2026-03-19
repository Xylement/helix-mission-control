from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.board import Board
from app.models.department import Department
from app.models.board_permission import BoardPermission
from app.models.user import User
from app.schemas.board_permission import BoardPermissionCreate, BoardPermissionUpdate, BoardPermissionOut

router = APIRouter(prefix="/boards", tags=["board-permissions"])


async def _get_board_in_org(db: AsyncSession, board_id: int, org_id: int) -> Board | None:
    result = await db.execute(
        select(Board)
        .join(Department)
        .where(Board.id == board_id, Department.org_id == org_id)
    )
    return result.scalar_one_or_none()


@router.get("/{board_id}/permissions", response_model=list[BoardPermissionOut])
async def list_permissions(
    board_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    board = await _get_board_in_org(db, board_id, user.org_id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    result = await db.execute(
        select(BoardPermission).where(BoardPermission.board_id == board_id)
    )
    perms = result.scalars().all()
    out = []
    for p in perms:
        u = (await db.execute(select(User).where(User.id == p.user_id))).scalar_one_or_none()
        out.append(BoardPermissionOut(
            id=p.id,
            board_id=p.board_id,
            user_id=p.user_id,
            user_name=u.name if u else "",
            user_email=u.email if u else "",
            permission_level=p.permission_level,
            granted_by_user_id=p.granted_by_user_id,
            created_at=p.created_at,
        ))
    return out


@router.post("/{board_id}/permissions", response_model=BoardPermissionOut, status_code=201)
async def grant_permission(
    board_id: int,
    body: BoardPermissionCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    board = await _get_board_in_org(db, board_id, org_id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    if body.permission_level not in ("no_access", "view", "create", "manage"):
        raise HTTPException(status_code=400, detail="Invalid permission level")
    # Target user must be in same org
    target_user = (await db.execute(
        select(User).where(User.id == body.user_id, User.org_id == org_id)
    )).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (await db.execute(
        select(BoardPermission).where(
            BoardPermission.board_id == board_id,
            BoardPermission.user_id == body.user_id,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="User already has permission on this board")

    perm = BoardPermission(
        board_id=board_id,
        user_id=body.user_id,
        permission_level=body.permission_level,
        granted_by_user_id=user.id,
    )
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    return BoardPermissionOut(
        id=perm.id,
        board_id=perm.board_id,
        user_id=perm.user_id,
        user_name=target_user.name,
        user_email=target_user.email,
        permission_level=perm.permission_level,
        granted_by_user_id=perm.granted_by_user_id,
        created_at=perm.created_at,
    )


@router.patch("/{board_id}/permissions/{perm_id}", response_model=BoardPermissionOut)
async def update_permission(
    board_id: int,
    perm_id: int,
    body: BoardPermissionUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    board = await _get_board_in_org(db, board_id, user.org_id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    perm = (await db.execute(
        select(BoardPermission).where(BoardPermission.id == perm_id, BoardPermission.board_id == board_id)
    )).scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    if body.permission_level not in ("no_access", "view", "create", "manage"):
        raise HTTPException(status_code=400, detail="Invalid permission level")
    perm.permission_level = body.permission_level
    await db.commit()
    await db.refresh(perm)
    u = (await db.execute(select(User).where(User.id == perm.user_id))).scalar_one_or_none()
    return BoardPermissionOut(
        id=perm.id,
        board_id=perm.board_id,
        user_id=perm.user_id,
        user_name=u.name if u else "",
        user_email=u.email if u else "",
        permission_level=perm.permission_level,
        granted_by_user_id=perm.granted_by_user_id,
        created_at=perm.created_at,
    )


@router.delete("/{board_id}/permissions/{perm_id}", status_code=204)
async def revoke_permission(
    board_id: int,
    perm_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    board = await _get_board_in_org(db, board_id, user.org_id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    perm = (await db.execute(
        select(BoardPermission).where(BoardPermission.id == perm_id, BoardPermission.board_id == board_id)
    )).scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    await db.delete(perm)
    await db.commit()
