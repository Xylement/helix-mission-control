from datetime import datetime
from pydantic import BaseModel

from app.schemas.agent import AgentOut
from app.schemas.auth import UserOut


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    board_id: int
    assigned_agent_id: int | None = None
    due_date: datetime | None = None
    requires_approval: bool = False


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    assigned_agent_id: int | None = None
    due_date: datetime | None = None
    requires_approval: bool | None = None
    result: str | None = None
    archived: bool | None = None


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    status: str
    priority: str
    board_id: int
    assigned_agent_id: int | None = None
    assigned_agent: AgentOut | None = None
    created_by_user_id: int
    created_by: UserOut | None = None
    due_date: datetime | None = None
    requires_approval: bool
    result: str | None = None
    archived: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
