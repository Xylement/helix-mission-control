from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.department import Department
from app.models.board import Board
from app.models.task import Task
from app.models.comment import Comment
from app.models.activity import ActivityLog
from app.models.board_permission import BoardPermission
from app.models.user import User
from app.schemas.department import DepartmentOut, DepartmentCreate, DepartmentUpdate
from app.services.permissions import has_permission, get_user_board_permission

router = APIRouter(prefix="/departments", tags=["departments"])


async def _check_manage_permission(db: AsyncSession, user: User):
    """Check if user is admin or has manage permission on any board."""
    if getattr(user, "role", None) == "admin" or getattr(user, "is_service_token", False):
        return
    # Check if user has manage permission on any board
    result = await db.execute(
        select(BoardPermission).where(
            BoardPermission.user_id == user.id,
            BoardPermission.permission_level == "manage",
        ).limit(1)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Insufficient permission")


@router.get("/", response_model=list[DepartmentOut])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Department)
        .where(Department.org_id == user.org_id)
        .order_by(Department.sort_order, Department.id)
    )
    return [DepartmentOut.model_validate(d) for d in result.scalars().all()]


@router.post("/", response_model=DepartmentOut)
async def create_department(
    body: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _check_manage_permission(db, user)

    dept = Department(
        name=body.name,
        emoji=body.emoji,
        sort_order=body.sort_order,
        org_id=user.org_id,
    )
    db.add(dept)
    await db.flush()

    db.add(ActivityLog(
        org_id=user.org_id,
        actor_type="user", actor_id=user.id, action="department.created",
        entity_type="department", entity_id=dept.id,
        details={"name": dept.name},
    ))
    await db.commit()
    await db.refresh(dept)
    return DepartmentOut.model_validate(dept)


@router.patch("/{department_id}", response_model=DepartmentOut)
async def update_department(
    department_id: int,
    body: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _check_manage_permission(db, user)

    result = await db.execute(
        select(Department).where(
            Department.id == department_id, Department.org_id == user.org_id
        )
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(dept, k, v)

    db.add(ActivityLog(
        org_id=user.org_id,
        actor_type="user", actor_id=user.id, action="department.updated",
        entity_type="department", entity_id=dept.id,
        details=updates,
    ))
    await db.commit()
    await db.refresh(dept)
    return DepartmentOut.model_validate(dept)


@router.delete("/{department_id}")
async def delete_department(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Admin only for delete
    if getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Admin required")

    result = await db.execute(
        select(Department).where(
            Department.id == department_id, Department.org_id == user.org_id
        )
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    dept_name = dept.name

    # Get boards in this department
    boards_result = await db.execute(
        select(Board).where(Board.department_id == department_id)
    )
    dept_boards = boards_result.scalars().all()
    board_ids = [b.id for b in dept_boards]
    board_count = len(board_ids)

    # Count tasks
    task_count = 0
    if board_ids:
        task_count = (await db.execute(
            select(func.count(Task.id)).where(Task.board_id.in_(board_ids))
        )).scalar() or 0

        # Delete comments on those tasks
        task_ids_result = await db.execute(
            select(Task.id).where(Task.board_id.in_(board_ids))
        )
        task_ids = [r[0] for r in task_ids_result.all()]
        if task_ids:
            await db.execute(sql_delete(Comment).where(Comment.task_id.in_(task_ids)))
            # Delete task attachments
            from app.models.attachment import TaskAttachment
            await db.execute(sql_delete(TaskAttachment).where(TaskAttachment.task_id.in_(task_ids)))

        # Delete tasks
        await db.execute(sql_delete(Task).where(Task.board_id.in_(board_ids)))

        # Delete board permissions
        await db.execute(sql_delete(BoardPermission).where(BoardPermission.board_id.in_(board_ids)))

        # Nullify agents pointing to these boards
        from app.models.agent import Agent
        from sqlalchemy import update
        await db.execute(
            update(Agent).where(Agent.primary_board_id.in_(board_ids)).values(primary_board_id=None)
        )
        # Nullify agents pointing to this department
        await db.execute(
            update(Agent).where(Agent.department_id == department_id).values(department_id=None)
        )

        # Delete boards
        await db.execute(sql_delete(Board).where(Board.department_id == department_id))

    await db.delete(dept)

    db.add(ActivityLog(
        org_id=user.org_id,
        actor_type="user", actor_id=user.id, action="department.deleted",
        entity_type="department", entity_id=department_id,
        details={"name": dept_name, "boards_deleted": board_count, "tasks_deleted": task_count},
    ))
    await db.commit()

    return {"deleted": True, "boards_deleted": board_count, "tasks_deleted": task_count}
