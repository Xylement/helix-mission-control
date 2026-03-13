from datetime import datetime
from pydantic import BaseModel

from app.schemas.department import DepartmentOut


class BoardOut(BaseModel):
    id: int
    name: str
    department_id: int
    department: DepartmentOut | None = None
    created_at: datetime

    class Config:
        from_attributes = True
