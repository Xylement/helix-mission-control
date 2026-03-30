from datetime import datetime
from pydantic import BaseModel, model_validator

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
    tags: list[str] | None = None
    goal_id: int | None = None


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
    tags: list[str] | None = None
    goal_id: int | None = None


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
    tags: list[str] | None = None
    goal_id: int | None = None
    goal_title: str | None = None
    archived: bool = False
    traces_count: int = 0
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="wrap")
    @classmethod
    def extract_goal_title(cls, data, handler):
        # If data is a SQLAlchemy model, extract goal_title from relationship
        goal_title = None
        if hasattr(data, "goal") and data.goal is not None:
            goal_title = data.goal.title
        # Extract traces_count if set as attribute
        traces_count = getattr(data, "_traces_count", 0) if hasattr(data, "_traces_count") else 0
        result = handler(data)
        if goal_title and not result.goal_title:
            result.goal_title = goal_title
        if traces_count:
            result.traces_count = traces_count
        return result

    class Config:
        from_attributes = True
