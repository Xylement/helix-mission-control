from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ─── Steps ───

class WorkflowStepCreate(BaseModel):
    step_id: str = Field(max_length=50)
    name: str = Field(max_length=200)
    agent_id: Optional[int] = None
    action_prompt: Optional[str] = None
    depends_on: List[str] = []
    timeout_minutes: int = 60
    requires_approval: bool = False
    step_order: int = 0
    position_x: int = 0
    position_y: int = 0
    config: Optional[dict] = None


class WorkflowStepUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    agent_id: Optional[int] = None
    action_prompt: Optional[str] = None
    depends_on: Optional[List[str]] = None
    timeout_minutes: Optional[int] = None
    requires_approval: Optional[bool] = None
    step_order: Optional[int] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    config: Optional[dict] = None


class WorkflowStepResponse(BaseModel):
    id: int
    step_id: str
    name: str
    agent_id: Optional[int] = None
    agent_name: Optional[str] = None
    agent_emoji: Optional[str] = None
    action_prompt: Optional[str] = None
    depends_on: List[str] = []
    timeout_minutes: int = 60
    requires_approval: bool = False
    step_order: int = 0
    position_x: int = 0
    position_y: int = 0
    config: Optional[dict] = None


# ─── Workflows ───

class WorkflowCreate(BaseModel):
    name: str = Field(max_length=200)
    description: Optional[str] = None
    trigger_type: str = "manual"
    trigger_config: Optional[dict] = None
    steps: Optional[List[WorkflowStepCreate]] = None


class WorkflowUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    trigger_type: Optional[str] = None
    trigger_config: Optional[dict] = None
    is_active: Optional[bool] = None


class WorkflowResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    trigger_type: str
    trigger_config: Optional[dict] = None
    is_active: bool
    marketplace_template_slug: Optional[str] = None
    step_count: int = 0
    agent_count: int = 0
    last_execution: Optional[dict] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class WorkflowDetailResponse(WorkflowResponse):
    steps: List[WorkflowStepResponse] = []


# ─── Executions ───

class ExecutionStart(BaseModel):
    input_data: Optional[dict] = None


class StepExecutionResponse(BaseModel):
    id: int
    step_id: str
    step_name: Optional[str] = None
    task_id: Optional[int] = None
    status: str
    input_data: Optional[dict] = None
    output_data: Optional[dict] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class ExecutionResponse(BaseModel):
    id: int
    workflow_id: int
    workflow_name: Optional[str] = None
    status: str
    input_data: Optional[dict] = None
    output_data: Optional[dict] = None
    started_by: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    step_executions: List[StepExecutionResponse] = []
    progress: Optional[dict] = None


class ExecutionListItem(BaseModel):
    id: int
    workflow_id: int
    status: str
    started_by: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    progress: Optional[dict] = None


# ─── Install ───

class WorkflowInstallRequest(BaseModel):
    template_slug: str
    agent_mapping: Optional[dict] = None  # { "hn-marketing-manager": 123 }
