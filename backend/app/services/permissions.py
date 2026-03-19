"""
Board permission service — default-closed model.

Members have NO access to any board unless explicitly granted.
Admin and service-token users always have full access.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board_permission import BoardPermission

PERMISSION_LEVELS = {"no_access": -1, "view": 0, "create": 1, "manage": 2}


def _is_admin(user) -> bool:
    return getattr(user, "role", None) == "admin" or getattr(user, "is_service_token", False)


def has_permission(user_level: str, required_level: str) -> bool:
    """Check if user_level meets or exceeds required_level."""
    return PERMISSION_LEVELS.get(user_level, -1) >= PERMISSION_LEVELS.get(required_level, -1)


async def get_user_board_permission(db: AsyncSession, user, board_id: int) -> str:
    """
    Get the user's effective permission level for a specific board.

    - Admin/service users -> "manage"
    - Members -> whatever is in the DB, or "no_access" if no record
    """
    if _is_admin(user):
        return "manage"

    user_perm = (await db.execute(
        select(BoardPermission.permission_level).where(
            BoardPermission.board_id == board_id,
            BoardPermission.user_id == user.id,
        )
    )).scalar_one_or_none()

    return user_perm or "no_access"


async def check_board_access(db: AsyncSession, user, board_id: int, required: str):
    """
    Check if user has at least the required permission level.
    Raises HTTPException(403) if not.
    """
    from fastapi import HTTPException

    level = await get_user_board_permission(db, user, board_id)
    if not has_permission(level, required):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "insufficient_permission",
                "message": "You don't have permission to perform this action on this board",
                "required": required,
                "current": level,
            },
        )


async def filter_boards_by_permission(
    db: AsyncSession, user, boards, min_permission: str = "view"
):
    """
    Filter a list of board objects to only those the user can access.
    Returns (filtered_boards, perm_map: {board_id: level}).
    """
    if _is_admin(user):
        return boards, {b.id: "manage" for b in boards}

    # Single query: get all of this user's permissions
    user_perms_result = await db.execute(
        select(BoardPermission.board_id, BoardPermission.permission_level).where(
            BoardPermission.user_id == user.id
        )
    )
    user_perms = {row[0]: row[1] for row in user_perms_result.all()}

    filtered = []
    perm_map = {}
    for b in boards:
        level = user_perms.get(b.id, "no_access")
        if has_permission(level, min_permission):
            filtered.append(b)
            perm_map[b.id] = level

    return filtered, perm_map


async def get_user_accessible_board_ids(db: AsyncSession, user) -> tuple[bool, set[int]]:
    """
    Returns (is_admin, accessible_board_ids).
    For admins, is_admin=True and the set is empty (meaning all boards).
    For members, returns the set of board IDs with at least VIEW access.
    """
    if _is_admin(user):
        return True, set()

    user_perms_result = await db.execute(
        select(BoardPermission.board_id, BoardPermission.permission_level).where(
            BoardPermission.user_id == user.id
        )
    )
    accessible = set()
    for board_id, level in user_perms_result.all():
        if has_permission(level, "view"):
            accessible.add(board_id)

    return False, accessible
