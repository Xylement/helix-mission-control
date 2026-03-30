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
    parent_task_id: int | None = None
    delegated_by_agent_id: int | None = None


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
    parent_task_id: int | None = None
    delegation_status: str | None = None
    delegated_by_agent_id: int | None = None
    delegated_by_agent_name: str | None = None
    sub_tasks_count: int = 0
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="wrap")
    @classmethod
    def extract_extra_fields(cls, data, handler):
        # If data is a SQLAlchemy model, extract goal_title from relationship
        goal_title = None
        if hasattr(data, "goal") and data.goal is not None:
            goal_title = data.goal.title
        # Extract traces_count if set as attribute
        traces_count = getattr(data, "_traces_count", 0) if hasattr(data, "_traces_count") else 0
        # Extract sub_tasks_count if set as attribute
        sub_tasks_count = getattr(data, "_sub_tasks_count", 0) if hasattr(data, "_sub_tasks_count") else 0
        # Extract delegated_by_agent_name from relationship
        delegated_by_agent_name = None
        if hasattr(data, "delegated_by_agent") and data.delegated_by_agent is not None:
            delegated_by_agent_name = data.delegated_by_agent.name
        result = handler(data)
        if goal_title and not result.goal_title:
            result.goal_title = goal_title
        if traces_count:
            result.traces_count = traces_count
        if sub_tasks_count:
            result.sub_tasks_count = sub_tasks_count
        if delegated_by_agent_name:
            result.delegated_by_agent_name = delegated_by_agent_name
        return result

    class Config:
        from_attributes = True


class DelegationRequest(BaseModel):
    target_agent_id: int
    title: str
    description: str
    priority: str = "medium"
    board_id: int | None = None
    tags: list[str] | None = None
    requires_approval: bool = True


class DelegationTreeNode(BaseModel):
    task: TaskOut
    sub_tasks: list["DelegationTreeNode"] = []

    class Config:
        from_attributes = True
