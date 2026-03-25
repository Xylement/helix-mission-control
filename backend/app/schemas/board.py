from datetime import datetime
from pydantic import BaseModel

from app.schemas.department import DepartmentOut


class BoardOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    department_id: int
    department: DepartmentOut | None = None
    created_at: datetime
    user_permission: str | None = None  # view | create | manage (None for admin)

    class Config:
        from_attributes = True


class BoardCreate(BaseModel):
    name: str
    description: str | None = None
    department_id: int
    sort_order: int = 0


class BoardUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
