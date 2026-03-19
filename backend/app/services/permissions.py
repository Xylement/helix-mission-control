from sqlalchemy import select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board_permission import BoardPermission

PERMISSION_LEVELS = {"no_access": -1, "view": 0, "create": 1, "manage": 2}


def _is_admin(user) -> bool:
    return getattr(user, "role", None) == "admin" or getattr(user, "is_service_token", False)


async def get_user_board_permission(db: AsyncSession, user, board_id: int) -> str:
    """
    Get the user's effective permission level for a specific board.

    Rules:
    - Admin/service users always have "manage"
    - If board has NO permissions set at all -> "manage" (default open)
    - If board HAS permissions set but user isn't listed -> "no_access"
    - Otherwise return the user's explicit permission level
    """
    if _is_admin(user):
        return "manage"

    has_perms = (await db.execute(
        select(exists().where(BoardPermission.board_id == board_id))
    )).scalar()
    if not has_perms:
        return "manage"  # default open: no permissions configured = full access

    user_perm = (await db.execute(
        select(BoardPermission.permission_level).where(
            BoardPermission.board_id == board_id,
            BoardPermission.user_id == user.id,
        )
    )).scalar_one_or_none()

    return user_perm or "no_access"


def has_permission(user_level: str, required_level: str) -> bool:
    """Check if user_level meets or exceeds required_level."""
    return PERMISSION_LEVELS.get(user_level, -1) >= PERMISSION_LEVELS.get(required_level, -1)


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
                "message": f"You don't have permission to perform this action on this board",
                "required": required,
                "current": level,
            },
        )


async def get_accessible_board_ids(
    db: AsyncSession, user, min_permission: str = "view"
) -> list[int] | None:
    """
    Get board IDs the user can access at the given permission level or above.
    Returns None for admin/service users (meaning "all boards").
    """
    if _is_admin(user):
        return None  # no filtering needed

    # Get all boards that have permissions configured
    boards_with_perms_q = select(BoardPermission.board_id).distinct()
    boards_with_perms_result = await db.execute(boards_with_perms_q)
    boards_with_perms = set(boards_with_perms_result.scalars().all())

    # Get boards where user has sufficient permission
    user_perms_result = await db.execute(
        select(BoardPermission.board_id, BoardPermission.permission_level).where(
            BoardPermission.user_id == user.id
        )
    )
    user_perms = {row[0]: row[1] for row in user_perms_result.all()}

    accessible = []

    # Boards WITHOUT any permissions -> default open (manage for all)
    # We can't enumerate these here, so we'll need to handle this in the query.
    # Instead, return a tuple: (explicitly_accessible_ids, boards_with_perms_set)
    # Actually, let's return accessible IDs plus a flag.
    # Simpler approach: return accessible + mark which boards have restrictions.

    # For boards WITH permissions: only include if user has sufficient level
    for board_id, level in user_perms.items():
        if has_permission(level, min_permission):
            accessible.append(board_id)

    return accessible, boards_with_perms


async def filter_boards_by_permission(
    db: AsyncSession, user, boards, min_permission: str = "view"
) -> list:
    """
    Filter a list of board objects to only those the user can access.
    Also returns a dict of board_id -> permission_level.
    """
    if _is_admin(user):
        return boards, {b.id: "manage" for b in boards}

    # Get all boards that have permissions configured
    boards_with_perms_result = await db.execute(
        select(BoardPermission.board_id).distinct()
    )
    boards_with_perms = set(boards_with_perms_result.scalars().all())

    # Get user's explicit permissions
    user_perms_result = await db.execute(
        select(BoardPermission.board_id, BoardPermission.permission_level).where(
            BoardPermission.user_id == user.id
        )
    )
    user_perms = {row[0]: row[1] for row in user_perms_result.all()}

    filtered = []
    perm_map = {}
    for b in boards:
        if b.id not in boards_with_perms:
            # No permissions configured -> default open
            level = "manage"
        elif b.id in user_perms:
            level = user_perms[b.id]
        else:
            level = "no_access"

        if has_permission(level, min_permission):
            filtered.append(b)
            perm_map[b.id] = level

    return filtered, perm_map


async def get_accessible_board_ids_for_query(
    db: AsyncSession, user
) -> tuple[bool, set[int], set[int]]:
    """
    Returns (is_admin, boards_with_restrictions, user_accessible_restricted_board_ids).

    Usage in queries:
    - If is_admin: no filtering needed
    - Otherwise: include tasks where board_id NOT IN boards_with_restrictions
                  OR board_id IN user_accessible_restricted_board_ids
    """
    if _is_admin(user):
        return True, set(), set()

    boards_with_perms_result = await db.execute(
        select(BoardPermission.board_id).distinct()
    )
    boards_with_perms = set(boards_with_perms_result.scalars().all())

    user_perms_result = await db.execute(
        select(BoardPermission.board_id, BoardPermission.permission_level).where(
            BoardPermission.user_id == user.id
        )
    )
    user_accessible = set()
    for board_id, level in user_perms_result.all():
        if has_permission(level, "view"):
            user_accessible.add(board_id)

    return False, boards_with_perms, user_accessible
