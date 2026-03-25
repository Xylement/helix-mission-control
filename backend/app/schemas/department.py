from datetime import datetime
from pydantic import BaseModel


class DepartmentOut(BaseModel):
    id: int
    name: str
    emoji: str | None = None
    sort_order: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str
    emoji: str = "📋"
    sort_order: int = 0


class DepartmentUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None
