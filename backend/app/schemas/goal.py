from datetime import datetime, date
from pydantic import BaseModel


class GoalCreate(BaseModel):
    title: str
    description: str | None = None
    goal_type: str = "objective"
    parent_goal_id: int | None = None
    department_id: int | None = None
    board_id: int | None = None
    owner_type: str | None = None
    owner_id: int | None = None
    target_date: date | None = None
    sort_order: int = 0


class GoalUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    goal_type: str | None = None
    parent_goal_id: int | None = None
    status: str | None = None
    owner_type: str | None = None
    owner_id: int | None = None
    target_date: date | None = None
    progress: int | None = None
    department_id: int | None = None
    board_id: int | None = None
    sort_order: int | None = None


class GoalOut(BaseModel):
    id: int
    org_id: int
    parent_goal_id: int | None = None
    title: str
    description: str | None = None
    goal_type: str
    status: str
    owner_type: str | None = None
    owner_id: int | None = None
    target_date: date | None = None
    progress: int
    department_id: int | None = None
    board_id: int | None = None
    sort_order: int
    created_by: int | None = None
    children_count: int = 0
    tasks_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GoalTree(BaseModel):
    id: int
    org_id: int
    parent_goal_id: int | None = None
    title: str
    description: str | None = None
    goal_type: str
    status: str
    owner_type: str | None = None
    owner_id: int | None = None
    target_date: date | None = None
    progress: int
    department_id: int | None = None
    board_id: int | None = None
    sort_order: int
    children_count: int = 0
    tasks_count: int = 0
    created_at: datetime
    updated_at: datetime
    children: list["GoalTree"] = []

    class Config:
        from_attributes = True


class GoalContext(BaseModel):
    mission: str | None = None
    objective: str | None = None
    key_result: str | None = None


class GoalProgressUpdate(BaseModel):
    progress: int | None = None
    auto: bool = False
