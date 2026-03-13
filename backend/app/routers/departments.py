from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.department import Department
from app.schemas.department import DepartmentOut

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("/", response_model=list[DepartmentOut])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(Department).order_by(Department.id))
    return [DepartmentOut.model_validate(d) for d in result.scalars().all()]
