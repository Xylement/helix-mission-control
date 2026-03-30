from datetime import datetime
from pydantic import BaseModel


class AgentOut(BaseModel):
    id: int
    name: str
    role_title: str
    department_id: int
    primary_board_id: int
    system_prompt: str | None = None
    status: str
    execution_mode: str
    ai_model_id: int | None = None
    model_provider: str | None = None
    model_name: str | None = None
    monthly_budget_usd: float | None = None
    budget_paused: bool = False
    budget_pause_reason: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class AgentCreate(BaseModel):
    name: str
    role_title: str
    department_id: int
    primary_board_id: int
    system_prompt: str = ""
    execution_mode: str = "manual"


class AgentUpdate(BaseModel):
    status: str | None = None
    execution_mode: str | None = None
    system_prompt: str | None = None
    ai_model_id: int | None = None
    model_provider: str | None = None
    model_name: str | None = None


class BudgetStatus(BaseModel):
    budget_usd: float | None = None
    spent_usd: float = 0.0
    remaining_usd: float = 0.0
    percentage: float = 0.0
    warning: bool = False
    exceeded: bool = False
    budget_paused: bool = False
    budget_pause_reason: str | None = None
    reset_day: int = 1
    unlimited: bool = True


class BudgetUpdate(BaseModel):
    monthly_budget_usd: float | None = None
    budget_warning_threshold: float = 0.80
    budget_reset_day: int = 1
