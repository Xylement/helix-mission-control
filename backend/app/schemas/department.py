from datetime import datetime
from pydantic import BaseModel


class DepartmentOut(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
